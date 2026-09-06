"""
copernicus_service.py — Local lookups against the precomputed SST/Chlorophyll grid.

The grid itself is built offline by backend/scripts/fetch_copernicus_grid.py
(current SST + CHL over the India EEZ, see COPERNICUS_DATA_ACCESS.md) and cached
at data/dynamic/sst_chl_grid.json. Looking up a query point here is a local
nearest-neighbor search — no live Copernicus API call on the request path.

Re-run the fetch script periodically (daily) to refresh the grid.
"""

import json
import os
from functools import lru_cache
from typing import Optional

from src.utils.geo import haversine

# File is at: backend/src/services/copernicus_service.py
# Data is at:  SeaSarathi/data/dynamic/
_GRID_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "data", "dynamic", "sst_chl_grid.json"
)


@lru_cache(maxsize=1)
def _load_grid() -> Optional[dict]:
    path = os.path.abspath(_GRID_PATH)
    if not os.path.exists(path):
        print(f"[copernicus_service] WARNING: {path} not found. Run scripts/fetch_copernicus_grid.py. "
              f"SST/Chlorophyll will be unavailable.")
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def lookup_nearest(lat: float, lon: float) -> Optional[dict]:
    """
    Returns the nearest precomputed grid point's SST/CHL data, or None if the
    grid file is missing. Result includes distance_km so callers can judge
    how representative the value is for a given query point.
    """
    grid = _load_grid()
    if not grid or not grid.get("points"):
        return None

    best = None
    best_dist = float("inf")
    for point in grid["points"]:
        dist = haversine(lat, lon, point["lat"], point["lon"])
        if dist < best_dist:
            best_dist = dist
            best = point

    if best is None:
        return None

    return {
        "sst_c": best["sst_c"],
        "chl_mg_m3": best["chl_mg_m3"],
        "distance_km": round(best_dist, 2),
        "grid_generated_at": grid.get("generated_at"),
        "sst_time": grid.get("sst_time"),
        "chl_time": grid.get("chl_time"),
    }
