"""
imd_sea_area_archive_scraper.py — IMD Sea Area Bulletin Archive Scraper.

Phase 4 of IMD_IMPLEMENTATION_PLAN.md: Arabian Sea and Bay of Bengal
sea-area bulletin ARCHIVES (past issued bulletins, not just the current
one — that's Phase 2). Sources verified live on 2026-09-16:
  Arabian Sea:   https://rsmcnewdelhi.imd.gov.in/archive-information.php?internal_menu=NTk=&menu_id=OA==
  Bay of Bengal: https://rsmcnewdelhi.imd.gov.in/archive-information.php?internal_menu=NjA=&menu_id=OA==

Confirmed live: a plain GET (no year/form submission needed) already
returns the current year's listing, newest first — the plan's "set year
and fetch" form-submission step turned out to be optional for the default
(most recent) case, which is all this module needs; arbitrary past-year
browsing isn't implemented (out of scope for a live marine-safety feed).

KEY FINDING — the archived PDFs use the EXACT SAME document template as
Phase 2's live bulletin page (same header fields, same named divisions,
same Wind/Weather/Visibility/Sea Condition structure). So PDF content
parsing (the plan's Task 4.1.3, explicitly marked "optional, if needed")
reuses imd_sea_bulletin_parser.py's header/division logic verbatim rather
than needing new parsing rules — including the same design choice of
parsing the safety-critical TTT warning deterministically, never via LLM.

SCOPE: PDF content is only fetched for the `limit` most recent entries per
sea area (default 5, capped at 20) — the plan's own stated goal is "last
2-3 days", and downloading/parsing every historical PDF in the archive
(hundreds of them) would be slow, costly, and pointless for a live safety
feed. The full listing (title/timestamp/pdf_url, no content) is always
returned for every row on the archive's first page regardless of `limit`,
so a caller can still see what's available beyond the parsed subset.
"""
from datetime import datetime, timezone
from io import BytesIO

import aiohttp
import pdfplumber
from bs4 import BeautifulSoup

from src.services.openrouter_client import OpenRouterError
from src.services.imd_sea_bulletin_parser import clean_bulletin_lines, parse_bulletin_header, llm_parse_divisions

SEA_AREA_ARCHIVES = [
    {"id": "arabian_sea", "name": "Arabian Sea", "url": "https://rsmcnewdelhi.imd.gov.in/archive-information.php?internal_menu=NTk=&menu_id=OA=="},
    {"id": "bay_of_bengal", "name": "Bay of Bengal", "url": "https://rsmcnewdelhi.imd.gov.in/archive-information.php?internal_menu=NjA=&menu_id=OA=="},
]

REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=30)
_USER_AGENT = "SeaSarathi/1.0 (+https://github.com/; marine safety app for Indian fishermen)"

DEFAULT_LIMIT = 5
MAX_LIMIT = 20


def _resolve_url(base: str, href: str) -> str:
    href = href.strip()
    if href.startswith("http"):
        return href
    return "https://rsmcnewdelhi.imd.gov.in/" + href.lstrip("./")


def _parse_archive_index(html: str) -> list[dict]:
    """Task 4.1.2: parse the archive listing table (S.No, Title, Issue Date
    & Time, PDF link) — newest first, as IMD renders it."""
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", class_="tableData")
    if not table:
        return []
    rows = table.find_all("tr")[1:]  # skip header row
    entries = []
    for row in rows:
        cells = row.find_all("td")
        if len(cells) < 3:
            continue
        title = cells[1].get_text(strip=True)
        issue_dt = cells[2].get_text(strip=True)
        pdf_url = None
        if len(cells) > 3:
            a = cells[3].find("a")
            if a and a.get("href"):
                pdf_url = _resolve_url("", a["href"])
        entries.append({
            "s_no": cells[0].get_text(strip=True),
            "title": title,
            "issue_datetime_ist": issue_dt,
            "pdf_url": pdf_url,
        })
    return entries


async def _fetch_text(session: aiohttp.ClientSession, url: str) -> str:
    async with session.get(url, headers={"User-Agent": _USER_AGENT}) as resp:
        resp.raise_for_status()
        return await resp.text()


async def _fetch_pdf_lines(session: aiohttp.ClientSession, url: str) -> list[str]:
    async with session.get(url, headers={"User-Agent": _USER_AGENT}) as resp:
        resp.raise_for_status()
        pdf_bytes = await resp.read()
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        text = "\n".join(page.extract_text() or "" for page in pdf.pages)
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    return clean_bulletin_lines(lines)


async def scrape_sea_area_archive(limit: int = DEFAULT_LIMIT) -> dict:
    """
    Fetches both sea areas' archive listings, then downloads+parses the
    `limit` most recent PDFs per sea area (header fields deterministically,
    divisions via one batched LLM call spanning every fetched bulletin from
    both sea areas together). A listing fetch failure gives that sea area
    an `error`; an individual PDF fetch/parse failure gives that one entry
    a `content_error` without dropping its listing metadata; an LLM batch
    failure leaves every fetched entry's `divisions` empty with a shared
    `division_extraction_error`, but header fields (including TTT warning)
    are already parsed and unaffected.
    """
    limit = max(1, min(limit, MAX_LIMIT))

    results: dict[str, dict] = {}
    pdf_targets: list[dict] = []  # {bulletin_id, sea_area_id, entry_index}

    async with aiohttp.ClientSession(timeout=REQUEST_TIMEOUT) as session:
        for area in SEA_AREA_ARCHIVES:
            try:
                html = await _fetch_text(session, area["url"])
                entries = _parse_archive_index(html)
                results[area["id"]] = {
                    "sea_area": area["name"],
                    "source": area["url"],
                    "entry_count": len(entries),
                    "entries": entries,
                }
                for i, entry in enumerate(entries[:limit]):
                    if entry["pdf_url"]:
                        pdf_targets.append({"sea_area_id": area["id"], "entry_index": i})
            except Exception as e:
                results[area["id"]] = {
                    "sea_area": area["name"],
                    "source": area["url"],
                    "error": f"{type(e).__name__}: {e}",
                }

        bulletin_lines: dict[str, list[str]] = {}
        for target in pdf_targets:
            entry = results[target["sea_area_id"]]["entries"][target["entry_index"]]
            bulletin_id = f"{target['sea_area_id']}_{target['entry_index']}"
            try:
                lines = await _fetch_pdf_lines(session, entry["pdf_url"])
                bulletin_lines[bulletin_id] = lines
                entry.update(parse_bulletin_header(lines))
                entry["divisions"] = []
            except Exception as e:
                entry["content_error"] = f"{type(e).__name__}: {e}"

    if bulletin_lines:
        try:
            batch_input = {bid: "\n".join(lines) for bid, lines in bulletin_lines.items()}
            llm_divisions = await llm_parse_divisions(batch_input)
            for target in pdf_targets:
                bulletin_id = f"{target['sea_area_id']}_{target['entry_index']}"
                if bulletin_id not in bulletin_lines:
                    continue  # this entry's PDF fetch failed, nothing to attach divisions to
                entry = results[target["sea_area_id"]]["entries"][target["entry_index"]]
                division_entry = llm_divisions.get(bulletin_id)
                if division_entry and isinstance(division_entry.get("divisions"), list):
                    entry["divisions"] = division_entry["divisions"]
                else:
                    entry["division_extraction_error"] = f"No divisions returned for '{bulletin_id}' in LLM batch response"
        except OpenRouterError as e:
            for target in pdf_targets:
                bulletin_id = f"{target['sea_area_id']}_{target['entry_index']}"
                if bulletin_id in bulletin_lines:
                    entry = results[target["sea_area_id"]]["entries"][target["entry_index"]]
                    entry["division_extraction_error"] = str(e)

    return {
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "content_parsed_limit": limit,
        "sea_area_archives": results,
    }
