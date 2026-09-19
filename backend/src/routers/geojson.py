"""
geojson.py — static GeoJSON layers (PFZ zones, landing centers, maritime
boundaries) plus the derived risk heatmap layer.
"""
import os
from fastapi import APIRouter, HTTPException
from src.utils.geojson_store import DATA_DIR, load_geojson, load_geojson_for_mobile

router = APIRouter()


@router.get("/geojson/pfz", summary="PFZ Zones GeoJSON")
async def get_pfz_geojson():
    """Returns all 52 Potential Fishing Zones as GeoJSON FeatureCollection
    (geometry simplified for mobile rendering — see geojson_store.py)."""
    path = os.path.join(DATA_DIR, "PFZ.geojson")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="PFZ.geojson not found in /data/static/")
    return load_geojson_for_mobile(path)


@router.get("/geojson/landing", summary="Landing Centers GeoJSON")
async def get_landing_geojson():
    """Returns all 1223 fish landing centers as a GeoJSON FeatureCollection, for map pins."""
    path = os.path.join(DATA_DIR, "LANDING-LOCATIONS.geojson")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="LANDING-LOCATIONS.geojson not found in /data/static/")
    return load_geojson(path)


@router.get("/geojson/boundaries", summary="Maritime Boundaries GeoJSON")
async def get_boundaries_geojson():
    """Returns India EEZ + international maritime boundaries as one FeatureCollection
    (geometry simplified for mobile rendering — see geojson_store.py)."""
    eez_path = os.path.join(DATA_DIR, "INDIA-EEZ.geojson")
    boundaries_path = os.path.join(DATA_DIR, "INDIAN-WATER-BOUNDARIES.geojson")
    if not os.path.exists(eez_path) or not os.path.exists(boundaries_path):
        raise HTTPException(status_code=404, detail="INDIA-EEZ.geojson or INDIAN-WATER-BOUNDARIES.geojson not found in /data/static/")
    eez = load_geojson_for_mobile(eez_path)
    boundaries = load_geojson_for_mobile(boundaries_path)
    return {
        "type": "FeatureCollection",
        "features": eez.get("features", []) + boundaries.get("features", []),
    }


@router.get("/geojson/risk", summary="Risk Heatmap GeoJSON")
async def get_risk_heatmap(resolution: float = 1.0):
    """
    Returns a GeoJSON FeatureCollection of Point features covering the India EEZ,
    each scored LOW / MODERATE / HIGH based on real Open-Meteo weather data.
    Each feature includes:
      - risk_score (0-100), risk_level, color (#00C853 / #FFB300 / #D50000)
      - wind_speed_10m, wave_height, precipitation, lightning, cyclone
      - sst_c, chlorophyll (from Copernicus precomputed grid)
    Results are cached for 30 minutes. Use /geojson/risk/refresh to force update.

    Query params:
      resolution: Grid spacing in degrees (default 1.0). Use 0.5 for higher density.
    """
    from src.services.risk_heatmap import generate_risk_heatmap
    if resolution not in (0.25, 0.5, 1.0):
        resolution = 1.0   # clamp to supported values
    return generate_risk_heatmap(resolution_deg=resolution)


@router.get("/geojson/risk/refresh", summary="Force-refresh Risk Heatmap Cache")
async def refresh_risk_heatmap(resolution: float = 1.0):
    """Bypass the 30-minute cache and regenerate the risk heatmap immediately."""
    from src.services.risk_heatmap import generate_risk_heatmap
    if resolution not in (0.25, 0.5, 1.0):
        resolution = 1.0
    result = generate_risk_heatmap(resolution_deg=resolution, force_refresh=True)
    return {
        "refreshed": True,
        "total_points": result["metadata"]["total_points"],
        "generation_time_s": result["metadata"]["generation_time_s"],
        "risk_counts": result["metadata"]["risk_counts"],
        "generated_at": result["metadata"]["generated_at"],
    }
