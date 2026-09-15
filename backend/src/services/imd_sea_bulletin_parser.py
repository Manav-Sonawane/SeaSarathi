"""
imd_sea_bulletin_parser.py — shared parsing logic for IMD's "Sea Area
Bulletin" document template.

Extracted out of imd_sea_area_scraper.py (Phase 2) so Phase 4's archive
scraper can reuse it: the archived PDFs (verified live on 2026-09-16, e.g.
https://rsmcnewdelhi.imd.gov.in/uploads/archive/59/*_sab_rsmc.pdf) turned
out to be the exact same document template as Phase 2's live HTML page —
same header fields, same named divisions, same Wind/Weather/Visibility/Sea
Condition structure, same trailing WMO synoptic-code block. One real
difference: pdfplumber's text extraction sometimes merges a label and its
value onto one line (e.g. "TTT Warning NIL" as a single line) where the
live HTML page instead renders them as two consecutive lines ("TTT
Warning" then "NIL" as separate <tr> cells extracted separately by
BeautifulSoup). `_extract_labeled_value` below handles both forms with one
function rather than duplicating the header parser per source format.

See imd_sea_area_scraper.py's module docstring for why header fields
(validity window, TTT warning, issue time) are parsed deterministically
here rather than via the LLM — same reasoning applies unchanged to the
archived PDFs.
"""
import re
import json
from datetime import datetime, timezone

from src.services.openrouter_client import chat_json, OpenRouterError

_VALIDITY_RE = re.compile(
    r"Bulletin Valid for\s*\d+\s*hrs?\s*from\s*(\d{1,2})\s*UTC of\s*(\d{4}-\d{2}-\d{2})\s*"
    r"to\s*(\d{1,2})\s*UTC of\s*(\d{4}-\d{2}-\d{2})",
    re.IGNORECASE,
)


def clean_bulletin_lines(lines: list[str]) -> list[str]:
    """
    Drop the raw WMO ship/synoptic code block ("Part 4"/"Part 5"/"Part 6" —
    numeric groups like "AAXX 01512 99942 339 ...") between the
    human-readable divisions and the trailing "Time of Issue" line. Pure
    weather-code noise, not useful to a fisherman or worth LLM tokens.
    `startswith` (not exact match) on both markers since the PDF-extracted
    version sometimes has "Time of Issue 14:09 IST of ..." as one line.
    """
    try:
        junk_start = next(i for i, l in enumerate(lines) if l.startswith("Part 4"))
    except StopIteration:
        junk_start = len(lines)
    try:
        issue_start = next(i for i, l in enumerate(lines) if l.startswith("Time of Issue"))
    except StopIteration:
        issue_start = len(lines)
    return lines[:junk_start] + lines[issue_start:]


def _extract_labeled_value(lines: list[str], label: str) -> str | None:
    """Handles both "LABEL" then "VALUE" on separate lines (live HTML page)
    and "LABEL VALUE" combined on one line (PDF text extraction)."""
    for i, line in enumerate(lines):
        if line == label:
            return lines[i + 1].strip() if i + 1 < len(lines) else None
        if line.startswith(label):
            rest = line[len(label):].strip()
            if rest:
                return rest
    return None


def parse_bulletin_header(lines: list[str]) -> dict:
    """Deterministic parse of the fixed-template header fields (validity
    window, TTT warning, issue time) — see module docstring for why these
    deliberately bypass the LLM."""
    full_text = "\n".join(lines)

    valid_from_utc = None
    valid_until_utc = None
    m = _VALIDITY_RE.search(full_text)
    if m:
        from_hour, from_date, to_hour, to_date = m.groups()
        try:
            valid_from_utc = datetime.strptime(f"{from_date} {from_hour}", "%Y-%m-%d %H").replace(tzinfo=timezone.utc).isoformat()
            valid_until_utc = datetime.strptime(f"{to_date} {to_hour}", "%Y-%m-%d %H").replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            pass

    return {
        "valid_from_utc": valid_from_utc,
        "valid_until_utc": valid_until_utc,
        "ttt_warning": _extract_labeled_value(lines, "TTT Warning"),
        "issue_time_stated": _extract_labeled_value(lines, "Time of Issue"),
    }


LLM_DIVISION_SYSTEM_PROMPT = """You extract structured division-level weather data from India \
Meteorological Department (IMD) sea area bulletins for a marine safety app used by Indian \
fishermen. Accuracy matters more than completeness: a wrong number in this app could put someone \
at sea in danger.

Each bulletin's text lists named sea divisions (e.g. "North West Arabian Sea", "South East Bay"), \
each followed by a Wind line, a Weather line, a Visibility line, and a Sea Condition line, in that \
order. Extract every division found — do not skip any, do not merge two divisions into one, and do \
not invent a division that isn't named in the text.

Rules:
- Extract ONLY what is explicitly stated. Never infer, estimate, or convert units — report wind \
speed/direction exactly as written (e.g. "15 to 20 gusting 20 Knots" or "15 - 20 kts gusting 25 kts"), \
don't normalize the unit or split it into separate min/max numbers.
- If a field is missing for a division, use null.
- Return ONLY a single JSON object. Its top-level keys must be EXACTLY the bulletin ids given in the \
input — one entry per bulletin provided, no more, no fewer.
- Each bulletin's value must be an object: {"divisions": [ {"name": string, "wind_direction": \
string|null, "wind_speed_text": string|null, "weather": string|null, "visibility": string|null, \
"sea_condition": string|null}, ... ]}
"""


async def llm_parse_divisions(bulletins: dict[str, str]) -> dict[str, dict]:
    """One batched call covering every bulletin text given (keyed by
    caller-chosen id — a sea_area id for Phase 2's live bulletins, or e.g.
    "arabian_sea_0" for Phase 4's archived ones). Raises OpenRouterError on
    failure — callers fall back to an empty division list (header fields,
    including the safety-critical TTT warning, are parsed deterministically
    and unaffected by this failing).

    max_tokens scales with batch size: each bulletin has up to 8 divisions
    x 5 fields of real text, roughly 1200-1600 output tokens per bulletin.
    Found live in Phase 4 testing — a 6-bulletin batch (3 Arabian Sea + 3
    Bay of Bengal archive entries) silently hit the fixed 4000-token
    default, truncating the JSON response mid-object and making the whole
    batch fail to parse (every entry lost its divisions, not just the
    ones that didn't fit). Capped at 16000 as a sane ceiling.
    """
    user_content = json.dumps({"bulletins": bulletins}, ensure_ascii=False)
    max_tokens = min(16000, max(4000, len(bulletins) * 1600))
    result = await chat_json(LLM_DIVISION_SYSTEM_PROMPT, user_content, max_tokens=max_tokens)
    if not isinstance(result, dict):
        raise OpenRouterError(f"Expected a JSON object keyed by bulletin id, got: {type(result)}")
    return result
