import httpx
import os
from src.agents.state import AgentState

# Open-Meteo Marine API (no API key required)
MARINE_API = "https://marine-api.open-meteo.com/v1/marine"
FORECAST_API = "https://api.open-meteo.com/v1/forecast"

# Mock data fallback (used when APIs are unavailable)
MOCK_DATA = {
    "wind_kmh": 12.0,
    "wave_m": 1.2,
    "rainfall_mm": 0.0,
    "lightning": False,
    "cyclone": False,
    "sources": ["mock-fallback"],
}


async def data_agent(state: AgentState) -> AgentState:
    """
    Data Agent: fetches real-time weather + ocean conditions from Open-Meteo.
    Falls back to mock data if APIs are unavailable.
    Full Copernicus SST/Chlorophyll integration added in Day 2.
    """
    lat = state["latitude"]
    lon = state["longitude"]

    sources = []
    wind_kmh = MOCK_DATA["wind_kmh"]
    wave_m = MOCK_DATA["wave_m"]
    rainfall_mm = MOCK_DATA["rainfall_mm"]
    lightning = MOCK_DATA["lightning"]
    cyclone = MOCK_DATA["cyclone"]

    # --- Fetch Marine Data (waves) ---
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            marine_resp = await client.get(MARINE_API, params={
                "latitude": lat,
                "longitude": lon,
                "hourly": "wave_height,swell_wave_height,wind_wave_height",
                "forecast_days": 1,
            })
            marine_resp.raise_for_status()
            marine_data = marine_resp.json()
            hourly = marine_data.get("hourly", {})
            wave_heights = hourly.get("wave_height", [])
            if wave_heights:
                # Use the max wave height in the next 12 hours
                wave_m = max(h for h in wave_heights[:12] if h is not None)
            sources.append("open-meteo-marine")
    except Exception as e:
        print(f"[DataAgent] Marine API error: {e}. Using mock wave data.")
        sources.append("mock-wave")

    # --- Fetch Weather Data (wind, rain) ---
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            forecast_resp = await client.get(FORECAST_API, params={
                "latitude": lat,
                "longitude": lon,
                "hourly": "wind_speed_10m,precipitation,rain,weather_code",
                "forecast_days": 1,
            })
            forecast_resp.raise_for_status()
            forecast_data = forecast_resp.json()
            hourly = forecast_data.get("hourly", {})

            # Max wind in next 12 hours
            wind_speeds = hourly.get("wind_speed_10m", [])
            if wind_speeds:
                wind_kmh = max(w for w in wind_speeds[:12] if w is not None)

            # Total rainfall next 12 hours
            rains = hourly.get("rain", [])
            if rains:
                rainfall_mm = sum(r for r in rains[:12] if r is not None)

            # Check weather code for lightning (codes 95-99 = thunderstorm)
            codes = hourly.get("weather_code", [])
            lightning = any(c is not None and c >= 95 for c in codes[:12])

            sources.append("open-meteo-forecast")
    except Exception as e:
        print(f"[DataAgent] Forecast API error: {e}. Using mock weather data.")
        sources.append("mock-weather")

    # TODO Day 2: Add Copernicus SST + Chlorophyll fetch here
    # TODO Day 2: Add IMD cyclone check here

    return {
        **state,
        "wind_kmh": wind_kmh,
        "wave_m": wave_m,
        "rainfall_mm": rainfall_mm,
        "lightning": lightning,
        "cyclone": cyclone,
        "sources": sources,
    }
