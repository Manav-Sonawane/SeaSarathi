"""
imd_alerts.py — converts cached IMD live-feed data (imd_cache.py) into the
app's standard alert schema ({type, severity, message, source, metadata}),
matched to a location via the nearest-landing-center state/district — not a
surveyed jurisdiction boundary, only reliable near the coast.

Shared by:
  - GET /alerts (routers/alerts.py) — IMD warnings show up anywhere the app
    already renders /alerts (AlertsScreen, Dashboard, ...).
  - The chat agent (src/agents/data_agent.py) and the zonal news feed
    (imd_news_feed.py) — same alerts, so Alerts, Chat and News never disagree.

What changed and why (found live 2026-09-19 — see imd_bulletin_facts.py):
  * FRESHNESS. IMD's hub page still links regional PDFs from June 2024 and
    Jan/Jun/Aug 2026. Every bulletin's issue time + validity is parsed and an
    EXPIRED bulletin is never shown as an active warning — the user gets an
    explicit "expired, verify with IMD" notice instead.
  * SCOPE. A bulletin's "advised not to venture" line usually refers to the
    OPEN-SEA areas it lists, while the user's own coast is often "NIL". The old
    keyword check turned that into a HIGH alert for the coast. Now: warnings
    that NAME the user's coast are coast alerts; the rest are open-sea info.
  * CONTENT. Wind/gust as IMD states them, INCOIS swell-surge alerts (with the
    user's district first) and thunderstorm warnings are extracted
    deterministically — the LLM extraction returned nothing for Kerala.
  * NO OPEN-METEO ON IMD CARDS. The router used to stamp Open-Meteo's wind
    onto IMD cards (a 23 km/h reading under a 45–55 km/h IMD warning). IMD
    cards now carry only what IMD published.

Never triggers a live scrape (`refresh_if_missing=False`) — this must stay
fast on the /alerts and /chat request paths; imd_cache.get_cached() kicks off
a background refresh for stale data instead.

Deliberately does NOT match PORT warnings to a location: the scraped
port-warning data has no port coordinates, and inventing them would be
fabrication. Port warnings stay on GET /imd/port-warnings.
"""
import re
from datetime import datetime, timedelta, timezone
from functools import lru_cache

from src.services.imd_cache import get_cached
from src.services.imd_bulletin_facts import (
    IST, SEA_LABELS, bulletin_status, canonical_state, extract_facts,
    sea_for_state, states_named_in,
)

_NO_ACTIVE_TTT = {"NIL", "NO STORM WARNING", "NO WARNING", ""}

# A cyclone-archive warning older than this is not "today's" — the cache can
# briefly straddle midnight, and an old warning must not linger.
_CYCLONE_MAX_AGE = timedelta(hours=36)

# Coast wind alert severity, from IMD's own numbers, using the same cut-offs
# the app's Open-Meteo rules use (HIGH_WIND > 46 km/h): squally 45–55 km/h
# (gusting 60–65) is HIGH; "strong wind 30–40 gusting 50" is MODERATE.
_HIGH_WIND_KMPH = 45
_HIGH_GUST_KMPH = 60


@lru_cache(maxsize=32)
def _facts_for(raw_text: str) -> dict:
    """Facts depend only on the PDF text, so cache per text. Time-dependent
    parts (currency, expired swell alerts) are recomputed by callers against
    `now`, which is why swell alerts are kept here undropped."""
    return extract_facts(raw_text, drop_expired=False)


def _fmt_ist(iso_utc: str | None) -> str:
    if not iso_utc:
        return "unknown time"
    dt = datetime.fromisoformat(iso_utc).astimezone(IST)
    return f"{dt.day} {dt:%b} {dt:%H:%M} IST"


def _fmt_day(iso_date: str) -> str:
    d = datetime.fromisoformat(iso_date)
    return f"{d.day} {d:%b}"


def _day_label(days: list[int], dates: list[str] | None) -> str:
    if not days:
        return "Forecast period"
    contiguous = days == list(range(days[0], days[-1] + 1))
    nums = f"Day {days[0]}" if len(days) == 1 else (f"Day {days[0]}–{days[-1]}" if contiguous else "Day " + ", ".join(map(str, days)))
    if dates:
        span = _fmt_day(dates[0]) if len(dates) == 1 else (f"{_fmt_day(dates[0])}–{_fmt_day(dates[-1])}" if contiguous else ", ".join(_fmt_day(d) for d in dates))
        return f"{nums} · {span}"
    return nums


def _wind_text(g: dict) -> str:
    t = f"{g['wind_min']}–{g['wind_max']} {g['unit']}"
    return t + (f", gusting {g['gust']} {g['unit']}" if g.get("gust") else "")


def _title(state: str) -> str:
    return state.title()


def _bulletin_meta(region: dict, facts: dict) -> dict:
    return {
        "region_label": region.get("region_label"),
        "source_url": region.get("pdf_url"),
        "issued_at_utc": facts["issued_at_utc"],
        "issued_at_text": _fmt_ist(facts["issued_at_utc"]),
        "valid_until_utc": facts["valid_until_utc"],
        "validity_note": facts["validity_note"],
        "validity_assumed": facts["validity_assumed"],
        "distance_km": 0,
    }


def _evidence(source: str, kind: str, place: str, issued_at_utc: str | None,
              valid_until_utc: str | None = None, **fields) -> dict:
    """One extracted fact, stamped with when its source issued it. These ride in
    each alert's metadata["evidence"] and feed imd_simplifier.py, which decides
    which facts matter and — when two facts about the same place and kind
    disagree — keeps the one with the latest issue time. `issued_at_utc` is None
    when the source doesn't say (such facts are never overridden by timestamp)."""
    return {"source": source, "kind": kind, "place": place, "issued_at_utc": issued_at_utc,
            "valid_until_utc": valid_until_utc, **{k: v for k, v in fields.items() if v is not None}}


def _pick_bulletin(fisherman: dict, state: str, now: datetime):
    """The bulletin that speaks for this state: newest CURRENT one if any;
    otherwise the newest of whatever matched (so the caller can say it's
    expired/unverifiable). Returns (region, facts, status) or None."""
    candidates = []
    for r in fisherman.get("fisherman_warnings", []):
        if "error" in r or not r.get("raw_text"):
            continue
        if state not in states_named_in(r.get("region_label", "")):
            continue
        facts = _facts_for(r["raw_text"])
        issued = datetime.fromisoformat(facts["issued_at_utc"]) if facts["issued_at_utc"] else None
        until = datetime.fromisoformat(facts["valid_until_utc"]) if facts["valid_until_utc"] else None
        candidates.append((bulletin_status(issued, until, now), issued, r, facts))
    if not candidates:
        return None
    epoch = datetime.min.replace(tzinfo=timezone.utc)
    rank = {"current": 0, "unknown": 1, "expired": 2}
    candidates.sort(key=lambda c: (rank[c[0]], -(c[1] or epoch).timestamp()))
    status, _, region, facts = candidates[0]
    return region, facts, status


def _fisherman_alerts(fisherman: dict, state: str, district: str | None, now: datetime) -> list[dict]:
    picked = _pick_bulletin(fisherman, state, now)
    if picked is None:
        return []
    region, facts, status = picked
    meta = _bulletin_meta(region, facts)
    coast = f"{_title(state)} coast"
    src = "imd-fisherman-warning"

    # ── Not current: never present it as an active warning ──────────────────
    if status != "current":
        if status == "expired":
            msg = (f"IMD's latest published fisherman warning for {coast} was issued {meta['issued_at_text']} "
                   f"and has expired ({meta['validity_note']}), so it is not shown as an active warning. "
                   "Check mausam.imd.gov.in or your fisheries office for the current advisory before going to sea.")
            kind = "IMD_BULLETIN_EXPIRED"
        else:
            msg = (f"IMD's fisherman warning for {coast} has no readable issue date, so it can't be verified as "
                   "current. Check mausam.imd.gov.in before going to sea.")
            kind = "IMD_BULLETIN_UNVERIFIED"
        return [{"type": kind, "severity": "INFO", "message": msg, "source": src, "metadata": meta}]

    alerts: list[dict] = []
    stmts = facts["wind_statements"]
    coast_stmts = [g for g in stmts if state in g["covers"]]
    sea_id = sea_for_state(state)
    sea_stmts = [g for g in stmts if state not in g["covers"] and g["sea"] == sea_id]
    validity = f"Issued {meta['issued_at_text']} · {facts['validity_note']}"

    # ── 1. Wind warnings that NAME this coast ───────────────────────────────
    if coast_stmts:
        top = max(coast_stmts, key=lambda g: (g["wind_max"], g["gust"] or 0))
        severe = top["wind_max"] >= _HIGH_WIND_KMPH or (top["gust"] or 0) >= _HIGH_GUST_KMPH
        # IMD's own advisory for coastal statements is the "be cautious" line if
        # it printed one; the "not to venture" line is attached only when the
        # bulletin has no separate open-sea section it could be referring to.
        advisory = facts["caution_advisory_text"] or (None if sea_stmts else facts["venture_advisory_text"])
        lines = [f"IMD wind warning for {coast}: {top['text']}"]
        if top.get("sea_state"):
            lines.append(top["sea_state"])
        if advisory:
            lines.append(advisory)
        rows = [{"label": _day_label(g["days"], g.get("dates")), "text": f"{_wind_text(g)} — {g['text']}"} for g in coast_stmts]
        evidence = [
            _evidence(src, "wind", _title(state), meta["issued_at_utc"], meta["valid_until_utc"],
                      wind_min=g["wind_min"], wind_max=g["wind_max"], gust=g.get("gust"), unit=g["unit"],
                      period=_day_label(g["days"], g.get("dates")), sea_state=g.get("sea_state"))
            for g in coast_stmts
        ]
        if advisory:
            evidence.append(_evidence(src, "advisory", _title(state), meta["issued_at_utc"], meta["valid_until_utc"], text=advisory))
        alerts.append({
            "type": "IMD_COAST_WIND_WARNING",
            "severity": "HIGH" if severe else "MODERATE",
            "message": " ".join(lines),
            "source": src,
            "metadata": {**meta, "wind_conditions": _wind_text(top), "detail_title": validity, "detail_rows": rows,
                         "evidence": evidence},
        })

    # ── 2. INCOIS swell surge / high wave alerts (still in force) ───────────
    live = [a for a in facts["swell_alerts"] if datetime.fromisoformat(a["until_utc"]) >= now and a["state"] == state]
    if live:
        d_up = (district or "").strip().upper()
        state_level = not d_up
        mine = live if state_level else [a for a in live if any(d_up == x.upper() or d_up in x.upper() for x in a["districts"])]
        others = [] if state_level else [a for a in live if a not in mine]

        def _row(a, prefix=""):
            place = ", ".join(x.title() for x in a["districts"]) or a["place"].title()
            where = f"{place} ({a['stretch']})" if a.get("stretch") else place
            return {
                "label": f"{prefix}{where}",
                "text": (f"{a['kind']}: swell {a['height_m'][0]}–{a['height_m'][1]} m, {a['period_s'][0]:g}–{a['period_s'][1]:g} s period · "
                         f"{_fmt_ist(a['from_utc'])} → {_fmt_ist(a['until_utc'])}"),
            }

        if mine and state_level:
            names = ", ".join(sorted({x.title() for a in mine for x in a["districts"]}))
            hi = max(a["height_m"][1] for a in mine)
            head = (f"INCOIS swell surge alerts in force on the {coast}: {names}. Swell up to {hi} m; "
                    "IMD advises boats to ply with utmost vigilance.")
            rows = [_row(a) for a in mine]
            sev, swell_meta = "MODERATE", f"up to {hi} m swell"
        elif mine:
            m0 = max(mine, key=lambda a: a["height_m"][1])
            head = (f"INCOIS {m0['kind'].lower()} alert for {', '.join(x.title() for x in m0['districts'])} district"
                    + (f" ({m0['stretch']})" if m0.get("stretch") else "")
                    + f": swell {m0['height_m'][0]}–{m0['height_m'][1]} m, {m0['period_s'][0]:g}–{m0['period_s'][1]:g} s period, "
                      f"{_fmt_ist(m0['from_utc'])} to {_fmt_ist(m0['until_utc'])}. "
                      "IMD advises: possibility of wave surging — boats to ply with utmost vigilance.")
            rows = [_row(a) for a in mine] + [_row(a, "Also · ") for a in others]
            sev, swell_meta = "MODERATE", f"{m0['height_m'][0]}–{m0['height_m'][1]} m swell, {m0['period_s'][0]:g}–{m0['period_s'][1]:g} s"
        else:
            names = ", ".join(sorted({x.title() for a in live for x in a["districts"]}))
            head = (f"INCOIS swell surge alerts are active on other parts of the {coast} ({names}); "
                    f"none listed for {district.title() if district else 'your district'}.")
            rows = [_row(a) for a in live]
            sev, swell_meta = "INFO", f"{min(a['height_m'][0] for a in live)}–{max(a['height_m'][1] for a in live)} m swell"
        if facts["unparsed_swell_alerts"]:
            head += (f" {facts['unparsed_swell_alerts']} further alert(s) in the bulletin could not be read — "
                     "see incois.gov.in/site/services/hwa.jsp.")
        # Only alerts that apply to the user's own coast/district become facts;
        # the "active elsewhere on the coast" INFO case (no `mine`) has none.
        evidence = [
            _evidence(src, "swell", ", ".join(x.title() for x in a["districts"]) or a["place"].title(),
                      meta["issued_at_utc"], a["until_utc"],
                      height_min=a["height_m"][0], height_max=a["height_m"][1],
                      period_min=a["period_s"][0], period_max=a["period_s"][1],
                      from_utc=a["from_utc"], until_utc=a["until_utc"])
            for a in mine
        ]
        alerts.append({
            "type": "IMD_SWELL_SURGE_ALERT", "severity": sev, "message": head, "source": src,
            "metadata": {**meta, "wave_or_swell_conditions": swell_meta, "detail_title": "INCOIS alert via IMD · " + validity,
                         "detail_rows": rows, "evidence": evidence},
        })

    # ── 3. Thunderstorm warning naming this state ───────────────────────────
    ts = facts["thunderstorm"]
    if ts and state in ts["covers"]:
        alerts.append({
            "type": "IMD_THUNDERSTORM_WARNING", "severity": "MODERATE",
            "message": f"IMD thunderstorm warning: {ts['text']}",
            "source": src, "metadata": {**meta, "detail_title": validity, "detail_rows": [],
                                        "evidence": [_evidence(src, "thunderstorm", _title(state), meta["issued_at_utc"],
                                                               meta["valid_until_utc"], text=ts["text"])]},
        })

    # ── 4. Open-sea warnings for THIS coast's sea (not the user's coast) ────
    nil = state in facts["nil_coasts"]
    coast_line = ("" if coast_stmts else
                  f"IMD lists {coast} as NIL — no wind warning for your coast. " if nil
                  else f"No wind warning names {coast} in this IMD bulletin. ")
    if sea_stmts:
        rows = [{"label": _day_label(g["days"], g.get("dates")), "text": f"{_wind_text(g)} — {g['text']}"} for g in sea_stmts]
        top = max(sea_stmts, key=lambda g: (g["wind_max"], g["gust"] or 0))
        adv = facts["venture_advisory_text"]
        msg = (f"{coast_line}Open-sea warning for the {SEA_LABELS[sea_id]} (areas away from your coast): {top['text']}"
               + (f" IMD: {adv}" if adv else ""))
        alerts.append({
            "type": "IMD_OPEN_SEA_WARNING", "severity": "INFO", "message": msg, "source": src,
            "metadata": {**meta, "wind_conditions": _wind_text(top), "detail_title": f"{SEA_LABELS[sea_id]} · " + validity, "detail_rows": rows},
        })
    elif not coast_stmts:
        alerts.append({
            "type": "IMD_COAST_CLEAR", "severity": "INFO",
            "message": f"{coast_line}({validity}.)",
            "source": src, "metadata": {**meta, "detail_title": validity, "detail_rows": []},
        })
    return alerts


def _parse_cyclone_issue(s: str | None) -> datetime | None:
    try:
        return datetime.strptime(s, "%d-%m-%Y %H:%M:%S").replace(tzinfo=IST) if s else None
    except ValueError:
        return None


# Words that make an archive summary line a genuine cyclone / storm-type warning.
_STORM_WORDS = re.compile(r"cyclon|depression|storm|gale|hurricane|typhoon", re.I)


def _cyclone_archive_alert(cyclone: dict, state: str, now: datetime) -> dict | None:
    """One alert from the RSMC warning-archive summary for this state, if any.

    That feed gives only a one-line summary per region ("Fishermen are advised
    not to venture into the sea") and flags it HIGH — with no scope. Found live
    2026-09-19: South Tamil Nadu carried that line while the actual bulletin
    for the same day read "FISHERMEN WARNING FOR TAMIL NADU COAST: Day 1 to
    Day 4: NIL", the advisory being about OTHER sea areas. So a scope-less
    summary is shown as a caution (and NOT typed as a cyclone alert, which
    drives the app's cyclone flag); only summaries that actually use
    cyclone/storm language stay HIGH."""
    for region in cyclone.get("cyclone_warnings", []):
        if state not in states_named_in(region.get("region_name", "")):
            continue
        for w in region.get("warnings", []):
            issued = _parse_cyclone_issue(w.get("issue_datetime_ist"))
            if not (w.get("venture_advisory") and issued and now - issued <= _CYCLONE_MAX_AGE):
                continue
            text = (w.get("warning") or w.get("message") or "").strip()
            issued_txt = _fmt_ist(issued.astimezone(timezone.utc).isoformat())
            issued_utc = issued.astimezone(timezone.utc).isoformat()
            meta = {"region_name": region.get("region_name"), "issue_datetime_ist": w.get("issue_datetime_ist"),
                    "issued_at_text": issued_txt, "issued_at_utc": issued_utc, "source_url": w.get("pdf_url"), "distance_km": 0,
                    "evidence": [_evidence("imd-cyclone-warning", "advisory", _title(state), issued_utc, text=text)]}
            if _STORM_WORDS.search(text):
                return {"type": "IMD_CYCLONE_WARNING", "severity": "HIGH", "message": text,
                        "source": "imd-cyclone-warning", "metadata": meta}
            return {
                "type": "IMD_FISHERMEN_ARCHIVE_ADVISORY", "severity": "MODERATE",
                "message": (f"IMD warning archive ({region.get('region_name')}, issued {issued_txt}): “{text}”. "
                            "This one-line summary does not say which areas it covers — check IMD's regional "
                            "bulletin for your coast."),
                "source": "imd-cyclone-warning", "metadata": meta,
            }
    return None


async def get_location_imd_alerts(state_name: str | None, district: str | None = None,
                                  now: datetime | None = None) -> list[dict]:
    """
    `state_name`: the landing-location sector already resolved by the caller
    ('KERALA', 'NORTH TAMILNADU', ...) — normalised here. `district` (e.g.
    'Ernakulam') lets swell-surge alerts be matched to the user's own coast.
    """
    state = canonical_state(state_name)
    if not state:
        return []
    now = now or datetime.now(timezone.utc)
    alerts: list[dict] = []

    fisherman = await get_cached("fisherman_warnings", refresh_if_missing=False)
    if fisherman:
        alerts += _fisherman_alerts(fisherman, state, district, now)

    cyclone = await get_cached("cyclone_warnings", refresh_if_missing=False)
    if cyclone:
        alert = _cyclone_archive_alert(cyclone, state, now)
        if alert:
            alerts.append(alert)

    sea_area_id = sea_for_state(state)
    if sea_area_id:
        sea = await get_cached("sea_area_bulletins", refresh_if_missing=False)
        bulletin = (sea or {}).get("sea_area_bulletins", {}).get(sea_area_id)
        ttt = (bulletin or {}).get("ttt_warning")
        until = (bulletin or {}).get("valid_until_utc")
        still_valid = bool(until) and now <= datetime.fromisoformat(until)   # a lapsed bulletin can't assert a storm
        if ttt and ttt.strip().upper() not in _NO_ACTIVE_TTT and still_valid:
            alerts.append({
                "type": "IMD_CYCLONE_TTT_WARNING", "severity": "HIGH",
                "message": f"IMD storm warning for the {bulletin.get('sea_area')}: {ttt}",
                "source": "imd-sea-area-bulletin",
                "metadata": {"sea_area": bulletin.get("sea_area"), "ttt_warning": ttt, "valid_until_utc": until, "distance_km": 0,
                             # This feed states no issue time — only how long it holds.
                             "evidence": [_evidence("imd-sea-area-bulletin", "storm", str(bulletin.get("sea_area") or _title(state)),
                                                    None, until, text=str(ttt))]},
            })

    return alerts


async def get_location_bulletin_summary(state_name: str | None, now: datetime | None = None) -> dict | None:
    """Which IMD fisherman bulletin speaks for this state and how current it is —
    shown on the Alerts screen so the reader can see WHEN IMD issued what they're
    looking at. None if no bulletin covers the state / nothing cached yet."""
    state = canonical_state(state_name)
    if not state:
        return None
    fisherman = await get_cached("fisherman_warnings", refresh_if_missing=False)
    if not fisherman:
        return None
    now = now or datetime.now(timezone.utc)
    picked = _pick_bulletin(fisherman, state, now)
    if picked is None:
        return None
    region, facts, status = picked
    return {
        "region_label": region.get("region_label"),
        "source_url": region.get("pdf_url"),
        "issued_at_utc": facts["issued_at_utc"],
        "issued_at_text": _fmt_ist(facts["issued_at_utc"]),
        "valid_until_utc": facts["valid_until_utc"],
        "valid_until_text": _fmt_ist(facts["valid_until_utc"]) if facts["valid_until_utc"] else None,
        "validity_note": facts["validity_note"],
        "status": status,
    }
