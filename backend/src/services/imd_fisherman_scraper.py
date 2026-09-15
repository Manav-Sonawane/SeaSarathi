"""
imd_fisherman_scraper.py — IMD Fisherman Warnings Scraper.

Phase 1 of IMD_IMPLEMENTATION_PLAN.md: parse the IMD fisherman-warnings hub
page for regional advisory PDFs, download each, and extract their text.

Two things differ from the plan's original assumptions, corrected against
the real live page/PDFs rather than guessed:

1. STRUCTURE OF THE HUB PAGE. The plan assumed "find all <a> tags in the
   main content area" would yield 15-20 regional links. The real hub page
   (https://mausam.imd.gov.in/imd_latest/contents/index_fisherman.php) has
   no plain <a href> links for this — the 7 real regional PDFs are wired via
   jQuery('#a1'..'#a7').click(...) handlers embedded in a <script> block, so
   this module regex-parses that script block instead. Confirmed live on
   2026-09-16. Each of the 7 regions can cover MULTIPLE states/coasts in one
   PDF (e.g. one region's PDF covers both Tamil Nadu coasts plus several
   open-sea areas) — a region is not a 1:1 proxy for a single state, so no
   `region_to_state` map is invented here; each region's real label string
   (as IMD wrote it) is kept as-is instead of forcing it into a single state
   name IMD didn't actually assign it.

2. STRUCTURED FIELDS ARE BEST-EFFORT, NOT GUARANTEED. The plan assumed a
   single regex per field (issue time, "gale" keyword, "NN-NN knots" wind,
   an 18-24h validity window) would work for every region. In practice each
   of IMD's regional centers (Kolkata/Bhubaneswar/Visakhapatnam/Chennai/
   Thiruvananthapuram/Mumbai/Ahmedabad) formats its PDF differently — two
   different issue-datetime formats were found in the first two PDFs alone,
   wind speed is given in kmph in some regions and knots in others, and the
   word "gale" doesn't appear in either sample PDF (IMD uses "squally
   weather" / "strong winds" / "advised not to venture into the sea"
   instead). A fabricated `valid_until` (e.g. issue+24h) would also be
   actively wrong for a region whose PDF explicitly states a 5-day validity
   window. So: `raw_text` is always populated and is the authoritative
   source. Structured fields degrade to `None`/`False`/`[]` rather than a
   guessed value when a pattern doesn't match that region's layout — a
   caller must not treat a missing structured field as "no warning", only
   as "re-read raw_text for this region".

REVISED STRATEGY (see IMD_IMPLEMENTATION_PLAN.md's LLM-based revision):
structured extraction now goes through an LLM (OpenRouter, see
openrouter_client.py) in one batched call across all 7 regions, instead of
growing the regex set above per format variation. The regex parser
(`parse_fisherman_warning_pdf`) is kept as an automatic fallback — used
whole-batch if OPENROUTER_API_KEY is unset or the OpenRouter call fails, and
per-region if the LLM's JSON is missing an entry for a specific region — so
a missing/invalid API key degrades this endpoint's data quality rather than
breaking it. Every response carries `"extraction_method": "llm" |
"regex_fallback"` per region so callers/logs always know which path
actually produced that region's structured fields; this is never left
ambiguous. Also, unlike the plan's rigid numeric wind/wave schema (forcing
knots and a single min-max pair), the LLM prompt asks for free-text
"as stated in the source" for wind/wave/validity — decomposing e.g.
"35 kmph to 45 kmph gusting to 55 kmph" into separate min/max/gust numbers
invites the model to fabricate structure IMD's prose doesn't cleanly have;
preserving the original phrasing is more honest than forcing false
precision.
"""
import re
import json
from datetime import datetime, timedelta, timezone

import aiohttp
import pdfplumber
from io import BytesIO

from src.services.openrouter_client import chat_json, OpenRouterError
from src.services.imd_http import fetch_text, fetch_bytes

HUB_URL = "https://mausam.imd.gov.in/imd_latest/contents/index_fisherman.php"
REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=30)
IST = timezone(timedelta(hours=5, minutes=30))

_USER_AGENT = "SeaSarathi/1.0 (+https://github.com/; marine safety app for Indian fishermen)"

# See module docstring point 1 — the hub page's regional links are wired via
# jQuery click handlers keyed by element id (#a1..#a7), not <a href> tags.
_REGION_LABEL_RE = re.compile(r'<a href="#\.?" id="a(\d)"[^>]*>([^<]+)</a>')
_REGION_PDF_RE = re.compile(
    r"jQuery\('#a(\d)'\)\.click\(function\(\) \{.*?href=([^\s>]+\.pdf)",
    re.DOTALL,
)

_ISSUE_DT_PATTERNS = [
    # "DATE: 2026-06-27 TIME OF ISSUE: 0530 IST"  (Kolkata-style)
    (re.compile(r"DATE:\s*(\d{4})-(\d{2})-(\d{2})\s*TIME OF ISSUE:\s*(\d{3,4})\s*IST", re.IGNORECASE), "ymd"),
    # "Date of Issue: 15-09-2026 Time of issue: 2130 hrs IST"  (Ahmedabad-style)
    (re.compile(r"Date of Issue:\s*(\d{2})-(\d{2})-(\d{4})\s*Time of issue:\s*(\d{3,4})\s*hrs?\.?\s*IST", re.IGNORECASE), "dmy"),
]

# Two phrasings seen in real IMD PDFs across different regional offices:
# "35-45 kmph" (dash form) and "35 kmph to 45 kmph" (word form, unit
# repeated on both numbers) — both captured; other phrasings this doesn't
# catch just mean wind_speed_mentions is incomplete for that PDF, not wrong
# (raw_text always has the real text).
_WIND_RE = re.compile(
    r"\d{1,3}\s*-\s*\d{1,3}\s*(?:kmph|km/h|knots?)"
    r"|\d{1,3}\s*kmph\s*to\s*\d{1,3}\s*kmph",
    re.IGNORECASE,
)
_VALIDITY_RE = re.compile(r"[Ff]or\s+\d+\s+days?\s+from\s+[^.\n]+", re.IGNORECASE)


def _resolve_pdf_url(href: str) -> str:
    """Hub page's PDF hrefs are relative to /imd_latest/contents/, e.g.
    '../../backend/assets/foo.pdf' -> 'https://mausam.imd.gov.in/backend/assets/foo.pdf'."""
    href = href.strip("\"'")
    if href.startswith("http"):
        return href
    return "https://mausam.imd.gov.in/" + href.lstrip("./").replace("../", "")


def parse_hub_page(html: str) -> list[dict]:
    """
    Task 1.1: extract the real regional fisherman-warning links from the hub
    page. Returns [{"region_id", "region_label", "pdf_url"}] — empty list if
    IMD has restructured the page (callers should treat that as "scrape
    broken, not "no warnings").
    """
    labels = {m.group(1): m.group(2).strip() for m in _REGION_LABEL_RE.finditer(html)}
    pdfs = {m.group(1): _resolve_pdf_url(m.group(2)) for m in _REGION_PDF_RE.finditer(html)}

    regions = []
    for region_id in sorted(labels.keys() & pdfs.keys(), key=int):
        regions.append({
            "region_id": f"a{region_id}",
            "region_label": labels[region_id],
            "pdf_url": pdfs[region_id],
        })
    return regions


def _parse_issue_datetime(text: str) -> str | None:
    for pattern, order in _ISSUE_DT_PATTERNS:
        m = pattern.search(text)
        if not m:
            continue
        if order == "ymd":
            year, month, day, hhmm = m.groups()
        else:
            day, month, year, hhmm = m.groups()
        hhmm = hhmm.zfill(4)
        try:
            dt_ist = datetime(int(year), int(month), int(day), int(hhmm[:2]), int(hhmm[2:]), tzinfo=IST)
        except ValueError:
            continue
        return dt_ist.astimezone(timezone.utc).isoformat()
    return None


def parse_fisherman_warning_pdf(pdf_text: str, region_id: str, region_label: str, pdf_url: str) -> dict:
    """Regex fallback parser — used automatically when the LLM extraction
    path (see `_llm_parse_batch`) is unavailable or fails. Best-effort
    structured extraction from one region's raw PDF text (see module
    docstring point 2 for why fields degrade to None/False/[] instead of
    being guessed)."""
    lower = pdf_text.lower()
    return {
        "region_id": region_id,
        "region_label": region_label,
        "pdf_url": pdf_url,
        "extraction_method": "regex_fallback",
        "issue_datetime_utc": _parse_issue_datetime(pdf_text),
        "venture_advisory": "not to venture" in lower,
        "squally_or_gale_weather": ("squally" in lower) or ("gale" in lower),
        "wind_speed_mentions": sorted(set(m.group(0).strip() for m in _WIND_RE.finditer(pdf_text))),
        "stated_validity": next((m.group(0).strip() for m in _VALIDITY_RE.finditer(pdf_text)), None),
        "raw_text": pdf_text,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
    }


_LLM_SYSTEM_PROMPT = """You extract structured data from India Meteorological Department (IMD) \
fisherman warning bulletins for a marine safety app used by Indian fishermen. Accuracy matters \
more than completeness: a wrong number in this app could put someone at sea in danger.

Rules:
- Extract ONLY what a region's text explicitly states. Never infer, estimate, round, or convert \
units on your own initiative — if the text says "35 kmph to 45 kmph", report it exactly as \
written in wind_conditions, don't convert to knots or split into separate min/max numbers.
- If a field isn't mentioned for a region, use null (false for booleans, [] for hazards).
- "NIL" or no warning text for a region means no active warning — set booleans to false and \
leave the descriptive fields null, don't say there's no data.
- IMPORTANT: a document often lists "NIL" for the immediate coastal zone (e.g. "Keralam coast \
NIL, Karnataka coast NIL") and THEN separately gives real, active warnings for open sea areas, \
swell surge/high wave alerts for specific named coastal districts, or thunderstorm warnings \
further down the SAME document. Read the ENTIRE text for every region before deciding \
venture_advisory/squally_or_gale_weather — an early "NIL" line does not mean the rest of that \
region's document has nothing. Missing a real warning here is a safety issue, so if in doubt, \
report what you found rather than defaulting to false.
- Return ONLY a single JSON object. Its top-level keys must be EXACTLY the region_id values \
given in the input (e.g. "a1", "a2", ...) — one entry per region provided, no more, no fewer.
- Each region's value must be an object with exactly these fields:
  {
    "venture_advisory": boolean,        // "advised not to venture into the sea" or equivalent present
    "squally_or_gale_weather": boolean, // squally weather / gale / strong wind warning present
    "wind_conditions": string|null,     // wind speed/direction/gusts AS STATED in the source text
    "wave_or_swell_conditions": string|null,  // wave/swell height AS STATED in the source text
    "validity_note": string|null,       // the stated validity period, in the source's own words
    "hazards": [string],                // short hazard tags actually named in the text, e.g. "high waves", "swell surge"
    "summary": string                   // 1-2 plain-English sentences summarizing THIS region's actual warning content
  }
"""


async def _llm_parse_batch(regions_with_text: list[dict]) -> dict[str, dict]:
    """
    One batched OpenRouter call covering all successfully-fetched regions
    (see module docstring — batching per the revised plan's cost/latency
    rationale). Returns {region_id: extracted_fields}. Raises OpenRouterError
    if the call fails outright; a region_id missing from the model's output
    is the caller's responsibility to notice and fall back for individually.
    """
    batch_input = {r["region_id"]: r["pdf_text"] for r in regions_with_text}
    user_content = json.dumps({"regions": batch_input}, ensure_ascii=False)
    result = await chat_json(_LLM_SYSTEM_PROMPT, user_content)
    if not isinstance(result, dict):
        raise OpenRouterError(f"Expected a JSON object keyed by region_id, got: {type(result)}")
    return result


def _safety_cross_check(llm_fields: dict, pdf_text: str) -> dict:
    """
    Cheap regex cross-check against the LLM's two safety-critical booleans.
    Found live: a batched extraction returned venture_advisory=false and
    squally_or_gale_weather=false for a region whose document opened with
    "Keralam coast NIL, Karnataka coast NIL, Lakshadweep area NIL" but then
    contained a real open-sea squally warning, an explicit "advised not to
    venture into the above sea areas" line, and swell surge alerts for named
    Kerala coastal districts further down the same PDF — the model latched
    onto the early NIL lines and stopped reading. For a marine safety app, a
    false "no warning" is the dangerous direction to be wrong in, so: if the
    same regex signal from the Phase-1 fallback parser (see
    `parse_fisherman_warning_pdf`) finds venture/squally language the LLM
    said isn't there, don't trust the LLM's negative — flip to true and say
    so via `cross_check_override`, rather than silently keeping a
    contradicted false.
    """
    lower = pdf_text.lower()
    regex_venture = "not to venture" in lower
    regex_squally = ("squally" in lower) or ("gale" in lower)

    overridden = []
    if regex_venture and not llm_fields.get("venture_advisory"):
        llm_fields["venture_advisory"] = True
        overridden.append("venture_advisory")
    if regex_squally and not llm_fields.get("squally_or_gale_weather"):
        llm_fields["squally_or_gale_weather"] = True
        overridden.append("squally_or_gale_weather")

    if overridden:
        llm_fields["cross_check_override"] = (
            f"LLM said false for {overridden}, but keyword-matching found contradicting language "
            "in raw_text — overridden to true. The LLM's summary/wind/wave fields may still have "
            "missed this content; re-check raw_text for this region."
        )
    return llm_fields


async def _fetch_text(session: aiohttp.ClientSession, url: str) -> str:
    return await fetch_text(session, url)


async def _fetch_pdf_text(session: aiohttp.ClientSession, url: str) -> str:
    pdf_bytes = await fetch_bytes(session, url)
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)


async def scrape_fisherman_warnings() -> dict:
    """
    Fetches the hub page, then all 7 regional PDFs, extracts raw text from
    each (a region's fetch/PDF-parse failure doesn't fail the whole scrape —
    it gets an `error` entry, same as before), then runs ONE batched LLM
    call to structure all of them at once. If that call fails entirely
    (no API key, OpenRouter down, bad response), every region falls back to
    the regex parser; if the LLM's JSON is simply missing a specific
    region_id, only that region falls back. `extraction_method` on every
    successful entry says which path actually produced it.
    """
    async with aiohttp.ClientSession(timeout=REQUEST_TIMEOUT) as session:
        hub_html = await _fetch_text(session, HUB_URL)
        regions = parse_hub_page(hub_html)

        fetched: list[dict] = []
        errors: list[dict] = []
        for region in regions:
            try:
                pdf_text = await _fetch_pdf_text(session, region["pdf_url"])
                fetched.append({**region, "pdf_text": pdf_text})
            except Exception as e:
                errors.append({
                    "region_id": region["region_id"],
                    "region_label": region["region_label"],
                    "pdf_url": region["pdf_url"],
                    "error": f"{type(e).__name__}: {e}",
                    "scraped_at": datetime.now(timezone.utc).isoformat(),
                })

    llm_results: dict[str, dict] = {}
    llm_batch_error: str | None = None
    if fetched:
        try:
            llm_results = await _llm_parse_batch(fetched)
        except OpenRouterError as e:
            llm_batch_error = str(e)

    results = []
    for region in fetched:
        region_id = region["region_id"]
        llm_fields = llm_results.get(region_id) if not llm_batch_error else None
        if llm_fields:
            llm_fields = _safety_cross_check(llm_fields, region["pdf_text"])
            results.append({
                "region_id": region_id,
                "region_label": region["region_label"],
                "pdf_url": region["pdf_url"],
                "extraction_method": "llm",
                **llm_fields,
                "raw_text": region["pdf_text"],
                "scraped_at": datetime.now(timezone.utc).isoformat(),
            })
        else:
            fallback = parse_fisherman_warning_pdf(
                region["pdf_text"], region_id, region["region_label"], region["pdf_url"]
            )
            if llm_batch_error:
                fallback["llm_extraction_error"] = llm_batch_error
            results.append(fallback)

    results.extend(errors)
    results.sort(key=lambda r: r["region_id"])

    return {
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "source": HUB_URL,
        "region_count": len(regions),
        "fisherman_warnings": results,
    }
