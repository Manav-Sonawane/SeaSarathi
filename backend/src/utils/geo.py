"""
Geospatial utilities for SeaSarathi.
- Haversine distance calculation
- Nearest PFZ zone finder
"""

from math import radians, cos, sin, asin, sqrt


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance (km) between two points on Earth.
    Uses the Haversine formula.

    Args:
        lat1, lon1: Source coordinates (degrees)
        lat2, lon2: Destination coordinates (degrees)

    Returns:
        Distance in kilometres.
    """
    R = 6371.0  # Earth radius in km

    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * R * asin(sqrt(a))


def find_nearest_zones(lat: float, lon: float, geojson: dict, n: int = 5) -> list[dict]:
    """
    Find the N nearest PFZ zones to the given coordinates from a GeoJSON FeatureCollection.
    Works with Point, Polygon, and MultiPolygon geometry types.

    For Polygon/MultiPolygon, uses the centroid (average of first ring's vertices).

    Args:
        lat: Query latitude
        lon: Query longitude
        geojson: GeoJSON FeatureCollection with PFZ features
        n: Number of nearest zones to return

    Returns:
        List of dicts sorted by distance_km ascending.
    """
    zones = []

    for feature in geojson.get("features", []):
        geom = feature.get("geometry", {})
        props = feature.get("properties", {})
        geom_type = geom.get("type", "")
        coords = geom.get("coordinates", [])

        zone_lat, zone_lon = None, None

        if geom_type == "Point":
            zone_lon, zone_lat = coords[0], coords[1]

        elif geom_type == "Polygon" and coords:
            # Centroid of exterior ring
            ring = coords[0]
            if ring:
                zone_lon = sum(p[0] for p in ring) / len(ring)
                zone_lat = sum(p[1] for p in ring) / len(ring)

        elif geom_type == "MultiPolygon" and coords:
            # Centroid of first polygon's exterior ring
            ring = coords[0][0]
            if ring:
                zone_lon = sum(p[0] for p in ring) / len(ring)
                zone_lat = sum(p[1] for p in ring) / len(ring)

        if zone_lat is not None and zone_lon is not None:
            dist = haversine(lat, lon, zone_lat, zone_lon)
            zones.append({
                "name": props.get("name", props.get("NAME", f"Zone {len(zones)+1}")),
                "distance_km": round(dist, 2),
                "properties": props,
                "centroid_lat": zone_lat,
                "centroid_lon": zone_lon,
            })

    return sorted(zones, key=lambda z: z["distance_km"])[:n]
