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
    Data Agent: central data aggregator that executes path-aware marine intelligence:
      1. Finds nearest Potential Fishing Zone (PFZ) and extracts destination coordinates.
      2. Pulls exact real-time Weather & Marine conditions for BOTH User location AND Destination PFZ.
      3. Pulls Copernicus SST & Chlorophyll at exact User coordinates AND Destination PFZ.
      4. Discovers 2-3 strategic Landing Centers along the traversal path (Departure, Mid-route shelter, PFZ harbor).
      5. Performs Maritime Geofencing & International Border checks.
      6. Synthesizes Unified Safety Alerts across the entire voyage.
    """
    lat = state["latitude"]
    lon = state["longitude"]

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

    sources = []

    # ── 1. Nearest Potential Fishing Zone (PFZ) ────────────────────────────────
    # Rule: if the nearest PFZ centroid is >50 km away it is impractical for
    # small-boat fishermen. In that case we discard it and instead compute a
    # "local fishing area" bounding box enriched with SST/CHL values from the
    # Copernicus grid directly around the user's current position.
    PFZ_MAX_DISTANCE_KM = 50.0

    nearest_pfz = None
    local_fishing_area = None
    pfz_lat, pfz_lon = lat, lon
    try:
        from src.utils.geo import find_nearest_zones
        pfz_file = os.path.join(data_static_dir, "PFZ.geojson")
        if os.path.exists(pfz_file):
            with open(pfz_file, "r", encoding="utf-8") as f:
                pfz_geojson = json.load(f)
            zones = find_nearest_zones(lat, lon, pfz_geojson, n=1)
            if zones:
                z = zones[0]
                dist_km = z["distance_km"]
                if dist_km <= PFZ_MAX_DISTANCE_KM:
                    # ── Normal path: PFZ is reachable ──────────────────────────
                    pfz_lat = z["centroid_lat"]
                    pfz_lon = z["centroid_lon"]
                    z_sst_chl = lookup_sst_chl(pfz_lat, pfz_lon)
                    nearest_pfz = {
                        "name": z["name"],
                        "latitude": round(pfz_lat, 4),
                        "longitude": round(pfz_lon, 4),
                        "distance_km": round(dist_km, 1),
                        "direction": calc_bearing(lat, lon, pfz_lat, pfz_lon),
                        "sst_c": z_sst_chl["sst_c"] if z_sst_chl else None,
                        "chlorophyll_mg_m3": round(z_sst_chl["chl_mg_m3"], 2) if z_sst_chl else None,
                    }
                    sources.append("pfz-incois")
                else:
                    # ── Fallback: PFZ too far → compute local bounding box ─────
                    # Build a ±0.15° box (~16.5 km radius) around user coords
                    # enriched with SST/CHL from the nearest Copernicus grid cell.
                    print(f"[DataAgent] PFZ too far ({dist_km:.1f} km > {PFZ_MAX_DISTANCE_KM} km). "
                          f"Switching to local area box.")
                    local_sst_chl = lookup_sst_chl(lat, lon)
                    _deg_offset = 0.15   # ≈ 16-17 km at Indian latitudes
                    sst_val = local_sst_chl["sst_c"] if local_sst_chl else None
                    chl_val = round(local_sst_chl["chl_mg_m3"], 2) if local_sst_chl else None
                    # Determine area quality based on chlorophyll productivity
                    if chl_val is not None:
                        if chl_val >= 1.0:
                            area_quality = "High productivity"
                        elif chl_val >= 0.3:
                            area_quality = "Moderate productivity"
                        else:
                            area_quality = "Low productivity"
                    else:
                        area_quality = "Unknown productivity"
                    local_fishing_area = {
                        "type": "local_area_box",
                        "reason": f"Nearest PFZ is {round(dist_km, 1)} km away — beyond practical reach for small vessels.",
                        "sst_c": sst_val,
                        "chlorophyll_mg_m3": chl_val,
                        "productivity": area_quality,
                        "bounding_box": {
                            "north": round(lat + _deg_offset, 4),
                            "south": round(lat - _deg_offset, 4),
                            "east": round(lon + _deg_offset, 4),
                            "west": round(lon - _deg_offset, 4),
                        },
                        "center": {"latitude": round(lat, 4), "longitude": round(lon, 4)},
                        "radius_km": round(_deg_offset * 111.0, 1),
                    }
                    sources.append("copernicus-local-area")
    except Exception as e:
        print(f"[DataAgent] PFZ lookup error: {e}")

    # ── 2. SST + Chlorophyll from Copernicus Grid at Exact User Coordinates ───
    sst_c = None
    chlorophyll_mg_m3 = None
    sst_chl_user = lookup_sst_chl(lat, lon)
    if sst_chl_user:
        sst_c = sst_chl_user["sst_c"]
        chlorophyll_mg_m3 = sst_chl_user["chl_mg_m3"]
        sources.append("copernicus-marine")

    # ── 3. Weather & Marine Forecast at Start AND Destination PFZ ──────────────
    wind_speed_10m = MOCK_DATA["wind_speed_10m"]
    wave_height = MOCK_DATA["wave_height"]
    precipitation = MOCK_DATA["precipitation"]
    visibility = MOCK_DATA["visibility"]
    wind_gusts_10m = MOCK_DATA["wind_gusts_10m"]
    lightning = MOCK_DATA["lightning"]
    cyclone = MOCK_DATA["cyclone"]
    pfz_weather = None

    try:
        # Build multi-point array: [User Location, Destination PFZ]
        if nearest_pfz and (abs(lat - pfz_lat) > 0.01 or abs(lon - pfz_lon) > 0.01):
            query_lats = np.array([lat, pfz_lat])
            query_lons = np.array([lon, pfz_lon])
        else:
            query_lats = np.array([lat])
            query_lons = np.array([lon])

        combined = fetch_combined_forecasts_for_grid(query_lats, query_lons)
        now_utc = pd.Timestamp.now(tz="UTC")

        # Parse user location conditions
        user_point_id = generate_grid_point_id(lat, lon)
        user_data = combined.get(user_point_id, {})
        user_w_df = user_data.get("general_weather_forecast")
        user_m_df = user_data.get("marine_forecast")

        if user_w_df is not None and not user_w_df.empty:
            w_win = user_w_df[user_w_df["date"] <= now_utc + pd.Timedelta(hours=12)]
            if w_win.empty:
                w_win = user_w_df.head(12)
            wind_speed_10m = float(w_win["wind_speed_10m"].max())
            wind_gusts_10m = float(w_win["wind_gusts_10m"].max())
            precipitation = float(w_win["precipitation"].sum())
            visibility = float(w_win["visibility"].min())
            code_vals = w_win["weather_code"].dropna()
            max_code = int(code_vals.max()) if not code_vals.empty else 0
            lightning = max_code >= 95
            sources.append("open-meteo-forecast")

        if user_m_df is not None and not user_m_df.empty:
            m_win = user_m_df[user_m_df["date"] <= now_utc + pd.Timedelta(hours=12)]
            if m_win.empty:
                m_win = user_m_df.head(12)
            wave_height = float(m_win["wave_height"].max())
            sources.append("open-meteo-marine")

        # Parse Destination PFZ conditions if distinct
        if nearest_pfz and len(query_lats) > 1:
            pfz_point_id = generate_grid_point_id(pfz_lat, pfz_lon)
            pfz_data = combined.get(pfz_point_id, {})
            pfz_w_df = pfz_data.get("general_weather_forecast")
            pfz_m_df = pfz_data.get("marine_forecast")

            dest_wind = wind_speed_10m
            dest_wave = wave_height
            dest_rain = precipitation
            dest_gusts = wind_gusts_10m
            dest_lightning = lightning

            if pfz_w_df is not None and not pfz_w_df.empty:
                pw_win = pfz_w_df[pfz_w_df["date"] <= now_utc + pd.Timedelta(hours=12)]
                if pw_win.empty:
                    pw_win = pfz_w_df.head(12)
                dest_wind = float(pw_win["wind_speed_10m"].max())
                dest_gusts = float(pw_win["wind_gusts_10m"].max())
                dest_rain = float(pw_win["precipitation"].sum())
                p_code = int(pw_win["weather_code"].dropna().max()) if not pw_win["weather_code"].dropna().empty else 0
                dest_lightning = p_code >= 95

            if pfz_m_df is not None and not pfz_m_df.empty:
                pm_win = pfz_m_df[pfz_m_df["date"] <= now_utc + pd.Timedelta(hours=12)]
                if pm_win.empty:
                    pm_win = pfz_m_df.head(12)
                dest_wave = float(pm_win["wave_height"].max())

            pfz_weather = {
                "wind_speed_10m": round(dest_wind, 1),
                "wave_height": round(dest_wave, 2),
                "wind_gusts_10m": round(dest_gusts, 1),
                "precipitation": round(dest_rain, 1),
                "lightning": dest_lightning,
                "sst_c": nearest_pfz.get("sst_c"),
                "chlorophyll_mg_m3": nearest_pfz.get("chlorophyll_mg_m3"),
            }

    except Exception as e:
        print(f"[DataAgent] Weather API multi-point error: {e}. Using fallback.")
        sources.append("mock-data")

    # ── 4. Strategic Landing Centers Along Traversal Path ──────────────────────
    landing_options = []
    nearest_landing = None
    try:
        from src.utils.geo import find_route_landing_options
        landing_file = os.path.join(data_static_dir, "LANDING-LOCATIONS.geojson")
        if os.path.exists(landing_file):
            with open(landing_file, "r", encoding="utf-8") as f:
                landing_geojson = json.load(f)
            landing_options = find_route_landing_options(lat, lon, pfz_lat, pfz_lon, landing_geojson, n=3)
            if landing_options:
                for opt in landing_options:
                    opt["direction_from_user"] = calc_bearing(lat, lon, opt["latitude"], opt["longitude"])
                nearest_landing = landing_options[0]
                sources.append("landing-locations")
    except Exception as e:
        print(f"[DataAgent] Landing options error: {e}")

    # ── 5. Geofencing & International Border Check ────────────────────────────
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

    # ── 6. Unified Safety Alerts Compilation ──────────────────────────────────
    alerts = []
    for a in geofence.get("alerts", []):
        alerts.append({
            "type": a["type"],
            "severity": a["severity"],
            "message": a["message"],
            "source": "geofence"
        })

    max_path_wind = max(wind_speed_10m, (pfz_weather or {}).get("wind_speed_10m", 0.0))
    max_path_wave = max(wave_height, (pfz_weather or {}).get("wave_height", 0.0))

    if max_path_wind > 46:
        alerts.append({
            "type": "HIGH_WIND",
            "severity": "HIGH",
            "message": f"Dangerous winds along voyage: {max_path_wind:.0f} km/h. Do not venture out.",
            "source": "open-meteo"
        })
    elif max_path_wind > 28:
        alerts.append({
            "type": "MODERATE_WIND",
            "severity": "MODERATE",
            "message": f"Elevated winds along route: {max_path_wind:.0f} km/h. Exercise caution.",
            "source": "open-meteo"
        })
    if max_path_wave > 3.5:
        alerts.append({
            "type": "DANGEROUS_WAVES",
            "severity": "HIGH",
            "message": f"Dangerous waves along voyage: {max_path_wave:.1f} m. Small vessels stay ashore.",
            "source": "open-meteo-marine"
        })
    elif max_path_wave > 2.0:
        alerts.append({
            "type": "HIGH_WAVES",
            "severity": "MODERATE",
            "message": f"High waves on route/PFZ: {max_path_wave:.1f} m. Avoid smaller vessels.",
            "source": "open-meteo-marine"
        })
    if precipitation > 50:
        alerts.append({
            "type": "HEAVY_RAIN",
            "severity": "HIGH",
            "message": f"Heavy rainfall: {precipitation:.0f} mm. Visibility and sea conditions degraded.",
            "source": "open-meteo"
        })
    if lightning or (pfz_weather and pfz_weather.get("lightning")):
        alerts.append({
            "type": "THUNDERSTORM",
            "severity": "HIGH",
            "message": "Thunderstorm and lightning forecast on route/PFZ. Do not go out to sea.",
            "source": "open-meteo"
        })

    route_summary = {
        "start_coordinates": {"latitude": lat, "longitude": lon},
        "destination_coordinates": {"latitude": pfz_lat, "longitude": pfz_lon},
        "distance_km": (nearest_pfz or {}).get("distance_km", 0.0),
        "bearing": (nearest_pfz or {}).get("direction", "N"),
        "max_route_wind_kmh": round(max_path_wind, 1),
        "max_route_wave_m": round(max_path_wave, 2),
    }

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
        "local_fishing_area": local_fishing_area,
        "pfz_weather": pfz_weather,
        "geofence": geofence,
        "nearest_landing": nearest_landing,
        "landing_options": landing_options,
        "route_summary": route_summary,
        "alerts": alerts,
        "sources": list(dict.fromkeys(sources)),
    }



