"""
offline_cache.py — Deep Sea Connectivity (UPDATE.md Improvement 3), backend half.

Owner: MNV (Backend). The mobile half (OfflineService.ts: downloading this bundle,
storing it in on-device SQLite, and answering queries locally with no signal) is
ARP's territory and is NOT implemented here — see the note at the bottom of this
file for exactly what the mobile side needs to call and handle.

Problem: 50+ km offshore there is no cellular signal. A fisherman needs one bundle,
downloaded before sailing, that covers everything the app can answer without a
live network call: static reference geometry (PFZ zones, boundaries, landing
centers), a multi-day weather/marine forecast, current productivity data
(SST/chlorophyll), and a historical baseline for anomaly context.

Honesty note on data sources actually available in this project (no fabricated
data): see the "sources" fields threaded through the bundle below.
  - Multi-day forecast: REAL, from Open-Meteo (src/services/weather_service.py).
  - SST/Chlorophyll "current": REAL, from the precomputed Copernicus grid
    (src/services/copernicus_service.py) — a single current snapshot, not a
    multi-day forecast. Chlorophyll's underlying Copernicus product (see
    COPERNICUS_DATA_ACCESS.md) is an analysis+forecast dataset that does extend
    a few days into the future, but SST's product is NRT-observational only
    (no future dates) — so there is no honest way to give a real "5-day SST
    forecast" with what's configured. We ship the current snapshot instead of
    fabricating a trend.
  - Historical 30-day SST/CHL mean: REAL, a live Copernicus point query
    (read_dataframe) at bundle-build time. Can fail/timeout; the bundle still
    returns everything else if it does (fields become null with a note).
  - Cyclone alerts / maritime bulletins: NOT available. Every IMD endpoint this
    project has tried returns 401 "API key missing" (see backend/test_apis.py
    and the identical note in src/agents/data_agent.py) and no IMD_API_KEY
    exists in backend/.env. Returned as an empty list with a note rather than
    silently omitted, so the mobile app can show "unavailable" instead of
    implying "no cyclones".
"""

import json
import os
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import numpy as np
import pandas as pd

from src.services.weather_service import fetch_combined_forecasts_for_grid, generate_grid_point_id
from src.services.copernicus_service import lookup_nearest as lookup_current_sst_chl
from src.utils.geofence import check_geofence, is_in_indian_waters

# File is at: backend/src/services/offline_cache.py
# Data is at:  SeaSarathi/data/static/
_STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "static")

# Open-Meteo's marine endpoint is reliable up to about this many days; beyond
# that the ECMWF marine forecast degrades sharply, so we clamp trip length here
# rather than let a caller silently get garbage for day 8+.
MAX_TRIP_DAYS = 10
DEFAULT_TRIP_DAYS = 5


def _load_geojson(filename: str) -> dict:
    path = os.path.join(_STATIC_DIR, filename)
    if not os.path.exists(path):
        print(f"[offline_cache] WARNING: {filename} not found in data/static/ — omitting from bundle.")
        return {"type": "FeatureCollection", "features": []}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def _load_static_bundle() -> dict:
    """
    Static reference geometry never changes at runtime (it's the same 52 PFZ
    zones / EEZ+boundary lines / 1223 landing centers for every request), so
    load and cache it once per server process instead of re-reading ~23MB of
    GeoJSON from disk on every bundle build.
    """
    pfz = _load_geojson("PFZ.geojson")
    eez = _load_geojson("INDIA-EEZ.geojson")
    boundaries = _load_geojson("INDIAN-WATER-BOUNDARIES.geojson")
    landing = _load_geojson("LANDING-LOCATIONS.geojson")
    return {
        "pfz_zones": pfz,
        "maritime_boundaries": {
            "type": "FeatureCollection",
            "features": eez.get("features", []) + boundaries.get("features", []),
        },
        "landing_centers": landing,
    }


def _multiday_forecast(lat: float, lon: float, days: int) -> dict:
    """Real multi-day wind/wave/rain/visibility forecast from Open-Meteo."""
    combined = fetch_combined_forecasts_for_grid(np.array([lat]), np.array([lon]), forecast_days=days)
    point_id = generate_grid_point_id(lat, lon)
    data = combined.get(point_id, {})

    weather_df = data.get("general_weather_forecast")
    marine_df = data.get("marine_forecast")
    if weather_df is None or weather_df.empty:
        return {"hourly": [], "days": days, "source": "open-meteo", "note": "forecast unavailable"}

    merged = weather_df
    if marine_df is not None and not marine_df.empty:
        merged = merged.merge(
            marine_df[["date", "wave_height", "sea_surface_temperature"]],
            on="date", how="left",
        )
    merged = merged.where(pd.notnull(merged), None)

    hourly = [
        {
            "time": row["date"].isoformat(),
            "wind_speed_10m": row.get("wind_speed_10m"),
            "wind_gusts_10m": row.get("wind_gusts_10m"),
            "precipitation": row.get("precipitation"),
            "visibility": row.get("visibility"),
            "weather_code": row.get("weather_code"),
            "wave_height": row.get("wave_height"),
        }
        for _, row in merged.iterrows()
    ]
    return {"hourly": hourly, "days": days, "source": "open-meteo"}


def _historical_baseline(lat: float, lon: float, days: int = 30) -> dict:
    """
    Live Copernicus point query for the 30-day mean SST/CHL at this location —
    used client-side for anomaly context ("today's SST is well above baseline").
    Best-effort: this hits the network at bundle-build time and can fail
    (credentials, timeout, dataset gaps); callers get nulls + a note, not a
    thrown exception, so one slow data source never blocks the whole bundle.
    """
    result = {
        "sst_30day_mean_c": None,
        "chlorophyll_30day_mean_mg_m3": None,
        "note": None,
    }
    try:
        import copernicusmarine

        username = os.getenv("COPERNICUS_USERNAME")
        password = os.getenv("COPERNICUS_PASSWORD")
        sst_dataset_id = os.getenv("COPERNICUS_SST_DATASET_ID")
        chl_dataset_id = os.getenv("COPERNICUS_CHLOROPHYLL_DATASET_ID")
        if not (username and password and sst_dataset_id and chl_dataset_id):
            result["note"] = "Copernicus credentials/dataset IDs not configured in backend/.env"
            return result

        end = datetime.now(timezone.utc)
        start = end - timedelta(days=days)
        pad = 0.25  # small bbox around the point, degrees

        sst_df = copernicusmarine.read_dataframe(
            dataset_id=sst_dataset_id,
            variables=["analysed_sst"],
            minimum_longitude=lon - pad, maximum_longitude=lon + pad,
            minimum_latitude=lat - pad, maximum_latitude=lat + pad,
            start_datetime=start.strftime("%Y-%m-%dT00:00:00"),
            end_datetime=end.strftime("%Y-%m-%dT00:00:00"),
            username=username, password=password,
        )
        if not sst_df.empty:
            result["sst_30day_mean_c"] = round(float(sst_df["analysed_sst"].mean()) - 273.15, 2)

        chl_df = copernicusmarine.read_dataframe(
            dataset_id=chl_dataset_id,
            variables=["chl"],
            minimum_longitude=lon - pad, maximum_longitude=lon + pad,
            minimum_latitude=lat - pad, maximum_latitude=lat + pad,
            minimum_depth=0, maximum_depth=1,
            start_datetime=start.strftime("%Y-%m-%dT00:00:00"),
            end_datetime=end.strftime("%Y-%m-%dT00:00:00"),
            username=username, password=password,
        )
        if not chl_df.empty:
            result["chlorophyll_30day_mean_mg_m3"] = round(float(chl_df["chl"].mean()), 4)

    except Exception as e:
        result["note"] = f"Historical baseline fetch failed: {e}"

    return result


def prepare_offline_bundle(latitude: float, longitude: float, trip_days: int = DEFAULT_TRIP_DAYS) -> dict:
    """
    Build the single downloadable bundle a fisherman fetches before sailing.
    Everything in it is real data pulled at build time — nothing here is
    simulated for the sake of filling out the schema (see module docstring
    for which fields are best-effort / may come back null).
    """
    trip_days = max(1, min(trip_days, MAX_TRIP_DAYS))
    now = datetime.now(timezone.utc)

    static = _load_static_bundle()
    forecast = _multiday_forecast(latitude, longitude, trip_days)
    current_sst_chl = lookup_current_sst_chl(latitude, longitude)
    historical = _historical_baseline(latitude, longitude)
    geofence_alerts = check_geofence(latitude, longitude)

    bundle = {
        "metadata": {
            "created": now.isoformat(),
            "valid_until": (now + timedelta(days=trip_days)).isoformat(),
            "latitude": latitude,
            "longitude": longitude,
            "trip_days": trip_days,
        },
        "static": static,
        "dynamic": {
            "forecast": forecast,
            "sst_chlorophyll_current": current_sst_chl or {
                "note": "Copernicus grid unavailable — run scripts/fetch_copernicus_grid.py"
            },
            "cyclone_alerts": [],
            "cyclone_alerts_note": (
                "IMD cyclone bulletins unavailable: all IMD endpoints require an API key "
                "this project does not have (confirmed 401 'API key missing')."
            ),
            "geofence_alerts": geofence_alerts,
            "in_indian_waters": is_in_indian_waters(latitude, longitude),
        },
        "historical": historical,
    }
    return bundle


def estimate_size_mb(bundle: dict) -> float:
    """Rough serialized-JSON size estimate for the mobile client's download UI."""
    return round(len(json.dumps(bundle)) / (1024 * 1024), 2)


def sync_offline_bundle(latitude: float, longitude: float, trip_days: int = DEFAULT_TRIP_DAYS) -> dict:
    """Entry point called by the /offline/sync-bundle endpoint."""
    bundle = prepare_offline_bundle(latitude, longitude, trip_days)
    return {
        "bundle": bundle,
        "size_mb": estimate_size_mb(bundle),
        "valid_until": bundle["metadata"]["valid_until"],
    }


# ── What the mobile side (ARP) still needs to build ─────────────────────────
#
# This file and the /offline/sync-bundle endpoint in main.py are the backend
# half only. Mobile needs (per UPDATE.md 3.3 — NOT implemented here):
#   1. A "Download Offline Bundle" action that POSTs to /offline/sync-bundle
#      with { latitude, longitude, trip_days } (this backend uses lat/lon,
#      not a port name string, to reuse the same coordinates already sent to
#      every other endpoint — resolve the user's operatingPort to lat/lon
#      client-side, e.g. from portInfo.latitude/longitude, before calling).
#   2. Local storage for the returned bundle (SQLite or AsyncStorage/JSON —
#      mobile/src/services/OfflineService.ts per the plan).
#   3. A connectivity check that switches ChatScreen (and Map/PFZ) to answer
#      from the cached bundle instead of calling /chat when offline.
#   4. Re-sync when back online, and a "last updated" indicator in the UI.
