"""
imd_sea_area_scraper.py — IMD Sea Area Bulletin Scraper (live, current bulletin).

Phase 2 of IMD_IMPLEMENTATION_PLAN.md: Arabian Sea and Bay of Bengal
sea-area bulletins. Verified live against the real pages on 2026-09-16
(https://mausam.imd.gov.in/Forecast/seaarea_bulletin_new.php?id=4 / id=1)
— unlike Phase 1's fisherman-warning hub page, these ARE plain, consistent
HTML pages as the plan assumed, one issuing office per sea area (ACWC
Mumbai / ACWC Kolkata), each with 6-8 named divisions (North West Arabian
Sea, South West Bay, etc.), each division having Wind/Weather/
Visibility/Sea Condition lines in a fixed order.

DESIGN CHOICE — hybrid parsing, not "LLM for everything": the plan's
revised (LLM-based) strategy is followed for the free-form per-division
weather descriptions (wind phrasing genuinely varies: "15 to 20 gusting 20
Knots" vs "15 - 20 kts gusting 25 kts" between the two offices), but the
bulletin HEADER fields — validity window ("Bulletin Valid for 12 hrs from
14 UTC of 2026-09-15 to 02 UTC of 2026-09-16"), the TTT (cyclone/storm)
warning line, and the issue time — follow one fixed IMD template on both
pages tested. These are extracted with plain string parsing, not an LLM
call, for two reasons: (1) it's simply more reliable for a fixed format
than routing it through a model, and (2) TTT Warning is the single most
safety-critical field on this page (cyclone/storm warning presence) —
Phase 1 found a real case of an LLM missing a safety-critical warning
buried in a long document, so this field is deliberately kept OUT of the
LLM's hands entirely rather than relying on a cross-check to catch a miss
after the fact.

The header/division parsing logic here is shared with Phase 4's archive
scraper (imd_sea_area_archive_scraper.py) via imd_sea_bulletin_parser.py —
the archived PDFs turned out to use this exact same document template.
"""
from datetime import datetime, timezone

import aiohttp

from src.services.openrouter_client import OpenRouterError
from src.services.imd_sea_bulletin_parser import clean_bulletin_lines, parse_bulletin_header, llm_parse_divisions

SEA_AREAS = [
    {"id": "arabian_sea", "name": "Arabian Sea", "url": "https://mausam.imd.gov.in/Forecast/seaarea_bulletin_new.php?id=4"},
    {"id": "bay_of_bengal", "name": "Bay of Bengal", "url": "https://mausam.imd.gov.in/Forecast/seaarea_bulletin_new.php?id=1"},
]

REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=30)
_USER_AGENT = "SeaSarathi/1.0 (+https://github.com/; marine safety app for Indian fishermen)"


def _clean_visible_text(html: str) -> list[str]:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(separator="\n")
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    return clean_bulletin_lines(lines)


async def _fetch_text(session: aiohttp.ClientSession, url: str) -> str:
    async with session.get(url, headers={"User-Agent": _USER_AGENT}) as resp:
        resp.raise_for_status()
        return await resp.text()


async def scrape_sea_area_bulletins() -> dict:
    """
    Fetches both sea area bulletins, deterministically parses each header
    (validity window, TTT warning, issue time), then makes one batched LLM
    call for the free-form per-division weather breakdowns. A sea area
    whose page fetch fails gets an `error` entry rather than being dropped
    silently; if the LLM division call fails, both sea areas still return
    with their (already-parsed) header fields and an empty `divisions` list
    plus `division_extraction_error` explaining why.
    """
    async with aiohttp.ClientSession(timeout=REQUEST_TIMEOUT) as session:
        raw_texts: dict[str, list[str]] = {}
        results: dict[str, dict] = {}
        for area in SEA_AREAS:
            try:
                html = await _fetch_text(session, area["url"])
                lines = _clean_visible_text(html)
                raw_texts[area["id"]] = lines
                results[area["id"]] = {
                    "sea_area": area["name"],
                    "source": area["url"],
                    **parse_bulletin_header(lines),
                    "divisions": [],
                    "raw_text": "\n".join(lines),
                    "scraped_at": datetime.now(timezone.utc).isoformat(),
                }
            except Exception as e:
                results[area["id"]] = {
                    "sea_area": area["name"],
                    "source": area["url"],
                    "error": f"{type(e).__name__}: {e}",
                    "scraped_at": datetime.now(timezone.utc).isoformat(),
                }

    fetched_ids = [aid for aid in raw_texts]
    if fetched_ids:
        try:
            batch_input = {aid: "\n".join(raw_texts[aid]) for aid in fetched_ids}
            llm_divisions = await llm_parse_divisions(batch_input)
            for aid in fetched_ids:
                entry = llm_divisions.get(aid)
                if entry and isinstance(entry.get("divisions"), list):
                    results[aid]["divisions"] = entry["divisions"]
                else:
                    results[aid]["division_extraction_error"] = f"No divisions returned for '{aid}' in LLM batch response"
        except OpenRouterError as e:
            for aid in fetched_ids:
                results[aid]["division_extraction_error"] = str(e)

    return {
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "sea_area_bulletins": results,
    }
