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

import numpy as np

# File is at: backend/src/services/copernicus_service.py
# Data is at:  SeaSarathi/data/dynamic/
_GRID_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "data", "dynamic", "sst_chl_grid.json"
)

_EARTH_RADIUS_KM = 6371.0


@lru_cache(maxsize=1)
def _load_grid() -> Optional[dict]:
    """
    Loads the grid once per process (lru_cache) and precomputes numpy arrays
    of lat/lon/sst/chl alongside the raw points list. lookup_nearest() and
    find_within_radius() used to do a plain Python for-loop haversine scan
    over every point on every call (30K+ points, called up to 5x per
    /pfz/nearest request) — a real bottleneck run synchronously on the event
    loop. Vectorizing the haversine distance with numpy over the whole grid
    at once turns that into a single array operation instead of tens of
    thousands of Python-level function calls.
    """
    path = os.path.abspath(_GRID_PATH)
    if not os.path.exists(path):
        print(f"[copernicus_service] WARNING: {path} not found. Run scripts/fetch_copernicus_grid.py. "
              f"SST/Chlorophyll will be unavailable.")
        return None
    with open(path, encoding="utf-8") as f:
        grid = json.load(f)

    points = grid.get("points") or []
    grid["_lats"] = np.array([p["lat"] for p in points], dtype=np.float64)
    grid["_lons"] = np.array([p["lon"] for p in points], dtype=np.float64)
    grid["_sst"] = np.array([p["sst_c"] for p in points], dtype=np.float64)
    grid["_chl"] = np.array([p["chl_mg_m3"] for p in points], dtype=np.float64)
    return grid


def _vectorized_haversine_km(lat: float, lon: float, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """Same formula as src/utils/geo.py's haversine(), computed for one query
    point against every grid point at once instead of one at a time."""
    lat1, lon1 = np.radians(lat), np.radians(lon)
    lat2, lon2 = np.radians(lats), np.radians(lons)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * np.arcsin(np.sqrt(a))


def lookup_nearest(lat: float, lon: float) -> Optional[dict]:
    """
    Returns the nearest precomputed grid point's SST/CHL data, or None if the
    grid file is missing. Result includes distance_km so callers can judge
    how representative the value is for a given query point.
    """
    grid = _load_grid()
    if not grid or not grid.get("points") or len(grid["_lats"]) == 0:
        return None

    dists = _vectorized_haversine_km(lat, lon, grid["_lats"], grid["_lons"])
    idx = int(np.argmin(dists))

    return {
        "sst_c": grid["_sst"][idx].item(),
        "chl_mg_m3": grid["_chl"][idx].item(),
        "distance_km": round(dists[idx].item(), 2),
        "grid_generated_at": grid.get("generated_at"),
        "sst_time": grid.get("sst_time"),
        "chl_time": grid.get("chl_time"),
    }


def find_within_radius(lat: float, lon: float, radius_km: float) -> list[dict]:
    """
    Returns every precomputed grid point within radius_km of (lat, lon), sorted
    nearest-first. Grid is generated at 0.08° (~8-9km) spacing (see
    scripts/fetch_copernicus_grid.py), so a ~9km radius typically yields a
    handful of candidate points — enough to compare, not a dense mesh.
    Returns [] (not None) if the grid file is missing or nothing is in range,
    so callers can treat "no candidates" as a normal, gracefully-handled case.
    """
    grid = _load_grid()
    if not grid or not grid.get("points") or len(grid["_lats"]) == 0:
        return []

    dists = _vectorized_haversine_km(lat, lon, grid["_lats"], grid["_lons"])
    within = np.where(dists <= radius_km)[0]
    order = within[np.argsort(dists[within])]

    return [
        {
            "lat": grid["_lats"][i].item(),
            "lon": grid["_lons"][i].item(),
            "sst_c": grid["_sst"][i].item(),
            "chl_mg_m3": grid["_chl"][i].item(),
            "distance_km": round(dists[i].item(), 2),
        }
        for i in order
    ]


def grid_metadata() -> Optional[dict]:
    """Returns the grid's generation/resolution metadata, or None if not built yet."""
    grid = _load_grid()
    if not grid:
        return None
    return {
        "generated_at": grid.get("generated_at"),
        "sst_time": grid.get("sst_time"),
        "chl_time": grid.get("chl_time"),
        "resolution_deg": grid.get("resolution_deg"),
        "point_count": grid.get("point_count"),
    }
