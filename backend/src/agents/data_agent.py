import os
import numpy as np
import pandas as pd
from src.agents.state import AgentState
from src.services.weather_service import fetch_combined_forecasts_for_grid, generate_grid_point_id

# Mock data fallback (used when APIs are unavailable)
MOCK_DATA = {
    "wind_speed_10m": 12.0,
    "wave_height": 1.2,
    "precipitation": 0.0,
    "visibility": 10000.0,
    "wind_gusts_10m": 15.0,
    "lightning": False,
    "cyclone": False,
    "sources": ["mock-fallback"],
}

async def data_agent(state: AgentState) -> AgentState:
    """
    Data Agent: fetches real-time weather + ocean conditions from Open-Meteo.
    Falls back to mock data if APIs are unavailable.
    """
    lat = state["latitude"]
    lon = state["longitude"]

    sources = []
    wind_speed_10m = MOCK_DATA["wind_speed_10m"]
    wave_height = MOCK_DATA["wave_height"]
    precipitation = MOCK_DATA["precipitation"]
    visibility = MOCK_DATA["visibility"]
    wind_gusts_10m = MOCK_DATA["wind_gusts_10m"]
    lightning = MOCK_DATA["lightning"]
    cyclone = MOCK_DATA["cyclone"]

    try:
        # We query the service layer with a single point as an array
        combined = fetch_combined_forecasts_for_grid(np.array([lat]), np.array([lon]))
        point_id = generate_grid_point_id(lat, lon)
        data = combined.get(point_id, {})
        
        weather_df = data.get("general_weather_forecast")
        marine_df = data.get("marine_forecast")
        
        now_utc = pd.Timestamp.now(tz="UTC")
        
        if weather_df is not None and not weather_df.empty:
            window = weather_df[weather_df["date"] <= now_utc + pd.Timedelta(hours=12)]
            if window.empty:
                window = weather_df.head(12)
            
            wind_speed_10m = float(window["wind_speed_10m"].max())
            wind_gusts_10m = float(window["wind_gusts_10m"].max())
            precipitation = float(window["precipitation"].sum())
            visibility = float(window["visibility"].min())
            
            code_vals = window["weather_code"].dropna()
            max_code = int(code_vals.max()) if not code_vals.empty else 0
            lightning = max_code >= 95
            
            sources.append("open-meteo-forecast")
            
        if marine_df is not None and not marine_df.empty:
            window = marine_df[marine_df["date"] <= now_utc + pd.Timedelta(hours=12)]
            if window.empty:
                window = marine_df.head(12)
            
            wave_height = float(window["wave_height"].max())
            sources.append("open-meteo-marine")

    except Exception as e:
        print(f"[DataAgent] Unified API error: {e}. Using mock data.")
        sources.append("mock-data")

    # TODO Day 2: Add Copernicus SST + Chlorophyll fetch here
    # TODO Day 2: Add IMD cyclone check here

    return {
        **state,
        "wind_speed_10m": wind_speed_10m,
        "wave_height": wave_height,
        "precipitation": precipitation,
        "visibility": visibility,
        "wind_gusts_10m": wind_gusts_10m,
        "lightning": lightning,
        "cyclone": cyclone,
        "sources": sources,
    }
