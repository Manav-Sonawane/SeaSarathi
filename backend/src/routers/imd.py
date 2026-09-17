"""
imd.py — IMD live-feed endpoints, both the always-live-scrape ones (Phases
1-5 of IMD_IMPLEMENTATION_PLAN.md) and the cached unified snapshot (Phase
6, src/services/imd_cache.py). Kept in one router since they're all views
over the same underlying IMD data sources, just different
freshness/latency tradeoffs.
"""
from fastapi import APIRouter, HTTPException

router = APIRouter()


# ─── Fisherman Warnings ────────────────────────────────────────────────────────
# Phase 1. Always live-scrapes on every call (~10-20s) — kept that way deliberately
# rather than reading from Phase 6's cache, since this is the "give me the truth
# right now" endpoint. For a fast, cached, always-current snapshot of this same
# data alongside the other three live feeds, see GET /alerts/imd/all.

@router.get("/imd/fisherman-warnings", summary="IMD Fisherman Warnings (live scrape)")
async def imd_fisherman_warnings():
    from src.services.imd_fisherman_scraper import scrape_fisherman_warnings
    try:
        return await scrape_fisherman_warnings()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"IMD fisherman-warnings scrape failed: {e}")


# ─── Sea Area Bulletins ────────────────────────────────────────────────────────
# Phase 2. Always live-scrapes (see Fisherman Warnings' comment above for why, and
# GET /alerts/imd/all for the cached alternative). The safety-critical TTT
# (cyclone/storm) warning field is parsed deterministically, not via the LLM —
# see imd_sea_area_scraper.py's docstring.

@router.get("/imd/sea-area-bulletins", summary="IMD Sea Area Bulletins (live scrape)")
async def imd_sea_area_bulletins():
    from src.services.imd_sea_area_scraper import scrape_sea_area_bulletins
    try:
        return await scrape_sea_area_bulletins()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"IMD sea-area-bulletins scrape failed: {e}")


# ─── Cyclone/Fishermen Warning Archive ─────────────────────────────────────────
# Phase 3. Always live-scrapes — takes date/days params for arbitrary historical
# queries, which Phase 6's cache (today's data only) can't serve anyway. 15
# regions x `days` dates fetched concurrently (~10-15s for days=1). For today's
# data cached, see GET /alerts/imd/all.

@router.get("/imd/cyclone-warnings", summary="IMD Cyclone/Fishermen Warning Archive (live scrape)")
async def imd_cyclone_warnings(date: str | None = None, days: int = 1):
    """
    `date`: YYYY-MM-DD, defaults to today. `days`: how many days back from
    `date` to include (1-3, see imd_cyclone_warning_scraper.MAX_DAYS).
    """
    from src.services.imd_cyclone_warning_scraper import scrape_cyclone_warnings
    try:
        return await scrape_cyclone_warnings(date_str=date, days=days)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"IMD cyclone-warnings scrape failed: {e}")


# ─── Sea Area Bulletin Archive ─────────────────────────────────────────────────
# Phase 4. Live scrape on every call — no caching/scheduler yet (Phase 6, not
# implemented for this one). `limit` archived PDFs per sea area get their
# divisions parsed (default 5, max 20) — fetching/parsing every historical entry
# would be slow and pointless for a live feed. Expect ~15-20s per parsed entry
# pair (both sea areas fetched together, one LLM call).

@router.get("/imd/sea-area-archive", summary="IMD Sea Area Bulletin Archive (live scrape)")
async def imd_sea_area_archive(limit: int = 5):
    from src.services.imd_sea_area_archive_scraper import scrape_sea_area_archive
    try:
        return await scrape_sea_area_archive(limit=limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"IMD sea-area-archive scrape failed: {e}")


# ─── Port Warning Archive ──────────────────────────────────────────────────────
# Phase 5. Always live-scrapes — takes date/days params like Phase 3's endpoint,
# for the same reason. 120 ports (not the plan's assumed ~8) x `days` dates,
# concurrency-capped at MAX_CONCURRENT_REQUESTS (~8-10s for days=1). `severity`
# is classified from IMD's own published port-signal taxonomy (DC1/DW2/LC3/LW4/
# D5-D7/GD8-GD10/XI) — see imd_port_warning_scraper.py's docstring. For today's
# data cached, see GET /alerts/imd/all.

@router.get("/imd/port-warnings", summary="IMD Port Warning Archive (live scrape)")
async def imd_port_warnings(date: str | None = None, days: int = 1):
    """
    `date`: YYYY-MM-DD, defaults to today. `days`: how many days back from
    `date` to include (1-3, see imd_port_warning_scraper.MAX_DAYS).
    """
    from src.services.imd_port_warning_scraper import scrape_port_warnings
    try:
        return await scrape_port_warnings(date_str=date, days=days)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"IMD port-warnings scrape failed: {e}")


# ─── Unified Cached Snapshot ────────────────────────────────────────────────────
# Phase 6 (src/services/imd_cache.py). Reads from the in-memory cache kept warm
# by main.py's lifespan (startup refresh + periodic staleness loop, same pattern
# as the Copernicus grid) instead of live-scraping — normally near-instant.
# Falls back to a synchronous scrape only if a source has genuinely never been
# cached yet (e.g. a request landing before the startup refresh finished).

@router.get("/alerts/imd/all", summary="All IMD Live Feeds (cached)")
async def imd_all_cached():
    from src.services.imd_cache import get_all
    return await get_all()


@router.get("/alerts/imd/status", summary="IMD Cache Status")
async def imd_cache_status():
    from src.services.imd_cache import cache_status
    return cache_status()
