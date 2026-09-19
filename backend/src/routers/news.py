"""
news.py — Zonal News Feed. src/services/imd_news_feed.py turns the same
cached IMD data behind GET /alerts into short, coastal-zone news bulletins
(Gujarat-Maharashtra, Goa-Karnataka-Kerala, etc.) for the Alerts screen's
collapsible zonal feed.
"""
from fastapi import APIRouter, HTTPException, Response

router = APIRouter()


@router.get("/news/feed", summary="Zonal IMD News Feed")
async def news_feed(response: Response):
    import asyncio
    from src.services.imd_cache import get_fresh
    from src.services.imd_news_feed import get_news_feed
    response.headers["Cache-Control"] = "no-store"
    await asyncio.gather(*(get_fresh(n) for n in ("fisherman_warnings", "sea_area_bulletins", "cyclone_warnings")))
    return await get_news_feed()


@router.get("/news/feed/{zone_id}", summary="Single Zone Bulletin (force refresh)")
async def news_feed_zone(zone_id: str, refresh: bool = False):
    from src.services.imd_news_feed import get_zone_bulletin
    bulletin = await get_zone_bulletin(zone_id, force_refresh=refresh)
    if bulletin is None:
        raise HTTPException(status_code=404, detail=f"Unknown zone_id: {zone_id}")
    return bulletin
