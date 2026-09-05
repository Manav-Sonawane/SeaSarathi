"""
marine_grid.py — Reusable EEZ-filtered coordinate grid for SeaSarathi.

Workflow:
    India EEZ GeoJSON
        ↓
    Generate candidate grid points (65°E–100°E, 4°N–25°N)
        ↓
    Filter using EEZ geometry (point-in-polygon via Shapely)
        ↓
    Return (lats, lons) arrays ready for any API (Open-Meteo, Copernicus, etc.)

Design Rules:
  - Only points INSIDE the EEZ are kept (includes Andaman & Nicobar)
  - Filtering is against EEZ polygons, NOT the coastline or bounding box
  - The same grid strategy is reused across all environmental datasets
  - Grid resolution is configurable (default 0.5°)
"""

import json
import os
import numpy as np
from functools import lru_cache
from shapely.geometry import Point, shape
from shapely.ops import unary_union

# ── Constants ──────────────────────────────────────────────────────────────────

# Geographic working envelope for Indian marine region
LAT_MIN, LAT_MAX = 4.0, 25.0
LON_MIN, LON_MAX = 65.0, 100.0

# Path to EEZ GeoJSON (authoritative boundary for filtering)
_EEZ_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "data", "static", "INDIA-EEZ.geojson"
)


# ── EEZ Geometry Loader ────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_eez_union() -> object:
    """
    Load and union all EEZ polygons into a single Shapely geometry.
    Cached after first load — EEZ does not change during runtime.
    Both EEZ regions (main + Andaman & Nicobar) are retained.
    """
    eez_path = os.path.abspath(_EEZ_PATH)
    if not os.path.exists(eez_path):
        raise FileNotFoundError(
            f"India EEZ GeoJSON not found at: {eez_path}\n"
            "Place INDIA-EEZ.geojson in /data/static/"
        )

    with open(eez_path, encoding="utf-8") as f:
        geojson = json.load(f)

    geometries = []
    for feature in geojson.get("features", []):
        geom = feature.get("geometry")
        if geom:
            try:
                geometries.append(shape(geom))
            except Exception as e:
                print(f"[marine_grid] Skipping invalid geometry: {e}")

    if not geometries:
        raise ValueError("No valid geometries found in INDIA-EEZ.geojson")

    print(f"[marine_grid] Loaded {len(geometries)} EEZ polygon(s) and merged into union.")
    return unary_union(geometries)


# ── Grid Generation + Filtering ────────────────────────────────────────────────

def generate_eez_grid(resolution_deg: float = 0.5) -> tuple[np.ndarray, np.ndarray]:
    """
    Generate a regular lat/lon grid within the India marine envelope,
    then filter to keep only points that fall inside the India EEZ.

    Args:
        resolution_deg: Grid spacing in degrees (default 0.5° ≈ ~55 km).
                        Use 1.0° for faster testing, 0.25° for higher density.

    Returns:
        (lats, lons): Two 1-D numpy arrays of matching length.
                      Position i in both arrays forms one coordinate pair.

    Example:
        lats, lons = generate_eez_grid(resolution_deg=0.5)
        # lats[i], lons[i] = one valid marine point inside Indian EEZ
    """
    eez_union = _load_eez_union()

    # Generate candidate grid within bounding envelope
    candidate_lats = np.arange(LAT_MIN, LAT_MAX + resolution_deg, resolution_deg)
    candidate_lons = np.arange(LON_MIN, LON_MAX + resolution_deg, resolution_deg)
    total_candidates = len(candidate_lats) * len(candidate_lons)

    print(
        f"[marine_grid] Generating {total_candidates} candidate points "
        f"at {resolution_deg}° resolution..."
    )

    kept_lats, kept_lons = [], []

    for lat in candidate_lats:
        for lon in candidate_lons:
            pt = Point(lon, lat)           # Shapely: (x=lon, y=lat)
            if eez_union.contains(pt):
                kept_lats.append(round(float(lat), 6))
                kept_lons.append(round(float(lon), 6))

    print(
        f"[marine_grid] EEZ filter: {len(kept_lats)} / {total_candidates} points retained."
    )

    return np.array(kept_lats), np.array(kept_lons)


# ── Convenience: Single-point check ────────────────────────────────────────────

def is_inside_eez(lat: float, lon: float) -> bool:
    """
    Returns True if the given (lat, lon) falls inside the India EEZ.
    Uses the cached EEZ union geometry.

    Args:
        lat: Latitude in decimal degrees
        lon: Longitude in decimal degrees

    Returns:
        bool
    """
    eez_union = _load_eez_union()
    return bool(eez_union.contains(Point(lon, lat)))


# ── CLI test ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Testing marine grid generation at 1.0° resolution...")
    lats, lons = generate_eez_grid(resolution_deg=1.0)
    print(f"Total points: {len(lats)}")
    print(f"Sample (first 5):")
    for i in range(min(5, len(lats))):
        print(f"  ({lats[i]:.1f}°N, {lons[i]:.1f}°E)")

    # Single point check
    test_cases = [
        (15.0, 72.5, "Arabian Sea (should be inside EEZ)"),
        (12.0, 80.0, "Bay of Bengal (should be inside EEZ)"),
        (12.0, 66.0, "Deep Arabia (likely outside EEZ)"),
        (28.0, 75.0, "Rajasthan land (outside EEZ)"),
    ]
    print("\nPoint-in-EEZ checks:")
    for lat, lon, label in test_cases:
        result = is_inside_eez(lat, lon)
        print(f"  ({lat}°N, {lon}°E) — {label}: {'INSIDE' if result else 'OUTSIDE'}")
