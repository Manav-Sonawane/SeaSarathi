"""
imd_alerts.py — converts cached IMD live-feed data (imd_cache.py) into the
app's standard alert schema ({type, severity, message, source, metadata}),
matched to a location via the nearest-landing-center state approximation
already used elsewhere in this project — not a surveyed jurisdiction
boundary, only reliable near the coast.

Shared by:
  - GET /alerts (main.py) — so IMD warnings show up automatically anywhere
    the mobile app already renders /alerts (AlertsScreen, Dashboard, etc.)
    with zero new mobile-side plumbing, since it's the same alert shape
    those screens already render.
  - The chat agent (src/agents/data_agent.py) — same alerts feed the LLM's
    context, so what a fisherman sees in Alerts and what the chat assistant
    tells them are the same underlying data, not two separate opinions.

Never triggers a live scrape (`refresh_if_missing=False` on every cache
read) — this must stay fast on both the /alerts and /chat request paths;
a cold/stale cache just means fewer IMD alerts surface this call, not an
error.

Deliberately does NOT attempt to match PORT warnings to a location: the
scraped port-warning data has no port coordinates (only name/id), and
inventing a port's lat/lon to do proximity matching would be exactly the
kind of fabrication this project avoids. Port warnings stay available via
their own endpoint (GET /imd/port-warnings) for direct browsing/search.

Sea area TTT (cyclone/storm) warnings are matched via a static, genuinely
non-fabricated fact — which sea each Indian coastal state fronts — not
scraped or guessed data.
"""
from src.services.imd_cache import get_cached

_WEST_COAST_STATES = {"GUJARAT", "MAHARASHTRA", "GOA", "KARNATAKA", "KERALA"}
_EAST_COAST_STATES = {"WEST BENGAL", "ODISHA", "ANDHRA PRADESH", "TAMIL NADU", "PUDUCHERRY"}
_NO_ACTIVE_TTT = {"NIL", "NO STORM WARNING", "NO WARNING", ""}


async def get_location_imd_alerts(state_name: str | None) -> list[dict]:
    """
    `state_name`: the state/UT already resolved by the caller (e.g. via
    nearest-landing-center lookup) — this module does no geocoding itself.
    Returns alert-schema dicts for whichever of fisherman warning /
    cyclone-archive warning / sea-area TTT warning are active for that
    state right now, per the cache.
    """
    if not state_name:
        return []
    state_upper = state_name.strip().upper()
    alerts: list[dict] = []

    fisherman = await get_cached("fisherman_warnings", refresh_if_missing=False)
    if fisherman:
        for region in fisherman.get("fisherman_warnings", []):
            if state_upper in region.get("region_label", "").upper() and region.get("venture_advisory"):
                alerts.append({
                    "type": "IMD_FISHERMAN_WARNING",
                    "severity": "HIGH",
                    "message": region.get("summary") or f"IMD fisherman warning active for {region.get('region_label')} — advised not to venture into the sea.",
                    "source": "imd-fisherman-warning",
                    # wind_conditions/wave_or_swell_conditions are free-text AS
                    # STATED in the source PDF (e.g. "35 kmph to 45 kmph"), not
                    # a parsed number — the LLM extractor (imd_fisherman_
                    # scraper.py) is deliberately told never to convert/round
                    # these itself. Mobile renders them as text, not a numeric
                    # km/h card like the geofence/weather alerts' metadata.
                    "metadata": {
                        "region_label": region.get("region_label"),
                        "wind_conditions": region.get("wind_conditions"),
                        "wave_or_swell_conditions": region.get("wave_or_swell_conditions"),
                        "hazards": region.get("hazards"),
                        "validity_note": region.get("validity_note"),
                    },
                })
                break

    cyclone = await get_cached("cyclone_warnings", refresh_if_missing=False)
    if cyclone:
        for region in cyclone.get("cyclone_warnings", []):
            if state_upper not in region.get("region_name", "").upper():
                continue
            hit = next((w for w in region.get("warnings", []) if w.get("severity") == "HIGH" and w.get("venture_advisory")), None)
            if hit:
                alerts.append({
                    "type": "IMD_CYCLONE_WARNING",
                    "severity": "HIGH",
                    "message": hit.get("warning") or hit.get("message"),
                    "source": "imd-cyclone-warning",
                    "metadata": {"region_name": region.get("region_name"), "issue_datetime_ist": hit.get("issue_datetime_ist")},
                })
                break

    sea_area_id = "arabian_sea" if state_upper in _WEST_COAST_STATES else "bay_of_bengal" if state_upper in _EAST_COAST_STATES else None
    if sea_area_id:
        sea = await get_cached("sea_area_bulletins", refresh_if_missing=False)
        bulletin = (sea or {}).get("sea_area_bulletins", {}).get(sea_area_id)
        ttt = (bulletin or {}).get("ttt_warning")
        if ttt and ttt.strip().upper() not in _NO_ACTIVE_TTT:
            alerts.append({
                "type": "IMD_CYCLONE_TTT_WARNING",
                "severity": "HIGH",
                "message": f"IMD storm warning for the {bulletin.get('sea_area')}: {ttt}",
                "source": "imd-sea-area-bulletin",
                "metadata": {"sea_area": bulletin.get("sea_area"), "ttt_warning": ttt},
            })

    return alerts
