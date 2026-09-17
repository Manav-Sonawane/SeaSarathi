"""
data.py — static/dynamic data file status, and the Copernicus grid's
freshness check + manual refresh trigger.
"""
import os
from fastapi import APIRouter
from src.utils.geojson_store import DATA_DIR

router = APIRouter()

DYNAMIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "data", "dynamic")


@router.get("/data/status", summary="Data Freshness Status")
async def data_status():
    """Check which static and dynamic data files are present and their sizes."""
    static_files = [
        "PFZ.geojson",
        "INDIA-EEZ.geojson",
        "INDIAN-WATER-BOUNDARIES.geojson",
        "LANDING-LOCATIONS.geojson",
    ]
    status_static = {}
    for f in static_files:
        path = os.path.join(DATA_DIR, f)
        status_static[f] = {
            "exists": os.path.exists(path),
            "size_bytes": os.path.getsize(path) if os.path.exists(path) else 0,
        }

    dynamic_files = ["sst_chl_grid.json"]
    status_dynamic = {}
    for f in dynamic_files:
        path = os.path.join(DYNAMIC_DIR, f)
        status_dynamic[f] = {
            "exists": os.path.exists(path),
            "size_bytes": os.path.getsize(path) if os.path.exists(path) else 0,
        }

    return {"static_data": status_static, "dynamic_data": status_dynamic}


async def _grid_status(refresh_if_stale: bool) -> dict:
    """
    Shared "check age/staleness, optionally refresh, check again" logic
    behind both /data/freshness and /data/refresh below — those two
    endpoints used to duplicate this same sequence with slightly different
    variable names. Each endpoint still shapes its own response (their
    field names are both live-depended-on by the mobile app's
    freshnessAPI — see mobile/src/services/api.ts — so the response
    contracts stay exactly as they were; only the underlying logic is now
    written once).
    """
    from src.utils.data_freshness import get_grid_age_hours, is_grid_stale, get_grid_metadata, refresh_grid_if_stale

    age = get_grid_age_hours()
    stale = is_grid_stale()
    refreshed = False
    if refresh_if_stale and stale:
        res = await refresh_grid_if_stale()
        refreshed = res.get("refreshed", False)
        age = get_grid_age_hours()
        stale = is_grid_stale()
    return {"age": age, "stale": stale, "refreshed": refreshed, "metadata": get_grid_metadata()}


@router.get("/data/freshness", summary="Copernicus Grid Freshness")
async def data_freshness(auto_refresh: bool = False):
    """
    Age of the precomputed SST/Chlorophyll grid and whether it's due for a
    refresh (see src/utils/data_freshness.py). If auto_refresh=True and the data
    is stale (>6 hours old or missing), triggers an automatic background re-fetch.
    """
    from src.utils.data_freshness import DEFAULT_MAX_AGE_HOURS

    status = await _grid_status(refresh_if_stale=auto_refresh)
    return {
        "grid_age_hours": round(status["age"], 2) if status["age"] is not None else None,
        "stale": status["stale"],
        "max_age_hours": DEFAULT_MAX_AGE_HOURS,
        "grid_exists": status["age"] is not None,
        "refreshed": status["refreshed"],
        "metadata": status["metadata"],
    }


@router.post("/data/refresh", summary="Trigger Data Refresh")
async def data_refresh(force: bool = False):
    """
    Refreshes the SST/Chlorophyll grid.
    If force=False, only refreshes if current data is older than 6 hours (or missing).
    If force=True, forces an immediate unconditional re-fetch.
    """
    from src.utils.data_freshness import get_grid_age_hours, refresh_grid_now

    prev_age = get_grid_age_hours()

    if force:
        # Genuinely distinct from _grid_status's "only if stale" logic —
        # force means unconditional, so it stays its own path.
        ok = await refresh_grid_now()
        status = await _grid_status(refresh_if_stale=False)
    else:
        status = await _grid_status(refresh_if_stale=True)
        ok = status["refreshed"]

    new_age = status["age"]
    return {
        "success": ok,
        "previous_age_hours": round(prev_age, 2) if prev_age is not None else None,
        "new_age_hours": round(new_age, 2) if new_age is not None else None,
        "stale": status["stale"],
        "metadata": status["metadata"],
        "message": (
            "Data successfully re-fetched and updated."
            if ok
            else "Data is already fresh (< 6 hours old). Set force=true to override."
        ),
    }
