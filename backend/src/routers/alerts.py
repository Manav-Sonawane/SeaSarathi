"""
alerts.py — unified marine safety alerts, combining geofence + live weather
(this router's own _compute_alerts) with the cached IMD live-feed alerts
(src/services/imd_alerts.py).
"""
import asyncio
from fastapi import APIRouter, Response
from src.utils.geojson_store import DATA_DIR, load_geojson

router = APIRouter()


@router.get("/alerts", summary="Marine Safety Alerts")
async def get_alerts(response: Response, latitude: float = 8.5, longitude: float = 76.2, lang: str = "en"):
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
    # Never let a cache/proxy/browser hand back an old copy of a safety alert.
    response.headers["Cache-Control"] = "no-store"

    # IMD data older than its TTL is re-scraped BEFORE answering (bounded wait,
    # one shared scrape) rather than served stale while a refresh runs in the
    # background. If IMD can't be reached, imd_status below says so explicitly.
    from src.services.imd_cache import get_fresh
    imd_fetch = asyncio.gather(*(get_fresh(n) for n in ("fisherman_warnings", "sea_area_bulletins", "cyclone_warnings")))
    base_task = asyncio.to_thread(_compute_alerts, latitude, longitude)
    _, base = await asyncio.gather(imd_fetch, base_task)

    from src.services.imd_alerts import get_location_imd_alerts
    from src.utils.geo import find_nearest_landing_sites
    import os
    state_name = None
    district = None
    try:
        landing_path = os.path.join(DATA_DIR, "LANDING-LOCATIONS.geojson")
        if os.path.exists(landing_path):
            nearest = find_nearest_landing_sites(latitude, longitude, load_geojson(landing_path), n=1)
            if nearest:
                state_name = nearest[0]["sector"]
                district = nearest[0].get("district")
    except Exception as e:
        print(f"[Alerts] Nearest-state lookup for IMD alerts failed: {e}")

    imd_alerts = await get_location_imd_alerts(state_name, district)
    # IMD cards carry ONLY what IMD published. This used to copy Open-Meteo's
    # wind/gust/wave onto them, so a 45-55 km/h IMD warning showed "23 km/h"
    # (the model's reading at the port) as if IMD had said it. Open-Meteo has
    # its own alerts above; its numbers stay on those.
    status_by_severity = {"HIGH": "Critical Risk", "MODERATE": "Caution", "INFO": "Information"}
    for a in imd_alerts:
        m = a.setdefault("metadata", {})
        m.setdefault("distance_km", 0)
        m.setdefault("status", status_by_severity.get(a.get("severity"), "Caution"))

    all_alerts = base["alerts"] + imd_alerts
    sev_rank = {"HIGH": 0, "MODERATE": 1, "INFO": 2}
    all_alerts.sort(key=lambda a: sev_rank.get(a["severity"], 99))

    # Optional translation of the IMD alerts' free-text message (IMD publishes
    # English only). The original `message` is always kept — safety text must
    # stay verifiable against the source — and the translation rides along as
    # `message_translated`. Weather/geofence alerts aren't translated here: the
    # app renders those in the user's language itself from their metadata.
    from src.services.translation_service import is_translatable, translate_many
    if is_translatable(lang):
        imd_idx = [i for i, a in enumerate(all_alerts) if str(a.get("type", "")).startswith("IMD_") and a.get("message")]
        translated = await translate_many([all_alerts[i]["message"] for i in imd_idx], lang)
        for i, text in zip(imd_idx, translated):
            if text:
                # New dict: the alert objects may be shared with the IMD cache.
                all_alerts[i] = {**all_alerts[i], "message_translated": text, "message_lang": lang}

    from datetime import datetime, timezone
    from src.services.imd_cache import cache_status
    from src.services.imd_alerts import get_location_bulletin_summary
    src_status = cache_status()

    def _src(name: str) -> dict:
        st = src_status.get(name, {})
        return {"checked_at": st.get("cached_at"), "age_minutes": st.get("age_minutes"),
                "stale": st.get("stale"), "last_error": st.get("last_error")}

    fisherman = _src("fisherman_warnings")
    return {
        **base,
        "alerts": all_alerts,
        "alert_count": len(all_alerts),
        "has_high_severity": any(a["severity"] == "HIGH" for a in all_alerts),
        # How current the IMD side is, stated explicitly so the app can tell
        # "IMD published nothing new" from "we could not reach IMD".
        "imd_status": {
            **fisherman,                                   # top-level = the fisherman-warning PDFs
            "sources": {n: _src(n) for n in ("fisherman_warnings", "sea_area_bulletins", "cyclone_warnings")},
            "server_time_utc": datetime.now(timezone.utc).isoformat(),
            "bulletin": await get_location_bulletin_summary(state_name),
        },
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
