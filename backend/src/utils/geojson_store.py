"""
geojson_store.py — single shared loader for the static GeoJSON files under
data/static/ (PFZ zones, EEZ/boundaries, landing centers).

Pulled out of main.py during the router split so every router that needs a
static GeoJSON file (geojson, pfz, alerts, landing) shares one lru_cache
instance instead of each importing its own copy of this helper — these
files never change at runtime, so re-parsing them per-router would just be
duplicated startup-adjacent work for no benefit.
"""
import os
import json
from functools import lru_cache

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "data", "static")


@lru_cache(maxsize=8)
def load_geojson(path: str) -> dict:
    """Loads and parses a static GeoJSON file once per process, not on
    every request. Synchronous disk I/O — fine here since it only ever
    runs once per distinct path for the life of the process."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# Mobile-facing simplification. The raw files hold ~137k coordinate points
# (INDIA-EEZ alone is ~14 MB / 86k points) — fine for server-side geofence
# maths, but the phone downloads them as JSON and draws every point as a
# native map polyline, which janks/ANRs low-end Android devices. ~0.005 deg
# (~550 m) is invisible at any zoom a fisherman uses this map at. Server-side
# safety logic (utils/geofence.py) keeps reading the full-resolution files —
# only the payloads sent to the app go through this.
MOBILE_SIMPLIFY_TOLERANCE_DEG = 0.005
MOBILE_COORD_PRECISION = 4  # ~11 m


def _round_coords(coords, precision: int):
    if coords and isinstance(coords[0], (int, float)):
        return [round(c, precision) for c in coords]
    return [_round_coords(c, precision) for c in coords]


@lru_cache(maxsize=8)
def load_geojson_for_mobile(path: str, tolerance_deg: float = MOBILE_SIMPLIFY_TOLERANCE_DEG) -> dict:
    """Same as load_geojson(), but geometries are Douglas-Peucker simplified and
    coordinates rounded, cached once per process. Falls back to the unsimplified
    data if a geometry can't be simplified (never drops or alters a feature's
    properties)."""
    from shapely.geometry import shape, mapping

    data = load_geojson(path)
    features = []
    for feature in data.get("features", []):
        geometry = feature.get("geometry")
        simplified = geometry
        if geometry and geometry.get("type") != "Point":
            try:
                geom = shape(geometry).simplify(tolerance_deg, preserve_topology=True)
                if not geom.is_empty:
                    simplified = mapping(geom)
            except Exception:
                simplified = geometry
        if simplified and "coordinates" in simplified:
            coordinates = _round_coords(simplified["coordinates"], MOBILE_COORD_PRECISION)
            geom_type = simplified["type"]
            # shapely collapses a single-part Multi* geometry into its simple
            # form on simplify — re-wrap so a feature never changes type
            # (clients switch on geometry.type).
            original_type = geometry["type"] if geometry else geom_type
            if original_type == "MultiLineString" and geom_type == "LineString":
                geom_type, coordinates = original_type, [coordinates]
            elif original_type == "MultiPolygon" and geom_type == "Polygon":
                geom_type, coordinates = original_type, [coordinates]
            simplified = {"type": geom_type, "coordinates": coordinates}
        features.append({**feature, "geometry": simplified})
    return {**data, "features": features}
