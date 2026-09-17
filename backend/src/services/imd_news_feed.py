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
    __slots__ = ("data", "cached_at")

    def __init__(self):
        self.data: dict | None = None
        self.cached_at: datetime | None = None


_BULLETIN_CACHE: dict[str, _ZoneBulletinCache] = {z["id"]: _ZoneBulletinCache() for z in ZONES}


def _is_stale(zone_id: str) -> bool:
    entry = _BULLETIN_CACHE[zone_id]
    if entry.cached_at is None:
        return True
    age_minutes = (datetime.now(timezone.utc) - entry.cached_at).total_seconds() / 60.0
    return age_minutes > _BULLETIN_TTL_MINUTES


async def _collect_zone_alerts(zone_states: set[str]) -> list[dict]:
    """Same per-state matching imd_alerts.py does for one state, fanned out
    across every state in a zone. Never triggers a live scrape
    (refresh_if_missing=False) — must stay fast on the request path, same
    reasoning as imd_alerts.py."""
    alerts: list[dict] = []

    fisherman = await get_cached("fisherman_warnings", refresh_if_missing=False)
    if fisherman:
        for region in fisherman.get("fisherman_warnings", []):
            label_upper = region.get("region_label", "").upper()
            if any(s in label_upper for s in zone_states) and region.get("venture_advisory"):
                alerts.append({
                    "type": "IMD_FISHERMAN_WARNING",
                    "severity": "HIGH",
                    "message": region.get("summary") or f"IMD fisherman warning active for {region.get('region_label')} — advised not to venture into the sea.",
                    "region_label": region.get("region_label"),
                })

    cyclone = await get_cached("cyclone_warnings", refresh_if_missing=False)
    if cyclone:
        for region in cyclone.get("cyclone_warnings", []):
            region_upper = region.get("region_name", "").upper()
            if not any(s in region_upper for s in zone_states):
                continue
            hit = next((w for w in region.get("warnings", []) if w.get("severity") == "HIGH" and w.get("venture_advisory")), None)
            if hit:
                alerts.append({
                    "type": "IMD_CYCLONE_WARNING",
                    "severity": "HIGH",
                    "message": hit.get("warning") or hit.get("message"),
                    "region_label": region.get("region_name"),
                })

    sea_area_id = "arabian_sea" if zone_states & _WEST_COAST_STATES else "bay_of_bengal"
    sea = await get_cached("sea_area_bulletins", refresh_if_missing=False)
    bulletin = (sea or {}).get("sea_area_bulletins", {}).get(sea_area_id)
    ttt = (bulletin or {}).get("ttt_warning")
    if ttt and ttt.strip().upper() not in _NO_ACTIVE_TTT:
        alerts.append({
            "type": "IMD_CYCLONE_TTT_WARNING",
            "severity": "HIGH",
            "message": f"IMD storm warning for the {(bulletin or {}).get('sea_area')}: {ttt}",
            "region_label": (bulletin or {}).get("sea_area"),
        })

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
        lines.append(f"- [{a['type']}] {a['message']} (region: {a.get('region_label') or 'n/a'})")
    lines.append(
        "\nWrite this as a coastal news bulletin with exactly two parts:\n"
        "HEADLINE: a single punchy line (max 12 words)\n"
        "BODY: 1-3 sentences summarizing the warning(s) above in plain, "
        "spoken language a fisherman would understand, ending with what "
        "action is advised (e.g. do not venture out) if the source says so.\n"
        "Output strictly as:\nHEADLINE: ...\nBODY: ..."
    )
    return "\n".join(lines)


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

    severity = "HIGH" if any(a["severity"] == "HIGH" for a in alerts) else "MODERATE"
    fallback_headline = f"{len(alerts)} active IMD warning(s) for {zone['label']}"
    try:
        raw = await asyncio.to_thread(
            sarvam_generate, _build_prompt(zone["label"], alerts), 300, 0.3,
        )
        headline, body = _parse_bulletin(raw, fallback_headline)
    except Exception as e:
        print(f"[imd_news_feed] LLM bulletin failed for {zone['id']}: {e}")
        headline = fallback_headline
        body = " ".join(a["message"] for a in alerts)

    return {
        "zone_id": zone["id"],
        "zone_label": zone["label"],
        "severity": severity,
        "headline": headline,
        "body": body,
        "alert_count": len(alerts),
        "raw_alerts": alerts,
        "generated_at": now,
    }


async def get_zone_bulletin(zone_id: str, force_refresh: bool = False) -> dict | None:
    zone = next((z for z in ZONES if z["id"] == zone_id), None)
    if zone is None:
        return None
    entry = _BULLETIN_CACHE[zone_id]
    if force_refresh or _is_stale(zone_id):
        entry.data = await _generate_zone_bulletin(zone)
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
