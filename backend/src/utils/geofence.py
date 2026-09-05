"""
geofence.py — Geofence and maritime boundary checks for SeaSarathi.

Uses INDIAN-WATER-BOUNDARIES.geojson (static, pre-downloaded) to detect:
  - Proximity to international maritime boundaries (Pakistan, Sri Lanka, etc.)
  - Proximity to international EEZ limits (200 nm line)
  - Whether a point is outside the India EEZ (in international waters)

Safety Rules:
  - Any point within WARNING_KM of an international boundary triggers a caution alert.
  - Any point within DANGER_KM of an international boundary triggers a danger alert.
  - Any point outside India EEZ triggers an international-waters alert.

No LLM involvement — purely deterministic boundary checking.
"""

import json
import os
import math
from functools import lru_cache
from typing import Optional
from shapely.geometry import Point, shape
from shapely.ops import unary_union

# ── Thresholds ─────────────────────────────────────────────────────────────────

WARNING_KM = 50.0    # Caution alert if within 50 km of an international boundary
DANGER_KM  = 15.0    # Danger alert if within 15 km of an international boundary

# ── File Paths ─────────────────────────────────────────────────────────────────

# File is at: backend/src/utils/geofence.py
# Data is at:  SeaSarathi/data/static/
# So we go up: src/utils -> src -> backend -> SeaSarathi -> data/static
_STATIC_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "data", "static"
)
_BOUNDARIES_PATH = os.path.join(_STATIC_DIR, "INDIAN-WATER-BOUNDARIES.geojson")
_EEZ_PATH        = os.path.join(_STATIC_DIR, "INDIA-EEZ.geojson")


# ── Geometry Loaders (cached at startup) ──────────────────────────────────────

@lru_cache(maxsize=1)
def _load_boundary_features() -> list:
    """
    Load all features from INDIAN-WATER-BOUNDARIES.geojson.
    Real data: 17 MultiLineString features.
    Properties: LINE_NAME, LINE_TYPE, TERRITORY1, TERRITORY2, SOVEREIGN1, SOVEREIGN2
    Returns list of dicts: {name, type, neighbors, geometry (shapely)}
    """
    path = os.path.abspath(_BOUNDARIES_PATH)
    if not os.path.exists(path):
        print(f"[geofence] WARNING: {path} not found. Geofence checks will be skipped.")
        return []

    with open(path, encoding="utf-8") as f:
        geojson = json.load(f)

    features = []
    for feature in geojson.get("features", []):
        geom = feature.get("geometry")
        props = feature.get("properties", {})
        if not geom:
            continue
        try:
            shapely_geom = shape(geom)
            # Real keys from INDIAN-WATER-BOUNDARIES.geojson
            name = props.get("LINE_NAME") or "Unknown maritime boundary"
            b_type = props.get("LINE_TYPE") or "maritime_boundary"
            t1 = props.get("TERRITORY1") or ""
            t2 = props.get("TERRITORY2") or ""
            features.append({
                "name": name,
                "type": b_type,
                "neighbors": f"{t1} / {t2}".strip(" /"),
                "geometry": shapely_geom,
                "properties": props,
            })
        except Exception as e:
            print(f"[geofence] Skipping invalid boundary feature: {e}")

    print(f"[geofence] Loaded {len(features)} boundary feature(s).")
    return features


@lru_cache(maxsize=1)
def _load_eez_union():
    """
    Load and union the India EEZ polygons into a single Shapely geometry.
    Real data: 2 MultiPolygon features.
    Properties: GEONAME, TERRITORY1, SOVEREIGN1, POL_TYPE, MRGID
    Both regions: main EEZ + Andaman & Nicobar.
    """
    path = os.path.abspath(_EEZ_PATH)
    if not os.path.exists(path):
        print(f"[geofence] WARNING: {path} not found. EEZ checks disabled.")
        return None

    with open(path, encoding="utf-8") as f:
        geojson = json.load(f)

    geometries = []
    for f in geojson.get("features", []):
        geom = f.get("geometry")
        props = f.get("properties", {})
        if geom:
            try:
                geometries.append(shape(geom))
                geoname = props.get("GEONAME", "unknown")
                print(f"[geofence] EEZ loaded: {geoname}")
            except Exception as e:
                print(f"[geofence] Skipping invalid EEZ geometry: {e}")

    if not geometries:
        return None

    return unary_union(geometries)


# ── Haversine (local, no import needed) ───────────────────────────────────────

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _min_distance_to_geometry(lat: float, lon: float, geom) -> float:
    """
    Compute minimum distance (km) from a point to a Shapely geometry.
    Boundaries are MultiLineString — we sample their coordinate points directly.
    This avoids the 'geometry.boundary' path which doesn't work well for lines.
    """
    pt = Point(lon, lat)

    # For polygon types: if point is inside, distance is 0
    if geom.geom_type in ("Polygon", "MultiPolygon"):
        try:
            if geom.contains(pt):
                return 0.0
        except Exception:
            pass

    # Collect all coordinate pairs from the geometry
    coords = []
    try:
        if geom.geom_type == "LineString":
            coords = list(geom.coords)
        elif geom.geom_type == "MultiLineString":
            for line in geom.geoms:
                coords.extend(list(line.coords))
        elif geom.geom_type == "Polygon":
            coords = list(geom.exterior.coords)
        elif geom.geom_type == "MultiPolygon":
            for poly in geom.geoms:
                coords.extend(list(poly.exterior.coords))
        else:
            # Fallback: degree-based approximation
            return geom.distance(pt) * 111.0
    except Exception:
        return geom.distance(pt) * 111.0

    if not coords:
        return geom.distance(pt) * 111.0

    # Sample at most 500 coordinates for performance
    step = max(1, len(coords) // 500)
    min_dist = float("inf")
    for c in coords[::step]:
        d = _haversine_km(lat, lon, c[1], c[0])
        if d < min_dist:
            min_dist = d

    return min_dist


# ── Public API ─────────────────────────────────────────────────────────────────

def check_geofence(lat: float, lon: float) -> list[dict]:
    """
    Check if a given (lat, lon) is near international maritime boundaries
    or outside India's EEZ.

    Args:
        lat: Latitude in decimal degrees
        lon: Longitude in decimal degrees

    Returns:
        List of alert dicts. Empty list = no geofence concerns.
        Each alert has:
            type:     "GEOFENCE_DANGER" | "GEOFENCE_WARNING" | "INTERNATIONAL_WATERS"
            message:  Human-readable description
            boundary: Name of the boundary/feature triggered
            distance_km: Approximate distance to the boundary (0 if inside)
            severity: "HIGH" | "MODERATE" | "INFO"
    """
    alerts = []
    pt = Point(lon, lat)

    # ── Check 1: Is the point outside India's EEZ? ───────────────────────────
    eez = _load_eez_union()
    if eez is not None:
        try:
            if not eez.contains(pt):
                alerts.append({
                    "type": "INTERNATIONAL_WATERS",
                    "message": (
                        "You appear to be outside India's EEZ. "
                        "Entering international waters without proper documentation "
                        "is illegal. Return to Indian maritime territory."
                    ),
                    "boundary": "India EEZ Limit",
                    "distance_km": 0.0,
                    "severity": "HIGH",
                })
        except Exception as e:
            print(f"[geofence] EEZ check failed: {e}")

    # ── Check 2: Proximity to international boundaries ──────────────────────────────────────────────────
    boundary_features = _load_boundary_features()
    for feature in boundary_features:
        try:
            dist = _min_distance_to_geometry(lat, lon, feature["geometry"])
        except Exception as e:
            print(f"[geofence] Distance check failed for {feature['name']}: {e}")
            continue

        if dist <= DANGER_KM:
            alerts.append({
                "type": "GEOFENCE_DANGER",
                "message": (
                    f"DANGER: You are approximately {dist:.1f} km from "
                    f"{feature['name']} ({feature.get('neighbors', '')}). "
                    f"Do NOT cross this boundary. Fishing near international borders without authorization is illegal."
                ),
                "boundary": feature["name"],
                "boundary_type": feature.get("type", ""),
                "neighbors": feature.get("neighbors", ""),
                "distance_km": round(dist, 2),
                "severity": "HIGH",
            })
        elif dist <= WARNING_KM:
            alerts.append({
                "type": "GEOFENCE_WARNING",
                "message": (
                    f"CAUTION: You are approximately {dist:.1f} km from "
                    f"{feature['name']} ({feature.get('neighbors', '')}). "
                    f"Avoid approaching this boundary. Stay well within Indian maritime limits."
                ),
                "boundary": feature["name"],
                "boundary_type": feature.get("type", ""),
                "neighbors": feature.get("neighbors", ""),
                "distance_km": round(dist, 2),
                "severity": "MODERATE",
            })

    # Sort: DANGER first, then WARNING, then INTERNATIONAL_WATERS
    severity_order = {"HIGH": 0, "MODERATE": 1, "INFO": 2}
    alerts.sort(key=lambda a: severity_order.get(a["severity"], 99))

    return alerts


def is_in_indian_waters(lat: float, lon: float) -> bool:
    """Returns True if the point is inside India's EEZ."""
    eez = _load_eez_union()
    if eez is None:
        return True  # Default to safe if EEZ data missing
    try:
        return bool(eez.contains(Point(lon, lat)))
    except Exception:
        return True


# ── CLI Test ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    test_cases = [
        (15.0, 72.5,  "Arabian Sea (safe Indian waters)"),
        (8.5,  77.5,  "Kochi (coastal, inside EEZ)"),
        (23.0, 67.5,  "Near Pakistan maritime border"),
        (8.0,  76.5,  "Near Sri Lanka maritime border"),
        (10.0, 93.5,  "Andaman Sea (Indian EEZ)"),
    ]

    print("GeofenceChecker — Test Results\n" + "=" * 50)
    for lat, lon, label in test_cases:
        print(f"\nLocation: {label} ({lat}N, {lon}E)")
        alerts = check_geofence(lat, lon)
        if not alerts:
            print("  ✅ No geofence alerts — safe location.")
        for a in alerts:
            icon = "🔴" if a["severity"] == "HIGH" else "🟡"
            print(f"  {icon} [{a['type']}] {a['message'][:80]}...")
