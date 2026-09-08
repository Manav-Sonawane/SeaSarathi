import os
import json
import numpy as np
import pandas as pd
from src.agents.state import AgentState
from src.services.weather_service import fetch_combined_forecasts_for_grid, generate_grid_point_id
from src.services.copernicus_service import lookup_nearest as lookup_sst_chl

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
    Data Agent: central data aggregator that executes and coordinates all domain data lookups:
      1. Real-time Weather & Marine conditions (Open-Meteo)
      2. Oceanographic SST & Chlorophyll (Copernicus NetCDF Grid)
      3. Nearest Potential Fishing Zone with coordinates & bearing (INCOIS PFZ.geojson)
      4. Maritime Geofencing & International Border check (INDIAN-WATER-BOUNDARIES.geojson & INDIA-EEZ)
      5. Nearest Fish Landing Center / Harbor (LANDING-LOCATIONS.geojson)
      6. Unified Multi-hazard Safety Alerts synthesis
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

    # 1. Weather & Marine Forecast
    try:
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
        print(f"[DataAgent] Weather API error: {e}. Using fallback.")
        sources.append("mock-data")

    # 2. SST + Chlorophyll from Copernicus Grid
    sst_c = None
    chlorophyll_mg_m3 = None
    sst_chl = lookup_sst_chl(lat, lon)
    if sst_chl:
        sst_c = sst_chl["sst_c"]
        chlorophyll_mg_m3 = sst_chl["chl_mg_m3"]
        sources.append("copernicus-marine")

    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    data_static_dir = os.path.join(base_dir, "data", "static")
    if not os.path.exists(data_static_dir):
        data_static_dir = os.path.join(base_dir, "..", "data", "static")

    def calc_bearing(lat1, lon1, lat2, lon2) -> str:
        import math
        d_lon = math.radians(lon2 - lon1)
        lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
        x = math.sin(d_lon) * math.cos(lat2_r)
        y = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(lat2_r) * math.cos(d_lon)
        angle = (math.degrees(math.atan2(x, y)) + 360) % 360
        dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        return dirs[int((angle + 22.5) / 45) % 8]

    # 3. Nearest Potential Fishing Zone (PFZ)
    nearest_pfz = None
    try:
        from src.utils.geo import find_nearest_zones
        pfz_file = os.path.join(data_static_dir, "PFZ.geojson")
        if os.path.exists(pfz_file):
            with open(pfz_file, "r", encoding="utf-8") as f:
                pfz_geojson = json.load(f)
            zones = find_nearest_zones(lat, lon, pfz_geojson, n=1)
            if zones:
                z = zones[0]
                z_sst_chl = lookup_sst_chl(z["centroid_lat"], z["centroid_lon"])
                nearest_pfz = {
                    "name": z["name"],
                    "latitude": round(z["centroid_lat"], 4),
                    "longitude": round(z["centroid_lon"], 4),
                    "distance_km": round(z["distance_km"], 1),
                    "direction": calc_bearing(lat, lon, z["centroid_lat"], z["centroid_lon"]),
                    "sst_c": z_sst_chl["sst_c"] if z_sst_chl else sst_c,
                    "chlorophyll_mg_m3": round(z_sst_chl["chl_mg_m3"], 2) if z_sst_chl else chlorophyll_mg_m3,
                }
                sources.append("pfz-incois")
    except Exception as e:
        print(f"[DataAgent] PFZ lookup error: {e}")

    # 4. Geofencing & International Border Check
    geofence = {"in_indian_waters": True, "alert_count": 0, "alerts": []}
    try:
        from src.utils.geofence import check_geofence, is_in_indian_waters
        geo_alerts = check_geofence(lat, lon)
        in_waters = is_in_indian_waters(lat, lon)
        geofence = {
            "in_indian_waters": in_waters,
            "alert_count": len(geo_alerts),
            "alerts": geo_alerts,
        }
        if geo_alerts:
            sources.append("geofence-boundaries")
    except Exception as e:
        print(f"[DataAgent] Geofence error: {e}")

    # 5. Nearest Fish Landing Site / Port
    nearest_landing = None
    try:
        from src.utils.geo import find_nearest_landing_sites
        landing_file = os.path.join(data_static_dir, "LANDING-LOCATIONS.geojson")
        if os.path.exists(landing_file):
            with open(landing_file, "r", encoding="utf-8") as f:
                landing_geojson = json.load(f)
            sites = find_nearest_landing_sites(lat, lon, landing_geojson, n=1)
            if sites:
                s = sites[0]
                nearest_landing = {
                    "name": s["name"],
                    "district": s.get("district", ""),
                    "sector": s.get("sector", ""),
                    "latitude": round(s["latitude"], 4),
                    "longitude": round(s["longitude"], 4),
                    "distance_km": round(s["distance_km"], 1),
                    "direction": calc_bearing(lat, lon, s["latitude"], s["longitude"]),
                }

                sources.append("landing-locations")
    except Exception as e:
        print(f"[DataAgent] Landing site lookup error: {e}")

    # 6. Unified Safety Alerts Compilation
    alerts = []
    # Add geofence alerts
    for a in geofence.get("alerts", []):
        alerts.append({
            "type": a["type"],
            "severity": a["severity"],
            "message": a["message"],
            "source": "geofence"
        })
    # Add weather alerts
    if wind_speed_10m > 46:
        alerts.append({
            "type": "HIGH_WIND",
            "severity": "HIGH",
            "message": f"Dangerous winds: {wind_speed_10m:.0f} km/h (gusts {wind_gusts_10m:.0f} km/h). Do not venture out.",
            "source": "open-meteo"
        })
    elif wind_speed_10m > 28:
        alerts.append({
            "type": "MODERATE_WIND",
            "severity": "MODERATE",
            "message": f"Elevated winds: {wind_speed_10m:.0f} km/h. Exercise caution at sea.",
            "source": "open-meteo"
        })
    if wave_height > 3.5:
        alerts.append({
            "type": "DANGEROUS_WAVES",
            "severity": "HIGH",
            "message": f"Dangerous waves: {wave_height:.1f} m. Small vessels must stay ashore.",
            "source": "open-meteo-marine"
        })
    elif wave_height > 2.0:
        alerts.append({
            "type": "HIGH_WAVES",
            "severity": "MODERATE",
            "message": f"High waves: {wave_height:.1f} m. Avoid smaller vessels.",
            "source": "open-meteo-marine"
        })
    if precipitation > 50:
        alerts.append({
            "type": "HEAVY_RAIN",
            "severity": "HIGH",
            "message": f"Heavy rainfall: {precipitation:.0f} mm. Visibility and conditions degraded.",
            "source": "open-meteo"
        })
    if lightning:
        alerts.append({
            "type": "THUNDERSTORM",
            "severity": "HIGH",
            "message": "Thunderstorm and lightning forecast. Do not go out to sea.",
            "source": "open-meteo"
        })

    return {
        **state,
        "wind_speed_10m": wind_speed_10m,
        "wave_height": wave_height,
        "precipitation": precipitation,
        "visibility": visibility,
        "wind_gusts_10m": wind_gusts_10m,
        "lightning": lightning,
        "cyclone": cyclone,
        "sst_c": sst_c,
        "chlorophyll_mg_m3": chlorophyll_mg_m3,
        "nearest_pfz": nearest_pfz,
        "geofence": geofence,
        "nearest_landing": nearest_landing,
        "alerts": alerts,
        "sources": sources,
    }


