"""
alerts.py — unified marine safety alerts, combining geofence + live weather
(this router's own _compute_alerts) with the cached IMD live-feed alerts
(src/services/imd_alerts.py).
"""
import asyncio
from fastapi import APIRouter
from src.utils.geojson_store import DATA_DIR, load_geojson

router = APIRouter()


@router.get("/alerts", summary="Marine Safety Alerts")
async def get_alerts(latitude: float = 8.5, longitude: float = 76.2):
    """
    Unified marine safety alerts combining geofence + weather + IMD live-feed
    checks (src/services/imd_alerts.py, cache-backed — never blocks on a
    live IMD scrape). Returns alerts sorted by severity (HIGH first).
    """
    # fetch_combined_forecasts_for_grid uses a synchronous HTTP client
    # (openmeteo_requests, retry-wrapped — up to 5 retries with backoff) plus
    # synchronous pandas processing, run directly here before this fix —
    # network I/O blocking the event loop is worse than the disk-I/O
    # blocking fixed elsewhere (see /pfz/nearest), since it can take seconds
    # and stalls every other concurrent request meanwhile.
    base = await asyncio.to_thread(_compute_alerts, latitude, longitude)

    from src.services.imd_alerts import get_location_imd_alerts
    from src.utils.geo import find_nearest_landing_sites
    import os
    state_name = None
    try:
        landing_path = os.path.join(DATA_DIR, "LANDING-LOCATIONS.geojson")
        if os.path.exists(landing_path):
            nearest = find_nearest_landing_sites(latitude, longitude, load_geojson(landing_path), n=1)
            if nearest:
                state_name = nearest[0]["sector"]
    except Exception as e:
        print(f"[Alerts] Nearest-state lookup for IMD alerts failed: {e}")

    imd_alerts = await get_location_imd_alerts(state_name)
    telemetry = base.get("telemetry", {})
    for a in imd_alerts:
        m = a.setdefault("metadata", {})
        if "distance_km" not in m:
            m["distance_km"] = 0
        if "wind_speed_10m" not in m and telemetry.get("wind_speed_10m") is not None:
            m["wind_speed_10m"] = round(telemetry["wind_speed_10m"], 1)
        if "wind_gusts_10m" not in m and telemetry.get("wind_gusts_10m") is not None:
            m["wind_gusts_10m"] = round(telemetry["wind_gusts_10m"], 1)
        if "wave_height_m" not in m and telemetry.get("wave_height_m") is not None:
            m["wave_height_m"] = round(telemetry["wave_height_m"], 1)
        if "status" not in m:
            m["status"] = "Critical Risk" if a.get("severity") == "HIGH" else "Caution"

    all_alerts = base["alerts"] + imd_alerts
    sev_rank = {"HIGH": 0, "MODERATE": 1, "INFO": 2}
    all_alerts.sort(key=lambda a: sev_rank.get(a["severity"], 99))

    return {
        **base,
        "alerts": all_alerts,
        "alert_count": len(all_alerts),
        "has_high_severity": any(a["severity"] == "HIGH" for a in all_alerts),
    }


def _compute_alerts(latitude: float, longitude: float) -> dict:
    from src.utils.geofence import check_geofence
    from src.services.weather_service import fetch_combined_forecasts_for_grid_cached as fetch_combined_forecasts_for_grid, generate_grid_point_id
    import numpy as np
    import pandas as pd

    alerts = []

    # 1. Geofence alerts
    try:
        for a in check_geofence(latitude, longitude):
            alerts.append({
                "type": a["type"], "severity": a["severity"],
                "message": a["message"], "source": "geofence",
                "metadata": {"boundary": a.get("boundary"), "distance_km": a.get("distance_km")}
            })
    except Exception as e:
        print(f"[Alerts] Geofence error: {e}")

    # 2. Weather alerts
    try:
        combined = fetch_combined_forecasts_for_grid(np.array([latitude]), np.array([longitude]))
        point_id = generate_grid_point_id(latitude, longitude)
        data = combined.get(point_id, {})
        now_utc = pd.Timestamp.now(tz="UTC")

        weather_df = data.get("general_weather_forecast")
        marine_df = data.get("marine_forecast")

        max_wind = None
        max_gust = None
        total_rain = 0.0
        min_vis = None
        max_code = 0

        if weather_df is not None and not weather_df.empty:
            w = weather_df[weather_df["date"] <= now_utc + pd.Timedelta(hours=12)]
            if w.empty: w = weather_df.head(12)
            if "wind_speed_10m" in w:
                max_wind = float(w["wind_speed_10m"].max())
            if "wind_gusts_10m" in w:
                max_gust = float(w["wind_gusts_10m"].max())
            if "precipitation" in w:
                total_rain = float(w["precipitation"].sum())
            if "visibility" in w:
                min_vis = float(w["visibility"].min())
            if "weather_code" in w and not w["weather_code"].dropna().empty:
                max_code = int(w["weather_code"].dropna().max())

        max_wave = None
        if marine_df is not None and not marine_df.empty:
            m = marine_df[marine_df["date"] <= now_utc + pd.Timedelta(hours=12)]
            if m.empty: m = marine_df.head(12)
            if "wave_height" in m:
                max_wave = float(m["wave_height"].max())

        # Base telemetry metadata shared by all weather alerts at this point
        base_meta = {"distance_km": 0}
        if max_wind is not None:
            base_meta["wind_speed_10m"] = round(max_wind, 1)
        if max_gust is not None:
            base_meta["wind_gusts_10m"] = round(max_gust, 1)
        if max_wave is not None:
            base_meta["wave_height_m"] = round(max_wave, 1)

        if max_wind is not None and max_wind > 46:
            alerts.append({"type": "HIGH_WIND", "severity": "HIGH",
                "message": f"Dangerous winds: {max_wind:.0f} km/h (gusts {max_gust:.0f} km/h). Do not venture out.",
                "source": "open-meteo", "metadata": {**base_meta, "status": "Gale Warning"}})
        elif max_wind is not None and max_wind > 28:
            alerts.append({"type": "MODERATE_WIND", "severity": "MODERATE",
                "message": f"Elevated winds: {max_wind:.0f} km/h. Exercise caution at sea.",
                "source": "open-meteo", "metadata": {**base_meta, "status": "Elevated Wind"}})

        if total_rain > 50:
            alerts.append({"type": "HEAVY_RAIN", "severity": "HIGH",
                "message": f"Heavy rainfall: {total_rain:.0f} mm in 12 hrs. Conditions will deteriorate.",
                "source": "open-meteo", "metadata": {**base_meta, "precipitation_mm": round(total_rain, 1), "status": "Heavy Rain"}})

        if min_vis is not None and min_vis < 1000:
            alerts.append({"type": "LOW_VISIBILITY", "severity": "MODERATE",
                "message": f"Low visibility: {min_vis/1000:.1f} km. Navigation risk increased.",
                "source": "open-meteo", "metadata": {**base_meta, "visibility_m": round(min_vis, 0), "status": "Low Visibility"}})

        if max_code >= 95:
            alerts.append({"type": "THUNDERSTORM", "severity": "HIGH",
                "message": "Thunderstorm with lightning forecast. Do NOT go out to sea.",
                "source": "open-meteo", "metadata": {**base_meta, "weather_code": max_code, "status": "Thunderstorm"}})

        if max_wave is not None:
            if max_wave > 3.5:
                alerts.append({"type": "DANGEROUS_WAVES", "severity": "HIGH",
                    "message": f"Dangerous waves: {max_wave:.1f} m. Small vessels must stay ashore.",
                    "source": "open-meteo-marine", "metadata": {**base_meta, "status": "Rough Sea"}})
            elif max_wave > 2.0:
                alerts.append({"type": "HIGH_WAVES", "severity": "MODERATE",
                    "message": f"High waves: {max_wave:.1f} m. Avoid smaller vessels.",
                    "source": "open-meteo-marine", "metadata": {**base_meta, "status": "Moderate Swell"}})
    except Exception as e:
        print(f"[Alerts] Weather error: {e}")
        alerts.append({"type": "SYSTEM", "severity": "INFO",
            "message": "Weather data unavailable. Check IMD for latest advisories.",
            "source": "system", "metadata": {}})

    sev_rank = {"HIGH": 0, "MODERATE": 1, "INFO": 2}
    alerts.sort(key=lambda a: sev_rank.get(a["severity"], 99))

    return {
        "alert_count": len(alerts),
        "has_high_severity": any(a["severity"] == "HIGH" for a in alerts),
        "alerts": alerts,
        "telemetry": base_meta,
        "latitude": latitude,
        "longitude": longitude,
    }
