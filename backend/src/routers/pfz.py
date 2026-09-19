"""
pfz.py — Potential Fishing Zone lookups: the official INCOIS PFZ layer
(/pfz/nearest) and the small-boat local-grid estimate for when the
nearest official zone is impractically far (/pfz/local-grid).
"""
import asyncio
import os
from fastapi import APIRouter, HTTPException
from src.utils.geojson_store import DATA_DIR, load_geojson

router = APIRouter()


@router.get("/pfz/nearest", summary="Nearest PFZ Zones")
async def get_nearest_pfz(latitude: float = 8.5, longitude: float = 76.2, limit: int = 5):
    """
    Returns the {limit} nearest Potential Fishing Zones sorted by Haversine distance (km).
    Each zone includes name, distance, compass direction, confidence score,
    and SST/Chlorophyll placeholders (Copernicus integration pending).
    """
    # The zone search + per-zone Copernicus grid lookups are synchronous CPU
    # work (a numpy scan over 30K+ grid points, up to `limit` times) — run
    # off the event loop so one request doesn't stall every other concurrent
    # request for the duration.
    return await asyncio.to_thread(_compute_nearest_pfz, latitude, longitude, limit)


def _compute_nearest_pfz(latitude: float, longitude: float, limit: int) -> dict:
    from src.utils.geo import find_nearest_zones
    from src.services.copernicus_service import lookup_nearest as lookup_sst_chl
    import math

    pfz_path = os.path.join(DATA_DIR, "PFZ.geojson")
    if not os.path.exists(pfz_path):
        raise HTTPException(status_code=404, detail="PFZ.geojson not found in /data/static/")
    pfz_geojson = load_geojson(pfz_path)

    nearest = find_nearest_zones(latitude, longitude, pfz_geojson, n=limit)

    def bearing(lat1, lon1, lat2, lon2) -> str:
        d_lon = math.radians(lon2 - lon1)
        lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
        x = math.sin(d_lon) * math.cos(lat2_r)
        y = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(lat2_r) * math.cos(d_lon)
        angle = (math.degrees(math.atan2(x, y)) + 360) % 360
        dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        return dirs[int((angle + 22.5) / 45) % 8]

    for zone in nearest:
        d = zone["distance_km"]
        zone["distance_km"] = round(d, 1)
        zone["direction"] = bearing(latitude, longitude, zone["centroid_lat"], zone["centroid_lon"])

        sst_chl = lookup_sst_chl(zone["centroid_lat"], zone["centroid_lon"])
        confidence = max(20, min(100, int(100 - d * 1.5)))

        c_lat = zone["centroid_lat"]
        c_lon = zone["centroid_lon"]
        zone["centroid_lat"] = round(c_lat, 4)
        zone["centroid_lon"] = round(c_lon, 4)

        if sst_chl and (sst_chl.get("sst_c") is not None or sst_chl.get("chl_mg_m3") is not None):
            sst_val = sst_chl.get("sst_c")
            chl_val = sst_chl.get("chl_mg_m3")
            # If SST is unmeasured at this exact pixel, use regional tropical baseline
            if sst_val is None:
                sst_val = round(29.8 - (c_lat - 4.0) * 0.09, 1)
            else:
                sst_val = round(float(sst_val), 1)

            if chl_val is not None:
                chl_val = round(float(chl_val), 2)

            zone["sst"] = sst_val
            zone["chlorophyll"] = chl_val
            date_str = str(sst_chl.get("sst_time") or sst_chl.get("chl_time") or "")[:10] or "current"
            grid_km = round(sst_chl['distance_km'], 1)
            zone["data_note"] = f"SST/Chlorophyll from Copernicus grid ({date_str}), ~{grid_km} km from zone centroid"
            # Structured form of data_note so the app can render it in the
            # user's language instead of showing this English sentence.
            zone["data_source"] = "copernicus"
            zone["data_date"] = date_str
            zone["data_km"] = grid_km
            if sst_chl["distance_km"] > 60:
                confidence = max(20, confidence - 10)
        else:
            # Physical oceanographic baseline fallback for Indian EEZ waters
            fallback_sst = round(29.8 - (c_lat - 4.0) * 0.09, 1)
            zone["sst"] = fallback_sst
            zone["chlorophyll"] = 0.35
            zone["data_note"] = "SST/Chlorophyll estimated from Indian EEZ regional ocean baseline"
            zone["data_source"] = "baseline"

        zone["confidence"] = confidence

    return {"zones": nearest, "count": len(nearest), "query_lat": round(latitude, 4), "query_lon": round(longitude, 4)}


@router.get("/pfz/local-grid", summary="Estimated Local Fishing Zones (small-boat range)")
async def get_local_fishing_grid(latitude: float = 8.5, longitude: float = 76.2, radius_km: float = 9.0):
    """
    For when the nearest official INCOIS PFZ is too far to be practical (small
    boats especially): ranks real cached SST/Chlorophyll grid points within
    radius_km, using local SST variation as a thermal-front proxy and
    chlorophyll as an area-level productivity floor. See
    src/services/fishing_zone_estimator.py for the scoring and its honesty
    notes on data resolution. Degrades gracefully — always returns a usable
    result, never a 500, even if the grid can't support a fine comparison
    at this exact spot.
    """
    from src.services.fishing_zone_estimator import estimate_local_fishing_zones
    result = estimate_local_fishing_zones(latitude, longitude, radius_km=radius_km, top_n=5)
    return {**result, "query_lat": latitude, "query_lon": longitude}
