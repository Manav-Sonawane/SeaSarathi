"""
geo.py — Geospatial utilities for SeaSarathi.

Based on real data inspection:
  - PFZ.geojson          : 52 MultiLineString features
                           Props: UID, SECTORNAME, Julian_day, Year, Length, Sno
  - LANDING-LOCATIONS    : 1223 Point features
                           Props: LC_NAME, DIST_NAME, SECTOR_NAM, LATITUDE, LONGITUDE
  - INDIA-EEZ            : 2 MultiPolygon features
                           Props: GEONAME, TERRITORY1, SOVEREIGN1, POL_TYPE
  - INDIAN-WATER-BOUNDARIES: 17 MultiLineString features
                           Props: LINE_NAME, LINE_TYPE, TERRITORY1, TERRITORY2
"""

from math import radians, cos, sin, asin, sqrt


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance (km) between two points on Earth.
    Uses the Haversine formula.
    """
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * R * asin(sqrt(a))


def _centroid_of_coords(coords_list: list) -> tuple[float, float] | None:
    """
    Compute a simple centroid (mean lon, mean lat) from a flat list of [lon, lat] pairs.
    Returns (centroid_lat, centroid_lon) or None if empty.
    """
    if not coords_list:
        return None
    lons = [p[0] for p in coords_list]
    lats = [p[1] for p in coords_list]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def _geometry_centroid(geom: dict) -> tuple[float, float] | None:
    """
    Get (lat, lon) centroid for any GeoJSON geometry type.
    Supports: Point, LineString, MultiLineString, Polygon, MultiPolygon.
    PFZ zones and Boundaries are MultiLineString — handled correctly here.
    """
    if not geom:
        return None

    geom_type = geom.get("type", "")
    coords = geom.get("coordinates", [])

    if geom_type == "Point":
        return coords[1], coords[0]  # (lat, lon)

    elif geom_type == "LineString":
        return _centroid_of_coords(coords)

    elif geom_type == "MultiLineString":
        # Flatten all line segments and compute overall centroid
        all_pts = [pt for line in coords for pt in line]
        return _centroid_of_coords(all_pts)

    elif geom_type == "Polygon":
        # Use exterior ring
        return _centroid_of_coords(coords[0]) if coords else None

    elif geom_type == "MultiPolygon":
        # Centroid of all exterior rings combined
        all_pts = [pt for polygon in coords for pt in polygon[0]]
        return _centroid_of_coords(all_pts)

    return None


def find_nearest_zones(lat: float, lon: float, geojson: dict, n: int = 5) -> list[dict]:
    """
    Find the N nearest PFZ zones to the given coordinates.

    PFZ.geojson has:
      - 52 MultiLineString features
      - Properties: UID, SECTORNAME, Julian_day, Year, Length, Sno

    Returns list of dicts sorted by distance_km ascending, each with:
      name, uid, sector, julian_day, year, length_km,
      distance_km, centroid_lat, centroid_lon
    """
    zones = []

    for feature in geojson.get("features", []):
        geom = feature.get("geometry", {})
        props = feature.get("properties", {})

        result = _geometry_centroid(geom)
        if result is None:
            continue

        centroid_lat, centroid_lon = result
        dist = haversine(lat, lon, centroid_lat, centroid_lon)

        # Build a human-readable name from available fields
        uid = props.get("UID", "")
        sector = props.get("SECTORNAME", "").strip()
        julian_day = props.get("Julian_day", "")
        year = props.get("Year", "")
        sno = props.get("Sno", "")

        # Name: prefer SECTORNAME, fall back to UID
        if sector:
            name = sector
        elif uid:
            name = f"PFZ-{year}-{str(sno).zfill(3)}"
        else:
            name = f"Zone {len(zones) + 1}"

        zones.append({
            "name": name,
            "uid": uid,
            "sector": sector,
            "julian_day": julian_day,
            "year": year,
            "length_km": round(props.get("Length", 0.0), 2),
            "distance_km": round(dist, 2),
            "centroid_lat": round(centroid_lat, 4),
            "centroid_lon": round(centroid_lon, 4),
        })

    return sorted(zones, key=lambda z: z["distance_km"])[:n]


def find_nearest_landing_sites(lat: float, lon: float, geojson: dict, n: int = 5) -> list[dict]:
    """
    Find the N nearest landing locations from LANDING-LOCATIONS.geojson.

    LANDING-LOCATIONS has:
      - 1223 Point features
      - Properties: LC_NAME, DIST_NAME, SECTOR_NAM, LATITUDE, LONGITUDE,
                    LC_UNIQUE_, SECTOR_ID, STATUS

    Returns list of dicts sorted by distance_km ascending.
    """
    sites = []

    for feature in geojson.get("features", []):
        geom = feature.get("geometry", {})
        props = feature.get("properties", {})

        result = _geometry_centroid(geom)
        if result is None:
            continue

        site_lat, site_lon = result
        dist = haversine(lat, lon, site_lat, site_lon)

        sites.append({
            "name": props.get("LC_NAME", "Unknown"),
            "district": props.get("DIST_NAME", ""),
            "sector": props.get("SECTOR_NAM", ""),
            "unique_id": props.get("LC_UNIQUE_", ""),
            "status": props.get("STATUS", ""),
            "latitude": site_lat,
            "longitude": site_lon,
            "distance_km": round(dist, 2),
        })

    return sorted(sites, key=lambda s: s["distance_km"])[:n]
