"""
imd_simplifier.py — boils the timestamped facts extracted from IMD's sources
(imd_alerts.py attaches them as metadata["evidence"]) down to the few things a
fisherman acts on: wind speed / gusts, swell height and period, the place, and
the times. Everything else in the scraped data is left out of the summary.

Each fact carries when its source issued it. When two facts describe the same
place and the same kind of thing but come from different issue times, the one
issued LATER wins (`find_superseded`) — e.g. a June-20 "advised not to venture"
archive line versus a June-21 bulletin that says "be cautious".

The LLM is used for the judgement calls — which facts matter, which advisory to
quote, one plain-language sentence — but it is boxed in, because an earlier
free-text rewrite invented advice IMD never gave (see imd_news_feed.py):
  * it never writes numbers, places or times: it returns fact IDs, and every
    value shown comes from the facts themselves;
  * its sentence may only contain numbers from the facts it cites and may not
    contain instructions ("do not", "avoid", ...); advice is quoted verbatim
    from an IMD fact, never composed;
  * code re-checks the timestamp rule, and re-adds any wind / thunderstorm /
    storm fact it left out;
  * if the call fails or its answer breaks a rule, the same summary is built
    by plain rules (method == "rules").

Open-Meteo forecasts are NOT facts here. A model reading is always "now", so
latest-wins would let it override an official IMD warning — the exact bug
fixed on 2026-09-19 (a 23 km/h reading shown under a 45–55 km/h IMD warning).
"""
import asyncio
import hashlib
import json
import re
import time
from datetime import datetime

from src.services.imd_bulletin_facts import IST
from src.services.sarvam_client import sarvam_generate

_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_MAX_ENTRIES = 64
_RULES_RETRY_AFTER_S = 120.0     # a rules-only result is re-tried with the LLM after this long
_LLM_TIMEOUT_S = 12.0
_MAX_SWELL_ITEMS = 3
_MAX_WIND_ITEMS = 3

# Kinds that must always reach the fisherman if they're current: the LLM can
# choose among swell entries, but may not drop these.
_MUST_KEEP = {"wind", "thunderstorm", "storm"}
_NUMERIC_FIELDS = ("wind_min", "wind_max", "gust", "height_min", "height_max", "period_min", "period_max")

# The sentence is a description, not advice: anything that reads as an
# instruction is rejected (advice is quoted from IMD instead).
_ADVICE_WORDS = re.compile(
    r"\b(do not|don't|dont|avoid|stay|should|must|advis\w*|venture|return|go out|go to sea|safe|unsafe|"
    r"recommend\w*|warn\w*|be careful|caution\w*|cancel\w*|allowed|prohibit\w*)\b", re.I)


# ── facts ───────────────────────────────────────────────────────────────────

def _ts(iso: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(iso) if iso else None
    except ValueError:
        return None


def _fmt_ist(iso: str | None) -> str | None:
    dt = _ts(iso)
    if dt is None:
        return None
    dt = dt.astimezone(IST)
    return f"{dt.day} {dt:%b} {dt:%H:%M} IST"


def _num(x) -> str:
    return f"{x:g}" if isinstance(x, (int, float)) else str(x)


def collect_evidence(alerts: list[dict]) -> list[dict]:
    """Flattens the evidence of all IMD alerts into one de-duplicated list of
    facts with stable ids (F1, F2, ...)."""
    seen: set[str] = set()
    facts: list[dict] = []
    for a in alerts:
        for ev in (a.get("metadata") or {}).get("evidence") or []:
            key = json.dumps(ev, sort_keys=True, default=str)
            if key in seen:
                continue
            seen.add(key)
            facts.append({**ev, "id": f"F{len(facts) + 1}"})
    return facts


def _place_key(place: str | None) -> str:
    return re.sub(r"[^a-z]", "", (place or "").lower())


def find_superseded(facts: list[dict]) -> dict[str, str]:
    """{older_fact_id: newer_fact_id}. Same place + same kind, different issue
    time -> the later issue time wins. A fact whose source states no issue time
    can't be compared, so it is neither superseded nor superseding."""
    groups: dict[tuple[str, str], list[dict]] = {}
    for f in facts:
        if _ts(f.get("issued_at_utc")) is not None:
            groups.setdefault((_place_key(f.get("place")), f["kind"]), []).append(f)
    out: dict[str, str] = {}
    for group in groups.values():
        newest = max(group, key=lambda f: _ts(f["issued_at_utc"]))
        for f in group:
            if _ts(f["issued_at_utc"]) < _ts(newest["issued_at_utc"]):
                out[f["id"]] = newest["id"]
    return out


# ── the LLM step ────────────────────────────────────────────────────────────

_SYSTEM_RULES = """You simplify official Indian marine warnings for fishermen who read little.
Below are FACTS extracted from official sources. Each fact says which source issued it and WHEN (issued_at_utc).

RULES
1. Use ONLY these facts. Never add, guess, round, convert or infer any number, place, time or advice.
2. Keep only what a fisherman needs: wind speed and gusts, swell height and period, the place, and the times. Leave the rest out.
3. CONFLICTS: if two facts have the same place and the same kind but different content, they conflict. Keep ONLY the one with the LATER issued_at_utc and list the other's id under "dropped". If issued_at_utc is null the fact cannot be compared: keep it.
4. Give at most 3 swell facts (the most important for this place). Keep every wind, thunderstorm and storm fact.
5. "advice_fact_id": the id of ONE advisory fact to show (the latest one), or null. Never write advice yourself.
6. "plain": ONE short sentence in very simple English describing the conditions only. Use only numbers that appear in the facts you cite. No instructions, no advice, no words like "avoid" or "should".

Answer with ONLY this JSON, nothing else:
{"keep":["F1","F2"],"advice_fact_id":"F3","dropped":["F4"],"plain":"..."}"""


def build_prompt(facts: list[dict]) -> str:
    lines = [json.dumps({k: v for k, v in f.items() if v is not None}, ensure_ascii=False) for f in facts]
    return f"{_SYSTEM_RULES}\n\nFACTS (one per line):\n" + "\n".join(lines)


def _parse_json(raw: str) -> dict | None:
    """The model is a reasoning model; pull the last JSON object out of whatever it returned."""
    for m in reversed(list(re.finditer(r"\{[^{}]*\}", raw, re.S))):
        try:
            obj = json.loads(m.group(0))
        except ValueError:
            continue
        if isinstance(obj, dict) and "keep" in obj:
            return obj
    return None


def _numbers_in(text: str) -> set[str]:
    return set(re.findall(r"\d+(?:\.\d+)?", text))


def _allowed_numbers(cited: list[dict]) -> set[str]:
    out: set[str] = set()
    for f in cited:
        for k in _NUMERIC_FIELDS:
            if isinstance(f.get(k), (int, float)):
                out.add(_num(f[k]))
    return out


def validate_llm_answer(answer: dict, facts: list[dict], superseded: dict[str, str]) -> tuple[list[str], str | None, str | None]:
    """Returns (kept_ids, advice_id, plain) with everything that breaks a rule
    removed. Raises ValueError if the answer is unusable as a whole."""
    by_id = {f["id"]: f for f in facts}
    keep_raw = answer.get("keep")
    if not isinstance(keep_raw, list):
        raise ValueError("'keep' is not a list")
    kept = [i for i in dict.fromkeys(keep_raw) if i in by_id and i not in superseded and by_id[i]["kind"] != "advisory"]

    swell = [i for i in kept if by_id[i]["kind"] == "swell"][:_MAX_SWELL_ITEMS]
    kept = [i for i in kept if by_id[i]["kind"] != "swell"] + swell

    # Safety net: the model may not drop a current wind / thunderstorm / storm fact.
    for f in facts:
        if f["kind"] in _MUST_KEEP and f["id"] not in superseded and f["id"] not in kept:
            kept.append(f["id"])

    advice_id = answer.get("advice_fact_id")
    if advice_id not in by_id or by_id[advice_id]["kind"] != "advisory" or advice_id in superseded:
        advice_id = None

    plain = answer.get("plain")
    if isinstance(plain, str) and plain.strip():
        plain = plain.strip()
        cited = [by_id[i] for i in kept]
        ok = (
            len(plain) <= 220
            and not _ADVICE_WORDS.search(plain)
            and _numbers_in(plain) <= _allowed_numbers(cited)
        )
        plain = plain if ok else None
    else:
        plain = None
    return kept, advice_id, plain


# ── building the output from the chosen facts ──────────────────────────────

def _item(f: dict) -> dict:
    base = {"kind": f["kind"], "place": f.get("place"), "source": f.get("source"),
            "issued_at_utc": f.get("issued_at_utc"), "issued_text": _fmt_ist(f.get("issued_at_utc")),
            "valid_until_utc": f.get("valid_until_utc"), "valid_until_text": _fmt_ist(f.get("valid_until_utc"))}
    if f["kind"] == "wind":
        base.update(wind_min=f["wind_min"], wind_max=f["wind_max"], gust=f.get("gust"), unit=f.get("unit", "kmph"),
                    period=f.get("period"))
    elif f["kind"] == "swell":
        base.update(height_min=f["height_min"], height_max=f["height_max"],
                    period_min=f.get("period_min"), period_max=f.get("period_max"),
                    from_text=_fmt_ist(f.get("from_utc")), until_text=_fmt_ist(f.get("until_utc")))
    else:   # thunderstorm / storm: IMD's own sentence, verbatim
        base.update(text=f.get("text"))
    return base


def _order(f: dict) -> tuple:
    """Storm first, then thunderstorm, wind, swell; within a kind, the order IMD listed them."""
    return ({"storm": 0, "thunderstorm": 1, "wind": 2, "swell": 3}.get(f["kind"], 9), int(f["id"][1:]))


def assemble(facts: list[dict], superseded: dict[str, str], kept: list[str], advice_id: str | None,
             plain: str | None, method: str) -> dict:
    by_id = {f["id"]: f for f in facts}
    items, wind_shown = [], 0
    for f in sorted((by_id[i] for i in kept), key=_order):
        if f["kind"] == "wind":
            wind_shown += 1
            if wind_shown > _MAX_WIND_ITEMS:
                continue
        items.append(_item(f))
    advice = None
    if advice_id:
        a = by_id[advice_id]
        advice = {"text": a.get("text"), "source": a.get("source"), "issued_text": _fmt_ist(a.get("issued_at_utc"))}
    return {
        "items": items,
        "advice": advice,
        "plain": plain,
        "method": method,
        # What the newer-wins rule set aside, so it can be audited.
        "superseded": [
            {"kind": by_id[o]["kind"], "place": by_id[o].get("place"), "source": by_id[o].get("source"),
             "issued_text": _fmt_ist(by_id[o].get("issued_at_utc")),
             "replaced_by_issued_text": _fmt_ist(by_id[n].get("issued_at_utc"))}
            for o, n in superseded.items()
        ],
    }


def summarize_by_rules(facts: list[dict], superseded: dict[str, str]) -> dict:
    """The no-LLM summary: every current wind/thunderstorm/storm fact, the 3
    biggest swell facts, and the latest advisory."""
    live = [f for f in facts if f["id"] not in superseded]
    swell = sorted((f for f in live if f["kind"] == "swell"), key=lambda f: -f["height_max"])[:_MAX_SWELL_ITEMS]
    kept = [f["id"] for f in live if f["kind"] in _MUST_KEEP] + [f["id"] for f in swell]
    advisories = [f for f in live if f["kind"] == "advisory"]
    latest = max(advisories, key=lambda f: _ts(f.get("issued_at_utc")) or datetime.fromtimestamp(0, IST), default=None)
    return assemble(facts, superseded, kept, latest["id"] if latest else None, None, "rules")


async def simplify(alerts: list[dict]) -> dict | None:
    """Key-facts summary for a location's IMD alerts, or None if they carry no
    facts. Cached by the facts' content — a new bulletin (new issue time) is a
    new key, so the LLM runs once per change in IMD's data, not per request."""
    facts = collect_evidence(alerts)
    if not facts:
        return None
    key = hashlib.sha1(json.dumps(facts, sort_keys=True, default=str).encode()).hexdigest()
    hit = _CACHE.get(key)
    if hit and (hit[1]["method"] == "llm" or time.monotonic() - hit[0] < _RULES_RETRY_AFTER_S):
        return hit[1]

    superseded = find_superseded(facts)
    result = None
    try:
        raw = await asyncio.wait_for(asyncio.to_thread(sarvam_generate, build_prompt(facts), 700, 0.0), _LLM_TIMEOUT_S)
        answer = _parse_json(raw)
        if answer is None:
            raise ValueError(f"no JSON in model answer: {raw[:160]!r}")
        kept, advice_id, plain = validate_llm_answer(answer, facts, superseded)
        result = assemble(facts, superseded, kept, advice_id, plain, "llm")
    except Exception as e:
        print(f"[imd_simplifier] LLM step failed, using rules: {e}")
    if result is None:
        result = summarize_by_rules(facts, superseded)

    if len(_CACHE) >= _CACHE_MAX_ENTRIES:
        _CACHE.pop(next(iter(_CACHE)))
    _CACHE[key] = (time.monotonic(), result)
    return result
