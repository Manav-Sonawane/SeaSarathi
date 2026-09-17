"""landing.py — nearest fish-landing-center lookups (1223 real locations)."""
import os
from fastapi import APIRouter, HTTPException
from src.utils.geojson_store import DATA_DIR, load_geojson

router = APIRouter()


@router.get("/landing/nearest", summary="Nearest Landing Locations")
async def get_nearest_landing(latitude: float = 8.5, longitude: float = 76.2, limit: int = 5):
    """
    Returns the {limit} nearest fish landing centers to the given coordinates.
    Data from LANDING-LOCATIONS.geojson (1223 locations across India).
    Each result includes name, district, sector, and distance in km.
    """
    from src.utils.geo import find_nearest_landing_sites
    landing_path = os.path.join(DATA_DIR, "LANDING-LOCATIONS.geojson")
    if not os.path.exists(landing_path):
        raise HTTPException(status_code=404, detail="LANDING-LOCATIONS.geojson not found")
    landing_geojson = load_geojson(landing_path)
    sites = find_nearest_landing_sites(latitude, longitude, landing_geojson, n=limit)
    return {"sites": sites, "count": len(sites), "query_lat": latitude, "query_lon": longitude}
