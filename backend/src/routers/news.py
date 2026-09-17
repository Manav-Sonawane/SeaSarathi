"""
news.py — Zonal News Feed. src/services/imd_news_feed.py turns the same
cached IMD data behind GET /alerts into short, coastal-zone news bulletins
(Gujarat-Maharashtra, Goa-Karnataka-Kerala, etc.) for the Alerts screen's
collapsible zonal feed.
"""
from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/news/feed", summary="Zonal IMD News Feed")
async def news_feed():
    from src.services.imd_news_feed import get_news_feed
    return await get_news_feed()


@router.get("/news/feed/{zone_id}", summary="Single Zone Bulletin (force refresh)")
async def news_feed_zone(zone_id: str, refresh: bool = False):
    from src.services.imd_news_feed import get_zone_bulletin
    bulletin = await get_zone_bulletin(zone_id, force_refresh=refresh)
    if bulletin is None:
        raise HTTPException(status_code=404, detail=f"Unknown zone_id: {zone_id}")
    return bulletin
