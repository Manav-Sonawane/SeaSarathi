"""
imd_news_feed.py — turns the same cached IMD live-feed data used by
GET /alerts (src/services/imd_alerts.py) into a multi-zone "news bulletin"
feed for the Alerts screen, grouped the way IMD's own site and other marine
forecasters (e.g. Windy's zonal breakdown) split the coast into navigable
regions, instead of one flat alert list bound to a single lat/lon.

Zones are static, non-fabricated state groupings (same _WEST_COAST_STATES /
_EAST_COAST_STATES fact already used in imd_alerts.py) — not scraped, so
they can't drift or go stale. Each zone's raw alert data (fisherman
warnings / cyclone warnings / sea-area TTT warnings whose region matches a
state in that zone) is collected first with plain matching, exactly like
imd_alerts.py already does per-state, just fanned out across every state in
the zone instead of one.

The LLM's job is narrow and downstream of that matching, never upstream of
it: rewrite the already-verified structured alerts into a short, readable
"bulletin" (headline + 1-2 sentence body) in a news-anchor tone. It is
never allowed to add, drop, or invent a warning — the prompt hands it the
exact alert list and instructs it to summarize only what's given. A zone
with zero active alerts skips the LLM call entirely and gets a static
"all clear" bulletin, both to avoid burning a call on nothing and because
there's nothing there for a model to legitimately embellish.

Bulletins are cached in-memory per zone with a TTL, same shape as
imd_cache.py's _CacheEntry — cheap to re-derive, but a live LLM call on
every GET /news/feed hit would be slow and wasteful when the underlying
IMD sources themselves only refresh every 1-6h (imd_cache.py's own TTLs).
"""
import asyncio
import os
from datetime import datetime, timezone

from src.services.imd_cache import get_cached
from src.services.sarvam_client import sarvam_generate

ZONES = [
    {"id": "gj-mh", "label": "Gujarat – Maharashtra", "states": {"GUJARAT", "MAHARASHTRA"}},
    {"id": "goa-ka-kl", "label": "Goa – Karnataka – Kerala", "states": {"GOA", "KARNATAKA", "KERALA"}},
    {"id": "tn-py", "label": "Tamil Nadu – Puducherry", "states": {"TAMIL NADU", "PUDUCHERRY"}},
    {"id": "ap-od", "label": "Andhra Pradesh – Odisha", "states": {"ANDHRA PRADESH", "ODISHA"}},
    {"id": "wb", "label": "West Bengal", "states": {"WEST BENGAL"}},
]

_WEST_COAST_STATES = {"GUJARAT", "MAHARASHTRA", "GOA", "KARNATAKA", "KERALA"}
_NO_ACTIVE_TTT = {"NIL", "NO STORM WARNING", "NO WARNING", ""}

_BULLETIN_TTL_MINUTES = 30.0


class _ZoneBulletinCache:
    __slots__ = ("data", "cached_at", "source_stamp")

    def __init__(self):
        self.data: dict | None = None
        self.cached_at: datetime | None = None
        self.source_stamp: tuple | None = None   # which IMD scrapes this bulletin was built from


_BULLETIN_CACHE: dict[str, _ZoneBulletinCache] = {z["id"]: _ZoneBulletinCache() for z in ZONES}


def _source_stamp() -> tuple:
    """When each IMD source feeding these bulletins was last scraped. A bulletin
    built from an older scrape than the current one is out of date even if it is
    younger than its own TTL."""
    from src.services.imd_cache import cache_status
    st = cache_status()
    return tuple(st[n]["cached_at"] for n in ("fisherman_warnings", "sea_area_bulletins", "cyclone_warnings"))


def _is_stale(zone_id: str) -> bool:
    entry = _BULLETIN_CACHE[zone_id]
    if entry.cached_at is None or entry.source_stamp != _source_stamp():
        return True
    age_minutes = (datetime.now(timezone.utc) - entry.cached_at).total_seconds() / 60.0
    return age_minutes > _BULLETIN_TTL_MINUTES


async def _collect_zone_alerts(zone_states: set[str]) -> list[dict]:
    """Same alert builder GET /alerts uses (imd_alerts.py), fanned out across
    every state in the zone at state level (no district) and de-duplicated —
    so News, Alerts and Chat can never disagree about what IMD said. That
    builder is what enforces bulletin freshness (an expired PDF becomes an
    'expired' notice, never a warning) and separates warnings for the coast
    from open-sea ones. Never triggers a live scrape."""
    from src.services.imd_alerts import get_location_imd_alerts

    alerts: list[dict] = []
    seen: set[tuple] = set()
    for state in sorted(zone_states):
        for a in await get_location_imd_alerts(state):
            meta = a.get("metadata") or {}
            label = meta.get("region_label") or meta.get("region_name") or meta.get("sea_area")
            key = (a["type"], label, a["message"])
            if key in seen:
                continue
            seen.add(key)
            alerts.append({**a, "region_label": label})
    return alerts


_NEWS_SYSTEM_PROMPT = (
    "You are a marine-safety news anchor rewriting official IMD (India "
    "Meteorological Department) warnings into a short radio-style coastal "
    "bulletin for fishermen. Use ONLY the facts given to you — never add, "
    "invent, soften, or drop a warning. Do not include numbers or claims "
    "that are not in the source data. Keep the tone calm, clear, and "
    "authoritative, like a shipping-forecast bulletin, not alarmist."
)


def _build_prompt(zone_label: str, alerts: list[dict]) -> str:
    lines = [f"Zone: {zone_label} coast", "Active IMD warnings:"]
    for a in alerts:
        lines.append(f"- [{a['severity']}/{a['type']}] {a['message']} (region: {a.get('region_label') or 'n/a'})")
    lines.append(
        "\nWrite this as a coastal news bulletin with exactly two parts:\n"
        "HEADLINE: a single punchy line (max 12 words)\n"
        "BODY: 1-3 sentences summarizing the warning(s) above in plain, "
        "spoken language a fisherman would understand, ending with what "
        "action is advised (e.g. do not venture out) if the source says so.\n"
        "Output strictly as:\nHEADLINE: ...\nBODY: ..."
    )
    return "\n".join(lines)


# Short names for the headline, in the order they should appear.
_HEADLINE_LABELS = {
    "IMD_CYCLONE_WARNING": "Cyclone warning",
    "IMD_CYCLONE_TTT_WARNING": "Storm warning",
    "IMD_COAST_WIND_WARNING": "Coastal wind warning",
    "IMD_SWELL_SURGE_ALERT": "Swell surge alert",
    "IMD_THUNDERSTORM_WARNING": "Thunderstorm warning",
    "IMD_FISHERMEN_ARCHIVE_ADVISORY": "IMD archive advisory",
}
_MAX_BODY_CHARS = 700


def _compose_bulletin(zone_label: str, alerts: list[dict]) -> tuple[str, str]:
    """Headline + body written straight from the verified alerts' own wording.

    Deliberately NOT rewritten by an LLM: run live (2026-09-19) the rewrite
    invented instructions IMD never gave — "Do not venture out" for a Gujarat
    bulletin that said "be cautious", and for Kerala swell alerts that said
    "boats to ply with utmost vigilance". In a safety bulletin the wording of the
    advice must be IMD's, so this only orders and trims what imd_alerts.py
    already produced. (Set IMD_NEWS_LLM=1 to re-enable the anchor-style rewrite.)"""
    order = {"HIGH": 0, "MODERATE": 1}
    ranked = sorted(alerts, key=lambda a: order.get(a["severity"], 2))
    warnings = [a for a in ranked if a["severity"] in ("HIGH", "MODERATE")]
    infos = [a for a in ranked if a["severity"] not in ("HIGH", "MODERATE")]

    if warnings:
        names = []
        for a in warnings:
            label = _HEADLINE_LABELS.get(a["type"], "IMD warning")
            if label not in names:
                names.append(label)
        headline = f"{', '.join(names)} — {zone_label}"
    elif any(a["type"] == "IMD_BULLETIN_EXPIRED" for a in infos):
        headline = f"IMD bulletin expired — {zone_label}"
    else:
        headline = f"No coastal warning — {zone_label}"

    parts = [a["message"] for a in warnings]
    for a in infos:
        # Informational notices: just their lead sentence (e.g. "IMD lists Kerala coast as NIL"),
        # the full detail is on the Alerts screen cards.
        parts.append(a["message"] if a["type"].startswith("IMD_BULLETIN") else a["message"].split(". ")[0].rstrip(".") + ".")
    body = " ".join(dict.fromkeys(parts))       # de-dupe identical sentences across states
    if len(body) > _MAX_BODY_CHARS:
        body = body[: _MAX_BODY_CHARS - 1].rsplit(" ", 1)[0] + "…"
    return headline, body


def _parse_bulletin(raw: str, fallback_headline: str) -> tuple[str, str]:
    headline, body = fallback_headline, raw.strip()
    for line in raw.splitlines():
        if line.upper().startswith("HEADLINE:"):
            headline = line.split(":", 1)[1].strip()
        elif line.upper().startswith("BODY:"):
            body = line.split(":", 1)[1].strip()
    return headline, body


async def _generate_zone_bulletin(zone: dict) -> dict:
    alerts = await _collect_zone_alerts(zone["states"])
    now = datetime.now(timezone.utc).isoformat()

    if not alerts:
        return {
            "zone_id": zone["id"],
            "zone_label": zone["label"],
            "severity": "NORMAL",
            "headline": f"All clear along the {zone['label']} coast",
            "body": "No active IMD fisherman, cyclone, or storm warnings for this zone right now. Standard precautions apply.",
            "alert_count": 0,
            "generated_at": now,
        }

    severity = ("HIGH" if any(a["severity"] == "HIGH" for a in alerts)
                else "MODERATE" if any(a["severity"] == "MODERATE" for a in alerts)
                else "NORMAL")   # only informational notices (open-sea areas, expired bulletin)
    n_warn = sum(1 for a in alerts if a["severity"] in ("HIGH", "MODERATE"))
    fallback_headline = (f"{n_warn} active IMD warning(s) for {zone['label']}" if n_warn
                         else f"IMD advisories for {zone['label']}")
    headline, body = _compose_bulletin(zone["label"], alerts)
    if os.getenv("IMD_NEWS_LLM") == "1":
        try:
            raw = await asyncio.to_thread(
                sarvam_generate, _build_prompt(zone["label"], alerts), 300, 0.3,
            )
            headline, body = _parse_bulletin(raw, fallback_headline)
        except Exception as e:
            print(f"[imd_news_feed] LLM bulletin failed for {zone['id']}: {e} — using composed bulletin")

    return {
        "zone_id": zone["id"],
        "zone_label": zone["label"],
        "severity": severity,
        "headline": headline,
        "body": body,
        "alert_count": n_warn,
        "raw_alerts": alerts,
        "generated_at": now,
    }


async def get_zone_bulletin(zone_id: str, force_refresh: bool = False) -> dict | None:
    zone = next((z for z in ZONES if z["id"] == zone_id), None)
    if zone is None:
        return None
    entry = _BULLETIN_CACHE[zone_id]
    if force_refresh or _is_stale(zone_id):
        stamp = _source_stamp()
        entry.data = await _generate_zone_bulletin(zone)
        entry.data["imd_checked_at"] = stamp[0]     # when the IMD fisherman PDFs were last fetched
        entry.source_stamp = stamp
        entry.cached_at = datetime.now(timezone.utc)
    return entry.data


async def get_news_feed() -> dict:
    """All zones' bulletins, generating/refreshing whichever are stale in
    parallel. Never blocks on a live IMD scrape (the underlying
    get_cached() calls are refresh_if_missing=False) — only the LLM
    rewrite step runs here, bounded by _BULLETIN_TTL_MINUTES."""
    bulletins = await asyncio.gather(*(get_zone_bulletin(z["id"]) for z in ZONES))
    return {
        "zones": bulletins,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
