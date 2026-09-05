"""
weather_service.py — Open-Meteo General Weather Forecast for SeaSarathi.

Design Decision:
  - Endpoint 1: https://api.open-meteo.com/v1/forecast (ecmwf_ifs, cell_selection=sea)
  - Endpoint 2: https://marine-api.open-meteo.com/v1/marine
  - Forecast : 3 days (hourly) for both
  - Variables (Weather): temperature_2m, precipitation, rain, visibility, weather_code, pressure_msl, wind_speed_10m, wind_direction_10m, wind_gusts_10m, cloud_cover
  - Variables (Marine): wave_height, wave_direction, wave_period, wind_wave_height, wind_wave_direction, wind_wave_period, swell_wave_height, swell_wave_direction, swell_wave_period, sea_surface_temperature

Geographic strategy:
  - Coordinates are obtained from marine_grid.generate_eez_grid()
  - Only EEZ-filtered points are sent to Open-Meteo
  - Multi-point requests use comma-separated lat/lon arrays
  - bounding_box is NOT used
  - Unified grid_point_id association.
"""

import os
import numpy as np
import pandas as pd
import requests_cache
import openmeteo_requests
from retry_requests import retry

# ── API Configuration ──────────────────────────────────────────────────────────

WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast"
MARINE_ENDPOINT  = "https://marine-api.open-meteo.com/v1/marine"

WEATHER_MODEL    = "ecmwf_ifs"
FORECAST_DAYS    = 3
CELL_SELECTION   = "sea"

WEATHER_VARIABLES = [
    "temperature_2m",
    "precipitation",
    "rain",
    "visibility",
    "weather_code",
    "pressure_msl",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "cloud_cover",
]

MARINE_VARIABLES = [
    "wave_height",
    "wave_direction",
    "wave_period",
    "wind_wave_height",
    "wind_wave_direction",
    "wind_wave_period",
    "swell_wave_height",
    "swell_wave_direction",
    "swell_wave_period",
    "sea_surface_temperature"
]

# Cache responses for 1 hour to avoid redundant API calls
_CACHE_EXPIRE_SECONDS = 3600

# ── Client Setup ───────────────────────────────────────────────────────────────

def _build_client() -> openmeteo_requests.Client:
    cache_dir = os.path.join(os.path.dirname(__file__), "..", "..", ".cache")
    os.makedirs(cache_dir, exist_ok=True)
    cache_path = os.path.join(cache_dir, "openmeteo_cache")

    cache_session = requests_cache.CachedSession(
        cache_path,
        expire_after=_CACHE_EXPIRE_SECONDS,
    )
    retry_session = retry(cache_session, retries=5, backoff_factor=0.2)
    return openmeteo_requests.Client(session=retry_session)

_client = _build_client()

# ── Unified Fetch Strategy ─────────────────────────────────────────────────────

def generate_grid_point_id(lat: float, lon: float) -> str:
    """Generate a stable internal identifier for a grid point."""
    return f"grid_{lat:.4f}_{lon:.4f}".replace(".", "_").replace("-", "n")

def fetch_weather_for_grid(lats: np.ndarray, lons: np.ndarray) -> dict:
    """
    Fetch 3-day hourly general weather for multiple EEZ-filtered marine points.
    Returns a dict mapping grid_point_id to the forecast DataFrame.
    """
    if len(lats) != len(lons):
        raise ValueError("lats and lons must have the same length.")

    params = {
        "latitude":  lats.tolist(),
        "longitude": lons.tolist(),
        "hourly":    WEATHER_VARIABLES,
        "models":    WEATHER_MODEL,
        "forecast_days": FORECAST_DAYS,
        "cell_selection": CELL_SELECTION,
    }

    print(f"[weather_service] Requesting general weather for {len(lats)} EEZ points...")
    responses = _client.weather_api(WEATHER_ENDPOINT, params=params)
    print(f"[weather_service] Received {len(responses)} response(s).")

    results = {}
    for idx, response in enumerate(responses):
        lat = lats[idx]
        lon = lons[idx]
        point_id = generate_grid_point_id(lat, lon)
        
        hourly = response.Hourly()
        data = {
            "date": pd.date_range(
                start=pd.to_datetime(hourly.Time(), unit="s", utc=True),
                end=pd.to_datetime(hourly.TimeEnd(), unit="s", utc=True),
                freq=pd.Timedelta(seconds=hourly.Interval()),
                inclusive="left",
            )
        }
        for i, var in enumerate(WEATHER_VARIABLES):
            data[var] = hourly.Variables(i).ValuesAsNumpy()
            
        df = pd.DataFrame(data)
        df["latitude"] = lat
        df["longitude"] = lon
        df["grid_point_id"] = point_id
        results[point_id] = df

    return results


def fetch_marine_for_grid(lats: np.ndarray, lons: np.ndarray) -> dict:
    """
    Fetch 3-day hourly marine forecast for multiple EEZ-filtered marine points.
    Returns a dict mapping grid_point_id to the forecast DataFrame.
    """
    if len(lats) != len(lons):
        raise ValueError("lats and lons must have the same length.")

    params = {
        "latitude":  lats.tolist(),
        "longitude": lons.tolist(),
        "hourly":    MARINE_VARIABLES,
        "forecast_days": FORECAST_DAYS,
    }

    print(f"[weather_service] Requesting marine forecast for {len(lats)} EEZ points...")
    responses = _client.weather_api(MARINE_ENDPOINT, params=params)
    print(f"[weather_service] Received {len(responses)} response(s).")

    results = {}
    for idx, response in enumerate(responses):
        lat = lats[idx]
        lon = lons[idx]
        point_id = generate_grid_point_id(lat, lon)
        
        hourly = response.Hourly()
        data = {
            "date": pd.date_range(
                start=pd.to_datetime(hourly.Time(), unit="s", utc=True),
                end=pd.to_datetime(hourly.TimeEnd(), unit="s", utc=True),
                freq=pd.Timedelta(seconds=hourly.Interval()),
                inclusive="left",
            )
        }
        for i, var in enumerate(MARINE_VARIABLES):
            data[var] = hourly.Variables(i).ValuesAsNumpy()
            
        df = pd.DataFrame(data)
        df["latitude"] = lat
        df["longitude"] = lon
        df["grid_point_id"] = point_id
        results[point_id] = df

    return results

def fetch_combined_forecasts_for_grid(lats: np.ndarray, lons: np.ndarray) -> dict:
    """
    Fetches both general weather and marine forecasts for the given grid,
    and returns a nested dictionary keyed by grid_point_id.
    """
    weather_results = fetch_weather_for_grid(lats, lons)
    marine_results = fetch_marine_for_grid(lats, lons)
    
    combined = {}
    for idx in range(len(lats)):
        point_id = generate_grid_point_id(lats[idx], lons[idx])
        combined[point_id] = {
            "grid_point_id": point_id,
            "latitude": lats[idx],
            "longitude": lons[idx],
            "general_weather_forecast": weather_results.get(point_id),
            "marine_forecast": marine_results.get(point_id)
        }
    return combined

# ── CLI Test ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Testing multi-point unified fetch (Arabian Sea)...")
    lats = np.array([19.0, 19.5])
    lons = np.array([72.5, 72.0])
    
    combined_data = fetch_combined_forecasts_for_grid(lats, lons)
    print(f"Returned {len(combined_data)} combined grid points.")
    
    for point_id, data in combined_data.items():
        print(f"\nPoint ID: {point_id} ({data['latitude']}°N, {data['longitude']}°E)")
        weather_df = data["general_weather_forecast"]
        marine_df = data["marine_forecast"]
        print(f"Weather rows: {len(weather_df) if weather_df is not None else 0}")
        print(f"Marine rows: {len(marine_df) if marine_df is not None else 0}")
        if weather_df is not None:
            print("Weather Sample:")
            print(weather_df[["date", "wind_speed_10m"]].head(2))
        if marine_df is not None:
            print("Marine Sample:")
            print(marine_df[["date", "wave_height", "sea_surface_temperature"]].head(2))
