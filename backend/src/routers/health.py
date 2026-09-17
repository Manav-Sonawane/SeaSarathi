"""
health.py — process-alive (/health) vs data-ready (/health/ready). See
/health/ready's docstring for why these are deliberately separate
questions.
"""
import os
from fastapi import APIRouter
from src.routers.chat import AGENT_AVAILABLE

router = APIRouter()


@router.get("/health", summary="Health Check")
async def health():
    return {
        "status": "ok",
        "service": "SeaSarathi API",
        "version": "1.0.0",
        "sarvam_key_set": bool(os.getenv("SARVAM_API_KEY")),
        "agent_ready": AGENT_AVAILABLE,
    }


# Process-alive (/health, above) is a different question from "does this
# process have real data to answer with yet". The Copernicus SST/Chlorophyll
# grid startup fetch (src/utils/data_freshness.py) takes ~90s on a cold
# start with no grid file on disk yet — during that window every /chat,
# /pfz/nearest, and /alerts call was already succeeding, just quietly
# returning null/less-complete SST/chlorophyll fields, which looked
# indistinguishable from a bug rather than "still warming up". The mobile
# app polls this endpoint from a startup splash screen instead of guessing.
@router.get("/health/ready", summary="Data Readiness Check")
async def health_ready():
    from src.utils.data_freshness import get_grid_metadata
    from src.services.imd_cache import cache_status

    grid_meta = get_grid_metadata()
    imd_status = cache_status()
    imd_cached_count = sum(1 for s in imd_status.values() if s["cached"])

    return {
        # Overall readiness gates only on the Copernicus grid — that's the
        # one dependency every core feature (chat/dashboard/PFZ) needs for
        # non-null numbers. IMD live-feed scraping is a real external
        # dependency that can legitimately stay down for a while without
        # blocking the rest of the app, so it's reported but not gating.
        "ready": grid_meta is not None,
        "grid": {
            "ready": grid_meta is not None,
            "point_count": grid_meta.get("point_count") if grid_meta else None,
            "generated_at": grid_meta.get("generated_at") if grid_meta else None,
        },
        "imd": {
            "sources_cached": imd_cached_count,
            "sources_total": len(imd_status),
        },
        "agent_ready": AGENT_AVAILABLE,
    }
