"""
imd_port_warning_scraper.py — IMD Port Warning Archive Scraper.

Phase 5 of IMD_IMPLEMENTATION_PLAN.md. Source (RSMC New Delhi's port
warning archive, searchable by port + date):
https://rsmcnewdelhi.imd.gov.in/warning-archive-information.php?internal_menu=NTc=&menu_id=OA==

Verified live on 2026-09-16. Same site/table structure as Phase 3's
cyclone/fishermen warning archive (POST location+search_date+search,
same S.No/Issue Date Time/Message/Warning/File table) — but two real
differences:

1. 120 PORTS, NOT ~8. The plan estimated "8 ports" (Port Cochin, Port
   Chennai, etc.). The live dropdown has 120 named ports/locations, not a
   handful. Fetching all 120 x N dates concurrently with no limit would be
   a lot of simultaneous load on IMD's server, so requests are capped via
   a semaphore (`MAX_CONCURRENT_REQUESTS`) rather than firing them all at
   once the way Phase 3 does for its 15 regions.

2. THE "WARNING" COLUMN IS A SIGNAL CODE, NOT FREE-TEXT ADVICE. Phase 3's
   Warning cell is a sentence ("Fishermen are advised not to venture into
   the sea"). This page's Warning cell is a port signal code (e.g. "LC3",
   "NIL") — India's storm warning signal system, unchanged since 1898.
   Rather than guessing what severity each code implies, the mapping below
   is taken directly from IMD's own published reference, "Port Warnings"
   (RSMC New Delhi, Cyclone Warning Division) — fetched and read live from
   https://rsmcnewdelhi.imd.gov.in/images/pdf/port-warning.pdf, section
   "PORT WARNING SIGNALS": 11 numbered signals (DC1/DW2 = distant, LC3 =
   local cautionary/squally, LW4 = local warning, D5-D7 = Danger, GD8-GD10
   = Great Danger, XI = communication failure with the warning office).
   A code that doesn't match this table (a variant spelling this module
   doesn't recognize yet) gets `severity: null` rather than a guess — the
   raw `signal_code` is always preserved either way, so nothing is lost,
   just not auto-classified.
"""
import asyncio
from datetime import datetime, timedelta, timezone

import aiohttp
from bs4 import BeautifulSoup

from src.services.imd_http import fetch_text

ARCHIVE_URL = "https://rsmcnewdelhi.imd.gov.in/warning-archive-information.php?internal_menu=NTc=&menu_id=OA=="
REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=20)
_USER_AGENT = "SeaSarathi/1.0 (+https://github.com/; marine safety app for Indian fishermen)"

DEFAULT_DAYS = 1
MAX_DAYS = 3
MAX_CONCURRENT_REQUESTS = 15  # be a reasonable neighbor to IMD's server across ~120 ports

# Source: https://rsmcnewdelhi.imd.gov.in/images/pdf/port-warning.pdf
# ("Port Warnings", RSMC New Delhi Cyclone Warning Division), section
# "PORT WARNING SIGNALS" — the 11-signal General System table.
_SIGNAL_DEFINITIONS = {
    "DC1": {"name": "Distant Cautionary", "meaning": "Depression far at sea. Port not affected.", "severity": "LOW"},
    "DW2": {"name": "Distant Warning", "meaning": "Cyclone far at sea. Warning for vessels leaving port.", "severity": "MEDIUM"},
    "LC3": {"name": "Local Cautionary", "meaning": "Port threatened by local bad weather (squally winds).", "severity": "MEDIUM"},
    "LW4": {"name": "Local Warning", "meaning": "Cyclone at sea, likely to affect the port later.", "severity": "HIGH"},
    "D5": {"name": "Danger", "meaning": "Cyclone likely to cross coast keeping port to its left.", "severity": "HIGH"},
    "D6": {"name": "Danger", "meaning": "Cyclone likely to cross coast keeping port to its right.", "severity": "HIGH"},
    "D7": {"name": "Danger", "meaning": "Cyclone likely to cross coast over/near the port.", "severity": "HIGH"},
    "GD8": {"name": "Great Danger", "meaning": "Severe cyclone to cross coast keeping port to its left.", "severity": "CRITICAL"},
    "GD9": {"name": "Great Danger", "meaning": "Severe cyclone to cross coast keeping port to its right.", "severity": "CRITICAL"},
    "GD10": {"name": "Great Danger", "meaning": "Severe cyclone to cross coast over/near the port.", "severity": "CRITICAL"},
    "XI": {"name": "Communication Failure", "meaning": "Communication with the cyclone warning office has failed.", "severity": "UNKNOWN"},
}
# Variant spellings IMD offices are known to use for the same signal
# (roman numerals, hyphens) — normalized before the lookup above.
_SIGNAL_ALIASES = {
    "DCI": "DC1", "DC-I": "DC1",
    "DWII": "DW2", "DW-II": "DW2",
    "LCIII": "LC3", "LC-III": "LC3",
    "LWIV": "LW4", "LW-IV": "LW4",
    "DV": "D5", "D-V": "D5",
    "DVI": "D6", "D-VI": "D6",
    "DVII": "D7", "D-VII": "D7",
    "GDVIII": "GD8", "GD-VIII": "GD8",
    "GDIX": "GD9", "GD-IX": "GD9",
    "GDX": "GD10", "GD-X": "GD10",
}
_NO_SIGNAL_VALUES = {"NIL", "NOWARNING", "NOSIGNAL"}


def _classify_signal(warning_text: str) -> dict:
    """Normalizes and classifies a port Warning cell against IMD's own
    signal taxonomy — see module docstring. Never guesses: an unrecognized
    code gets severity=None with the raw text preserved."""
    raw = (warning_text or "").strip()
    normalized = raw.upper().replace(" ", "").replace(".", "")
    if not normalized or normalized in _NO_SIGNAL_VALUES:
        return {"signal_code": raw, "signal_name": "No Signal", "severity": "NONE"}

    code = _SIGNAL_ALIASES.get(normalized, normalized)
    definition = _SIGNAL_DEFINITIONS.get(code)
    if definition:
        return {"signal_code": raw, "signal_name": definition["name"], "signal_meaning": definition["meaning"], "severity": definition["severity"]}
    return {"signal_code": raw, "signal_name": None, "severity": None}


async def _fetch_ports(session: aiohttp.ClientSession) -> list[dict]:
    """Parses the live location <select> dropdown — 120 ports found live,
    not hardcoded here, so a port IMD adds/removes is picked up automatically."""
    html = await fetch_text(session, ARCHIVE_URL)
    soup = BeautifulSoup(html, "html.parser")
    select = soup.find("select", {"name": "location"})
    ports = []
    if select:
        for opt in select.find_all("option"):
            value = (opt.get("value") or "").strip()
            name = opt.get_text(strip=True)
            if value:
                ports.append({"port_id": value, "port_name": name})
    return ports


def _resolve_pdf_url(href: str) -> str:
    href = href.strip()
    if href.startswith("http"):
        return href
    return "https://rsmcnewdelhi.imd.gov.in/" + href.lstrip("./")


def _parse_table(html: str) -> list[dict]:
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
            **_classify_signal(warning),
            "pdf_url": pdf_url,
        })
    return results


async def _fetch_port_date(session: aiohttp.ClientSession, semaphore: asyncio.Semaphore, port_id: str, search_date: str) -> list[dict]:
    async with semaphore:
        data = {"location": port_id, "search_date": search_date, "search": "Search"}
        html = await fetch_text(session, ARCHIVE_URL, method="POST", data=data)
    return _parse_table(html)


async def scrape_port_warnings(date_str: str | None = None, days: int = DEFAULT_DAYS) -> dict:
    """
    Iterates every port from the live dropdown, for `days` calendar days
    ending on `date_str` (YYYY-MM-DD; defaults to today), concurrency
    capped at MAX_CONCURRENT_REQUESTS given how many ports there are. A
    single port x date request failing doesn't fail the whole scrape —
    recorded per-port under `errors` instead.
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
        ports = await _fetch_ports(session)
        if not ports:
            return {
                "scraped_at": datetime.now(timezone.utc).isoformat(),
                "source": ARCHIVE_URL,
                "search_dates": search_dates,
                "port_count": 0,
                "port_warnings": [],
                "error": "Could not find the location dropdown on the archive page — IMD may have restructured it.",
            }

        semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
        tasks = [_fetch_port_date(session, semaphore, p["port_id"], d) for p in ports for d in search_dates]
        task_meta = [(p, d) for p in ports for d in search_dates]
        raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    per_port: dict[str, dict] = {}
    for (port, search_date), result in zip(task_meta, raw_results):
        pid = port["port_id"]
        entry = per_port.setdefault(pid, {
            "port_id": pid,
            "port_name": port["port_name"],
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
        "port_count": len(ports),
        "port_warnings": [per_port[p["port_id"]] for p in ports],
    }
