"""
imd_cyclone_warning_scraper.py — IMD Cyclone/Fishermen Warning Archive Scraper.

Phase 3 of IMD_IMPLEMENTATION_PLAN.md. Source (RSMC New Delhi's warning
archive, searchable by region + date):
https://rsmcnewdelhi.imd.gov.in/warning-archive-information.php?internal_menu=NDU=&menu_id=OA==

Verified live on 2026-09-16 against the real page/form (15 regions, POST
with location/search_date/search fields, DD-MM-YYYY date format). Two
things differ from the plan's assumptions:

1. THIS IS A DIFFERENT (FINER-GRAINED) DATA SOURCE THAN PHASE 1, DESPITE THE
   NAME "CYCLONE WARNING". What's behind this URL is a per-district archive
   of the SAME kind of fisherman-warning PDFs from Phase 1 (same
   uploads/archive/.../*fishermen*.pdf naming), indexed by exact timestamp
   across 15 finer regions (e.g. "South Gujarat" and "North Gujarat"
   separately, vs Phase 1's one combined "Gujarat Coast" PDF) — not a
   distinct cyclone-track bulletin format. If IMD publishes a genuinely
   separate cyclone-track bulletin elsewhere, it isn't this URL.

2. THE TABLE ITSELF IS ALREADY THE CONTENT — no PDF download needed for the
   core fields (a real difference from Phase 1's PDFs). The "Message" and
   "Warning" table cells contain real, substantive free text directly in
   the HTML for most regions (e.g. "Squally weather with strong winds
   along & off South Gujarat coast..." / "Fishermen are advised not to
   venture into the sea"); a few regions (e.g. South Orissa) instead use
   short category labels ("NIL" / "Fishermen Warning" / "No Warning") —
   both styles were found live and are handled the same way. The linked
   PDF is kept only as `pdf_url` for a caller that wants the full source
   document; it is not fetched or parsed here.

DESIGN CHOICE — no LLM call in this phase, continuing the Phase 2 precedent
(deterministic parsing for content that's already short/structured;
reserve the LLM for genuinely long, free-form, format-inconsistent
documents the way Phase 1's PDFs were). This table's cells are short
sentences, not multi-page bulletins, so `severity` and `venture_advisory`
are computed with straightforward keyword rules instead of a batched LLM
call — cheaper, instant, and removes a class of misclassification risk
entirely rather than adding a cross-check to catch it after the fact (the
lesson from Phase 1's real LLM miss). If IMD's phrasing turns out to vary
wildly enough between offices that this needs LLM robustness after all,
that can be added the same way Phase 1's regex parser was — but it should
be justified against real data, not assumed up front.
"""
import asyncio
from datetime import datetime, timedelta, timezone

import aiohttp
from bs4 import BeautifulSoup

from src.services.imd_http import fetch_text

ARCHIVE_URL = "https://rsmcnewdelhi.imd.gov.in/warning-archive-information.php?internal_menu=NDU=&menu_id=OA=="
REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=20)
_USER_AGENT = "SeaSarathi/1.0 (+https://github.com/; marine safety app for Indian fishermen)"

DEFAULT_DAYS = 1
MAX_DAYS = 3  # matches the plan's "last 3 days" intent; caller can request fewer


def _resolve_pdf_url(href: str) -> str:
    href = href.strip()
    if href.startswith("http"):
        return href
    return "https://rsmcnewdelhi.imd.gov.in/" + href.lstrip("./")


def _venture_advisory(warning_text: str) -> bool:
    return "not to venture" in (warning_text or "").lower()


def _classify_severity(message: str, warning: str) -> str:
    """Deterministic, safety-first classification — see module docstring
    for why this isn't an LLM call. Errs toward HIGH when signals overlap."""
    combined = f"{message} {warning}".lower()
    if any(kw in combined for kw in ("not to venture", "cyclone", "gale", "very rough", "storm")):
        return "HIGH"
    if any(kw in combined for kw in ("caution", "squally", "strong wind", "rough")):
        return "MEDIUM"
    return "LOW"


async def _fetch_regions(session: aiohttp.ClientSession) -> list[dict]:
    """Task 3.1.1: parse the location <select> dropdown from the live page —
    not hardcoded, so a region IMD adds/removes is picked up automatically."""
    html = await fetch_text(session, ARCHIVE_URL)
    soup = BeautifulSoup(html, "html.parser")
    select = soup.find("select", {"name": "location"})
    regions = []
    if select:
        for opt in select.find_all("option"):
            value = (opt.get("value") or "").strip()
            name = opt.get_text(strip=True)
            if value:
                regions.append({"region_id": value, "region_name": name})
    return regions


def _parse_table(html: str) -> list[dict]:
    """Task 3.1.3: parse the results table for one region+date POST. Returns
    [] for a "No Records" response (a single <td colspan=5>) — not an
    error, just no warning issued for that region on that date."""
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", class_="tableData")
    if not table:
        return []

    rows = table.find_all("tr")[1:]  # skip header row
    results = []
    for row in rows:
        cells = row.find_all("td")
        if len(cells) < 4:  # "No Records" placeholder row, or malformed
            continue
        message = cells[2].get_text(strip=True)
        warning = cells[3].get_text(strip=True)
        pdf_url = None
        if len(cells) > 4:
            a = cells[4].find("a")
            if a and a.get("href"):
                pdf_url = _resolve_pdf_url(a["href"])
        results.append({
            "s_no": cells[0].get_text(strip=True),
            "issue_datetime_ist": cells[1].get_text(strip=True),
            "message": message,
            "warning": warning,
            "venture_advisory": _venture_advisory(warning),
            "severity": _classify_severity(message, warning),
            "pdf_url": pdf_url,
        })
    return results


async def _fetch_region_date(session: aiohttp.ClientSession, region_id: str, search_date: str) -> list[dict]:
    """Task 3.1.2: POST location+search_date+search, parse the resulting
    table (this endpoint re-renders the whole page with the table filled in,
    same URL, no redirect)."""
    data = {"location": region_id, "search_date": search_date, "search": "Search"}
    html = await fetch_text(session, ARCHIVE_URL, method="POST", data=data)
    return _parse_table(html)


async def scrape_cyclone_warnings(date_str: str | None = None, days: int = DEFAULT_DAYS) -> dict:
    """
    Task 3.1.5: iterate every region from the live dropdown, for `days`
    calendar days ending on `date_str` (YYYY-MM-DD; defaults to today).
    All region×date combinations are fetched concurrently. A single
    region×date request failing doesn't fail the whole scrape — it's
    recorded per-region under `errors` instead.
    """
    days = max(1, min(days, MAX_DAYS))
    if date_str:
        try:
            base_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError("date_str must be in YYYY-MM-DD format")
    else:
        base_date = datetime.now(timezone.utc).date()

    search_dates = [(base_date - timedelta(days=i)).strftime("%d-%m-%Y") for i in range(days)]

    async with aiohttp.ClientSession(timeout=REQUEST_TIMEOUT) as session:
        regions = await _fetch_regions(session)
        if not regions:
            return {
                "scraped_at": datetime.now(timezone.utc).isoformat(),
                "source": ARCHIVE_URL,
                "search_dates": search_dates,
                "region_count": 0,
                "cyclone_warnings": [],
                "error": "Could not find the location dropdown on the archive page — IMD may have restructured it.",
            }

        tasks = [_fetch_region_date(session, r["region_id"], d) for r in regions for d in search_dates]
        task_meta = [(r, d) for r in regions for d in search_dates]
        raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    per_region: dict[str, dict] = {}
    for (region, search_date), result in zip(task_meta, raw_results):
        rid = region["region_id"]
        entry = per_region.setdefault(rid, {
            "region_id": rid,
            "region_name": region["region_name"],
            "warnings": [],
            "errors": [],
        })
        if isinstance(result, Exception):
            entry["errors"].append({"date": search_date, "error": f"{type(result).__name__}: {result}"})
        else:
            for w in result:
                entry["warnings"].append({**w, "searched_date": search_date})

    return {
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "source": ARCHIVE_URL,
        "search_dates": search_dates,
        "region_count": len(regions),
        "cyclone_warnings": [per_region[r["region_id"]] for r in regions],
    }
