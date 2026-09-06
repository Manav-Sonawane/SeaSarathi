"""
risk_heatmap.py - Generates a GeoJSON risk heatmap over the India EEZ.
"""

import time
import math
from typing import Optional

import numpy as np
import pandas as pd

from src.services.marine_grid import generate_eez_grid
from src.services.weather_service import fetch_combined_forecasts_for_grid, generate_grid_point_id
from src.services.copernicus_service import lookup_nearest as lookup_sst_chl

CACHE_SECONDS = 1800

_cache: Optional[dict] = None
_cache_time: float = 0.0


def _score_point(wind_kmh: float, wave_m: float, rain_mm: float,
                 lightning: bool, cyclone: bool) -> int:
    if cyclone or lightning:
        return 0
    score = 100
    if wind_kmh > 46:
        score -= 40
    elif wind_kmh > 28:
        score -= 15
    if wave_m > 3.5:
        score -= 35
    elif wave_m > 2.5:
        score -= 20
    elif wave_m > 1.5:
        score -= 10
    if rain_mm > 50:
        score -= 20
    elif rain_mm > 15:
        score -= 8
    return max(0, min(100, score))


def _risk_label(score: int) -> str:
    if score >= 70:
        return "LOW"
    elif score >= 40:
        return "MODERATE"
    return "HIGH"


def _risk_color(score: int) -> str:
    if score >= 70:
        return "#00C853"
    elif score >= 40:
        return "#FFB300"
    return "#D50000"


def _risk_opacity(score: int) -> float:
    if score >= 70:
        return 0.35
    elif score >= 40:
        return 0.55
    return 0.75


def generate_risk_heatmap(resolution_deg: float = 1.0, force_refresh: bool = False) -> dict:
    global _cache, _cache_time
    now = time.time()
    if not force_refresh and _cache is not None and (now - _cache_time) < CACHE_SECONDS:
        print(f"[risk_heatmap] Returning cached result ({int(now - _cache_time)}s old).")
        return _cache

    print("[risk_heatmap] Generating new heatmap...")
    start = time.time()

    try:
        lats, lons = generate_eez_grid(resolution_deg=resolution_deg)
    except Exception as e:
        print(f"[risk_heatmap] EEZ grid failed: {e}. Using bounding box fallback.")
        lat_vals = np.arange(4.0, 25.0 + resolution_deg, resolution_deg)
        lon_vals = np.arange(66.0, 99.0 + resolution_deg, resolution_deg)
        lats_2d, lons_2d = np.meshgrid(lat_vals, lon_vals)
        lats = lats_2d.flatten()
        lons = lons_2d.flatten()

    n_points = len(lats)
    print(f"[risk_heatmap] Grid: {n_points} EEZ points at {resolution_deg} deg resolution.")

    weather_data: dict = {}
    try:
        weather_data = fetch_combined_forecasts_for_grid(lats, lons)
    except Exception as e:
        print(f"[risk_heatmap] Weather batch fetch failed: {e}. Using defaults.")

    features = []
    now_utc = pd.Timestamp.now(tz="UTC")
    generated_at = now_utc.isoformat()

    for lat, lon in zip(lats, lons):
        lat = round(float(lat), 4)
        lon = round(float(lon), 4)

        wind_speed_10m = 0.0
        wave_height = 0.0
        precipitation = 0.0
        lightning = False
        cyclone = False
        data_source = "default"

        try:
            point_id = generate_grid_point_id(lat, lon)
            data = weather_data.get(point_id, {})
            weather_df = data.get("general_weather_forecast")
            if weather_df is not None and not weather_df.empty:
                window = weather_df[weather_df["date"] <= now_utc + pd.Timedelta(hours=12)]
                if window.empty:
                    window = weather_df.head(12)
                wind_speed_10m = float(window["wind_speed_10m"].max())
                precipitation = float(window["precipitation"].sum())
                code_vals = window["weather_code"].dropna()
                max_code = int(code_vals.max()) if not code_vals.empty else 0
                lightning = max_code >= 95
                data_source = "open-meteo"
            marine_df = data.get("marine_forecast")
            if marine_df is not None and not marine_df.empty:
                window = marine_df[marine_df["date"] <= now_utc + pd.Timedelta(hours=12)]
                if window.empty:
                    window = marine_df.head(12)
                wave_height = float(window["wave_height"].max())
        except Exception as e:
            print(f"[risk_heatmap] Weather extract failed at ({lat},{lon}): {e}")

        sst_c = None
        chlorophyll = None
        try:
            sst_chl = lookup_sst_chl(lat, lon)
            if sst_chl:
                sst_c = sst_chl["sst_c"]
                chlorophyll = sst_chl["chl_mg_m3"]
        except Exception:
            pass

        score = _score_point(wind_speed_10m, wave_height, precipitation, lightning, cyclone)
        level = _risk_label(score)
        color = _risk_color(score)
        opacity = _risk_opacity(score)

        feature = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "risk_score": score,
                "risk_level": level,
                "color": color,
                "opacity": opacity,
                "wind_speed_10m": round(wind_speed_10m, 1),
                "wave_height": round(wave_height, 2),
                "precipitation": round(precipitation, 1),
                "lightning": lightning,
                "cyclone": cyclone,
                "sst_c": round(sst_c, 2) if sst_c is not None else None,
                "chlorophyll": round(chlorophyll, 4) if chlorophyll is not None else None,
                "data_source": data_source,
                "generated_at": generated_at,
            },
        }
        features.append(feature)

    elapsed = round(time.time() - start, 1)
    low = sum(1 for f in features if f["properties"]["risk_level"] == "LOW")
    moderate = sum(1 for f in features if f["properties"]["risk_level"] == "MODERATE")
    high = sum(1 for f in features if f["properties"]["risk_level"] == "HIGH")

    print(f"[risk_heatmap] Done in {elapsed}s - {low} LOW / {moderate} MODERATE / {high} HIGH.")

    result = {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "total_points": len(features),
            "resolution_deg": resolution_deg,
            "generated_at": generated_at,
            "generation_time_s": elapsed,
            "risk_counts": {"LOW": low, "MODERATE": moderate, "HIGH": high},
            "color_legend": {
                "LOW":      {"color": "#00C853", "label": "Safe to fish"},
                "MODERATE": {"color": "#FFB300", "label": "Caution advised"},
                "HIGH":     {"color": "#D50000", "label": "Do not venture out"},
            },
        },
    }

    _cache = result
    _cache_time = now
    return result
