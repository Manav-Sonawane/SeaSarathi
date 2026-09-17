"""geofence.py — maritime boundary / international-waters proximity check."""
from fastapi import APIRouter

router = APIRouter()


@router.get("/geofence/check", summary="Maritime Boundary Geofence Check")
async def geofence_check(latitude: float = 8.5, longitude: float = 76.2):
    """
    Checks if the given coordinates are near or crossing international maritime
    boundaries or outside the India EEZ. Returns severity-sorted alerts.
    Alert types: GEOFENCE_DANGER | GEOFENCE_WARNING | INTERNATIONAL_WATERS
    """
    from src.utils.geofence import check_geofence, is_in_indian_waters
    alerts = check_geofence(latitude, longitude)
    return {
        "latitude": latitude,
        "longitude": longitude,
        "in_indian_waters": is_in_indian_waters(latitude, longitude),
        "alert_count": len(alerts),
        "alerts": alerts,
    }
