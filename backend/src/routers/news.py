"""
news.py — Zonal News Feed. src/services/imd_news_feed.py turns the same
cached IMD data behind GET /alerts into short, coastal-zone news bulletins
(Gujarat-Maharashtra, Goa-Karnataka-Kerala, etc.) for the Alerts screen's
collapsible zonal feed.
"""
from fastapi import APIRouter, HTTPException, Response

router = APIRouter()


@router.get("/news/feed", summary="Zonal IMD News Feed")
async def news_feed(response: Response, lang: str = "en"):
    import asyncio
    from src.services.imd_cache import get_fresh
    from src.services.imd_news_feed import get_news_feed
    from src.services.translation_service import is_translatable, translate_many
    response.headers["Cache-Control"] = "no-store"
    await asyncio.gather(*(get_fresh(n) for n in ("fisherman_warnings", "sea_area_bulletins", "cyclone_warnings")))
    feed = await get_news_feed()
    if not is_translatable(lang):
        return feed

    # Original English headline/body stay as-is; the translation is added as
    # `translated` so the app can show both. Bulletins are shared with the
    # in-memory bulletin cache, so build new dicts rather than mutating them.
    zones = feed["zones"]
    texts = [z[k] for z in zones for k in ("headline", "body")]
    translated = await translate_many(texts, lang)
    out_zones = []
    for i, z in enumerate(zones):
        headline_t, body_t = translated[2 * i], translated[2 * i + 1]
        if headline_t and body_t:
            z = {**z, "translated": {"headline": headline_t, "body": body_t, "lang": lang}}
        out_zones.append(z)
    return {**feed, "zones": out_zones}


@router.get("/news/feed/{zone_id}", summary="Single Zone Bulletin (force refresh)")
async def news_feed_zone(zone_id: str, refresh: bool = False):
    from src.services.imd_news_feed import get_zone_bulletin
    bulletin = await get_zone_bulletin(zone_id, force_refresh=refresh)
    if bulletin is None:
        raise HTTPException(status_code=404, detail=f"Unknown zone_id: {zone_id}")
    return bulletin
