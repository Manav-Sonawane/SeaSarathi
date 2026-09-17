"""
offline.py — Deep Sea Connectivity / Offline Bundle (UPDATE.md Improvement
3). Backend half only. See src/services/offline_cache.py's module
docstring for exactly what mobile (ARP) still needs to build on top of
this endpoint.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class OfflineBundleRequest(BaseModel):
    latitude: float = 8.5        # Default: Kochi
    longitude: float = 76.2
    trip_days: int = 5           # Clamped server-side to [1, 10]


@router.post("/offline/sync-bundle", summary="Build Offline Bundle for Deep-Sea Trips")
async def offline_sync_bundle(request: OfflineBundleRequest):
    """
    Fetches everything the app needs to answer chat/map/PFZ/landing queries
    with no live network connection: static geometry (PFZ zones, maritime
    boundaries, landing centers), a multi-day Open-Meteo forecast, current
    Copernicus SST/chlorophyll, a 30-day historical baseline, and geofence
    status for the departure point. Meant to be called once before sailing,
    not on a hot path — this does real, sometimes-slow upstream fetches
    (Open-Meteo + Copernicus), so expect this to take longer than /chat.
    """
    from src.services.offline_cache import sync_offline_bundle
    try:
        return sync_offline_bundle(request.latitude, request.longitude, request.trip_days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Offline bundle error: {str(e)}")
