"""ocean.py — on-tap SST/chlorophyll lookup for an arbitrary point."""
from fastapi import APIRouter

router = APIRouter()


@router.get("/ocean/point", summary="SST & Chlorophyll at a Point")
async def get_ocean_point(latitude: float = 8.5, longitude: float = 76.2):
    """
    Returns the nearest Copernicus grid cell's SST/chlorophyll for an arbitrary
    point — used for on-tap lookups (e.g. a landing-center pin) rather than
    bulk-enriching every point in a GeoJSON layer up front.
    """
    from src.services.copernicus_service import lookup_nearest as lookup_sst_chl
    result = lookup_sst_chl(latitude, longitude)
    if not result:
        return {
            "available": False,
            "sst_c": None,
            "chlorophyll_mg_m3": None,
            "query_lat": latitude,
            "query_lon": longitude,
        }
    return {
        "available": True,
        "sst_c": result["sst_c"],
        "chlorophyll_mg_m3": result["chl_mg_m3"],
        "grid_distance_km": result["distance_km"],
        "sst_time": result["sst_time"],
        "chl_time": result["chl_time"],
        "query_lat": latitude,
        "query_lon": longitude,
    }
