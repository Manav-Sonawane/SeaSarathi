"""
imd_bulletin_facts.py — deterministic (no LLM) extraction of the
safety-relevant facts from IMD's regional fisherman-warning PDFs.

Why this exists. The LLM extractor in imd_fisherman_scraper.py was found live
(2026-09-19) to return *everything empty* for the Kerala/Karnataka/Lakshadweep
bulletin, and the keyword cross-check that "fixes" that only flips two
booleans — `"not to venture" in text` — which is true for that PDF because
IMD's line "Fishermen are advised not to venture into the above sea areas"
refers to the OPEN-SEA areas listed under "FOR OTHER COASTS AND OPEN SEAS"
(north Somalia coast, Andaman Sea, ...), while the same PDF says
"Keralam coast NIL / Karnataka coast NIL / Lakshadweep area NIL". So the app
showed a critical "do not venture" alert for a coast IMD said was clear, with
none of the real content (wind/gust, swell surge, thunderstorm).

This module reads what the text actually says, and keeps three things
separate that the old code merged into one boolean:
  * a wind warning that NAMES the user's coast     -> "coast" statements
  * a wind warning for other coasts / open sea      -> "sea" statements
  * INCOIS swell-surge alerts, per district, with numbers and time windows
plus the bulletin's issue time and validity, so an EXPIRED bulletin (IMD's
hub page still links PDFs from 2024 and Jan/Jun/Aug 2026 for some regions)
is never presented as an active warning.

Everything is a regex over IMD's own wording; nothing is inferred. Anything
that looks like an alert but can't be parsed is counted in `unparsed_*` so
callers can say "N more alerts couldn't be read — see IMD" instead of
silently dropping it.
"""
import re
from datetime import date, datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))

# Fallback when a bulletin states no validity window and no dated days: IMD
# fisherman warnings are issued at least daily, so treat an undated-validity
# bulletin as current for 24 h only. Flagged via validity_assumed=True.
DEFAULT_VALIDITY = timedelta(hours=24)

_MONTHS = {
    m: i for i, m in enumerate(
        ["january", "february", "march", "april", "may", "june", "july",
         "august", "september", "october", "november", "december"], 1)
}
_MONTHS.update({k[:3]: v for k, v in list(_MONTHS.items())})

_WORD_NUMBERS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
                 "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}

# ── Geography ────────────────────────────────────────────────────────────────

STATE_PATTERNS = {
    "KERALA": r"kerala|keralam",
    "KARNATAKA": r"karnataka",
    "GOA": r"\bgoa\b",
    "MAHARASHTRA": r"maharashtra",
    "GUJARAT": r"gujarat",
    "TAMIL NADU": r"tamil\s*nadu|puducherry|karaikal",
    "ANDHRA PRADESH": r"andhra",
    "ODISHA": r"odisha|orissa",
    "WEST BENGAL": r"west\s+bengal",
    "ANDAMAN & NICOBAR": r"andaman|nicobar",
    "LAKSHADWEEP": r"lakshadweep",
}
_STATE_RES = {k: re.compile(v, re.IGNORECASE) for k, v in STATE_PATTERNS.items()}

_WEST_COAST = {"KERALA", "KARNATAKA", "GOA", "MAHARASHTRA", "GUJARAT", "LAKSHADWEEP"}
SEA_LABELS = {"arabian_sea": "Arabian Sea", "bay_of_bengal": "Bay of Bengal"}


def canonical_state(name: str | None) -> str | None:
    """Maps any spelling in this project's data ('NORTH TAMILNADU', 'SOUTH
    ANDHRAPRADESH', 'Kerala Coast', 'Keralam', 'ANDAMAN', ...) to one key.
    The landing-locations sector names have no spaces in TAMILNADU /
    ANDHRAPRADESH, which is why plain `state in region_label` matching never
    worked for those states."""
    if not name:
        return None
    for key, rx in _STATE_RES.items():
        if rx.search(name):
            return key
    return None


def states_named_in(text: str) -> list[str]:
    return [k for k, rx in _STATE_RES.items() if rx.search(text)]


def sea_for_state(state: str | None) -> str | None:
    if not state:
        return None
    return "arabian_sea" if state in _WEST_COAST else "bay_of_bengal"


def _sea_of(text: str) -> str | None:
    t = text.lower()
    if "arabian sea" in t or "somalia" in t or "gulf of aden" in t or "oman" in t:
        return "arabian_sea"
    if "bay of bengal" in t or "andaman" in t or "sri lanka" in t or "myanmar" in t or "nicobar" in t:
        return "bay_of_bengal"
    return None


# ── Issue time & validity ────────────────────────────────────────────────────

def _hhmm(s: str) -> tuple[int, int]:
    s = s.zfill(4)
    return int(s[:2]), int(s[2:])


def _mk(y, m, d, hhmm) -> datetime | None:
    try:
        h, mi = _hhmm(hhmm)
        return datetime(int(y), int(m), int(d), h, mi, tzinfo=IST)
    except ValueError:
        return None


def _month(name: str) -> int | None:
    return _MONTHS.get(name.strip().lower())


def parse_issue_time(text: str) -> datetime | None:
    """First matching issue timestamp (IST-aware) across the formats the
    seven regional offices use. See tests/fixtures/imd/ for a real sample of
    each. Returns None when none match — callers must treat that as
    'freshness unknown', never as 'fresh'."""
    head = text[:2500]
    # a1  DATE: 2026-06-27 TIME OF ISSUE: 0530 IST
    m = re.search(r"DATE:\s*(\d{4})-(\d{2})-(\d{2})\s*TIME OF ISSUE:\s*(\d{3,4})", head, re.I)
    if m:
        return _mk(m[1], m[2], m[3], m[4])
    # a4/a7  DATE: 22-08-2026 Time of Issue: 1300 hrs   /   Date of Issue: 19-09-2026 Time of issue: 0530 hrs
    m = re.search(r"(?:Date of Issue|DATE):\s*(\d{2})[-./](\d{2})[-./](\d{4})\s*Time of issue:\s*(\d{3,4})", head, re.I)
    if m:
        return _mk(m[3], m[2], m[1], m[4])
    # a3  Warning for Fishermen 18.09.2026 / 0600 HRS IST
    m = re.search(r"Warning for Fishermen\s*(\d{2})\.(\d{2})\.(\d{4})\s*/\s*(\d{3,4})", head, re.I)
    if m:
        return _mk(m[3], m[2], m[1], m[4])
    # a5  Date: 19th September 2026 VALID FOR NEXT 4 DAYS Time of Issue: 0600 HRS IST
    m = re.search(r"Date:\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4}).{0,60}?Time of Issue:\s*(\d{3,4})", head, re.I | re.S)
    if m and _month(m[2]):
        return _mk(m[3], _month(m[2]), m[1], m[4])
    # a6  Tuesday, 18 June, 2024 Time of issue: 2100 Hrs IST
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})\s+Time of issue:\s*(\d{3,4})", head, re.I)
    if m and _month(m[2]):
        return _mk(m[3], _month(m[2]), m[1], m[4])
    # a2  COMMENCING FROM 2100HRS IST ON DATE 08.01.2026
    m = re.search(r"(\d{3,4})\s*HRS\s*IST\s*ON\s*DATE\s*(\d{2})\.(\d{2})\.(\d{4})", head, re.I)
    if m:
        return _mk(m[4], m[3], m[2], m[1])
    return None


_NUM = r"(\d+|one|two|three|four|five|six|seven|eight|nine|ten)"


def _to_int(s: str) -> int:
    return int(s) if s.isdigit() else _WORD_NUMBERS[s.lower()]


def parse_validity(text: str, issued: datetime | None) -> tuple[datetime | None, bool, str | None]:
    """Returns (valid_until, assumed, note). `valid_until` is the END of the
    last covered day (IST midnight). `assumed` is True when the bulletin
    stated nothing and DEFAULT_VALIDITY was used."""
    if issued is None:
        return None, False, None
    flat = re.sub(r"\s+", " ", text[:4000])

    # "(For 5 days from 18th September 2026 to 22nd September 2026)" — the
    # stated start date wins over the issue date.
    m = re.search(rf"for\s+{_NUM}\s+days?\s+from\s+(\d{{1,2}})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{{4}})", flat, re.I)
    if m and _month(m[3]):
        n = _to_int(m[1])
        start = datetime(int(m[4]), _month(m[3]), int(m[2]), tzinfo=IST)
        return start + timedelta(days=n), False, f"For {n} days from {start:%d %b %Y}"

    m = re.search(rf"valid\s+for\s+(?:the\s+)?next\s+{_NUM}\s*(?:\(\d+\)\s*)?days?", flat, re.I)
    if m:
        n = _to_int(m[1])
        day0 = issued.replace(hour=0, minute=0, second=0, microsecond=0)
        return day0 + timedelta(days=n), False, f"Valid for next {n} days"

    # No stated window: use the last explicitly dated forecast day, if any.
    dates = []
    for d, mo, y in re.findall(r"\b(\d{2})[./](\d{2})[./](20\d{2})\b", flat):
        try:
            dates.append(date(int(y), int(mo), int(d)))
        except ValueError:
            pass
    if dates:
        last = max(dates)
        return datetime(last.year, last.month, last.day, tzinfo=IST) + timedelta(days=1), False, f"Through {last:%d %b %Y}"

    return issued + DEFAULT_VALIDITY, True, "No validity stated — assumed 24 h from issue"


def bulletin_status(issued: datetime | None, valid_until: datetime | None, now: datetime | None = None) -> str:
    """'current' | 'expired' | 'unknown' (issue time unreadable)."""
    if issued is None or valid_until is None:
        return "unknown"
    now = now or datetime.now(timezone.utc)
    return "current" if now <= valid_until else "expired"


# ── Wind statements ──────────────────────────────────────────────────────────

_SPEED_RE = re.compile(r"(\d{2,3})\s*(?:-|to)\s*(\d{2,3})\s*(kmph|km/h|kmh|kts|knots?)", re.I)
_GUST_RE = re.compile(r"gusting\s*(?:up\s*)?(?:to\s*)?(\d{2,3})", re.I)
_STATEMENT_START = re.compile(r"\b(Squally|Strong|Gale|Gusty|Very strong|Winds?)\b")
_PREFIX_MARKER = re.compile(r"\bDay\s*-?\s*(\d)\s*(?:\((\d{2})[./](\d{2})[./](\d{4})\))?\s*[:\-]", re.I)
_LABEL = re.compile(r"(Arabian Sea|Bay of Bengal)\s*:", re.I)
_NOISE_DAY = re.compile(r"\bDay\s*-?\s*\d\b", re.I)
_NOISE_DATE = re.compile(r"\(\s*\d{2}[./]\d{2}[./]\d{4}\s*\)")
_SEA_STATE = re.compile(r"Sea will be (?:very )?rough[^.]*", re.I)


def _flatten(text: str) -> str:
    t = text.replace("–", "-").replace("—", "-")
    t = re.sub(r"Page\s*\|\s*\d+", " ", t)
    t = re.sub(r"\s+", " ", t)
    # PDF line-wraps split dates ("20-" / "09-2026") — rejoin so date regexes match.
    t = re.sub(r"(\d)-\s+(\d)", r"-", t)
    # IMD often omits the full stop before the advisory line, which would glue
    # it onto the last wind statement.
    return re.sub(r"(?<=[a-z])\s+(?=(?:\*\s*NOTE:\s*)?Fishermen are advised)", ". ", t)


def _split_sentences(flat: str) -> list[tuple[int, str]]:
    out, pos = [], 0
    for part in re.split(r"(?<=[a-z\)])\.\s+(?=[A-Z(]|\d)", flat):
        out.append((flat.find(part, pos), part.strip()))
        pos = max(pos, flat.find(part, pos)) + len(part)
    return out


def extract_wind_statements(text: str, start_date: date | None) -> list[dict]:
    """Every sentence that states a wind speed range, grouped by identical
    wording with the days it applies to. Wording is IMD's own (only noise
    like PDF table row labels is removed); numbers are parsed alongside."""
    flat = _flatten(text)
    # Only the forecast part — INCOIS swell numbers ("16.0 - 19.0 sec") are not wind.
    incois_at = re.search(r"OCEAN CURRENT ALERT|SWELL SURGE (?:ALERT|WARNING)", flat)
    forecast = flat[: incois_at.start()] if incois_at else flat

    markers = [(m.start(), int(m[1]), (m[2], m[3], m[4])) for m in _PREFIX_MARKER.finditer(forecast)]
    use_prefix = len(markers) >= 2

    groups: dict[tuple, dict] = {}
    order: list[tuple] = []
    block, seen_labels = 1, set()
    last_key = None

    for pos, sentence in _split_sentences(forecast):
        rough = _SEA_STATE.search(sentence)
        if rough and last_key is not None:
            groups[last_key]["sea_state"] = rough.group(0).strip() + "."
        sp = _SPEED_RE.search(sentence)
        if not sp or re.search(r"sec\s*period", sentence, re.I):
            continue

        st = _STATEMENT_START.search(sentence)
        if not st:
            continue
        # The sea label can be glued to preceding header text (no full stop
        # before it), so take the last one anywhere before the statement.
        labels = _LABEL.findall(sentence[: st.start()])
        label = labels[-1].lower().replace(" ", "_") if labels else None
        body = sentence[st.start():]
        body = _NOISE_DATE.sub(" ", _NOISE_DAY.sub(" ", body))
        body = re.sub(r"\s+", " ", body).strip()
        if not body.endswith("."):
            body += "."
        # Table-column artefact: "…south Sri Lanka coast." keeps its noun after the row label was removed.
        body = re.sub(r"\s+([.,])", r"\1", body)

        # Day assignment: explicit "Day N:" prefix markers when the PDF has them,
        # otherwise blocks that restart at each repeated leading sea label.
        if use_prefix:
            day = None
            stmt_pos = pos + st.start()
            for mpos, mday, _ in markers:
                if mpos <= stmt_pos:
                    day = mday
            if day is None:
                day = markers[0][1]
        else:
            if label and label in seen_labels:
                block += 1
                seen_labels = set()
            if label:
                seen_labels.add(label)
            day = block

        sea = ("arabian_sea" if label == "arabian_sea" else "bay_of_bengal" if label == "bay_of_bengal" else _sea_of(body))
        gust = _GUST_RE.search(body)
        key = (sea, re.sub(r"[^a-z0-9]+", " ", body.lower()).strip())
        if key not in groups:
            unit = "knots" if sp[3].lower().startswith(("kt", "knot")) else "km/h"
            groups[key] = {
                "text": body,
                "sea": sea,
                "wind_min": int(sp[1]),
                "wind_max": int(sp[2]),
                "gust": int(gust[1]) if gust else None,
                "unit": unit,
                "covers": states_named_in(body),
                "days": [],
                "sea_state": None,
            }
            order.append(key)
        if day not in groups[key]["days"]:
            groups[key]["days"].append(day)
        last_key = key

    result = []
    for key in order:
        g = groups[key]
        g["days"].sort()
        if start_date:
            g["dates"] = [(start_date + timedelta(days=d - 1)).isoformat() for d in g["days"]]
        result.append(g)
    return result


# ── Coast NIL / venture advisory / thunderstorm ──────────────────────────────

def extract_nil_coasts(text: str) -> list[str]:
    flat = _flatten(text)
    nil = []
    for key, pat in STATE_PATTERNS.items():
        if re.search(rf"(?:{pat})\s*(?:coasts?|areas?)?\s*:?\s*NIL\b", flat, re.I):
            nil.append(key)
    return nil


def extract_venture_advisory(text: str) -> str | None:
    m = re.search(r"(Fishermen (?:are )?advised not to venture[^.]*\.)", _flatten(text), re.I)
    return m.group(1).strip() if m else None


def extract_caution_advisory(text: str) -> str | None:
    """'Fishermen are advised to be cautious while venturing into the Sea' —
    IMD's softer wording (Gujarat) — distinct from 'not to venture'."""
    m = re.search(r"(Fishermen (?:are )?advised to be cautious[^.]*\.)", _flatten(text), re.I)
    return m.group(1).strip() if m else None


def extract_thunderstorm(text: str) -> dict | None:
    flat = _flatten(text)
    m = re.search(r"THUNDERSTORM WARNING\s*:?\s*(.+?)(?=PORT WARNING|OCEAN CURRENT|SWELL SURGE|FOR SWELL|DUTY OFFICER|$)", flat, re.I)
    if not m:
        return None
    body = m.group(1).strip()
    return {"text": body, "covers": states_named_in(body)} if body else None


# ── Port warning (cautionary signals per port) ──────────────────────────────

# "Kerala Ports S.No Name of the Port Advice 1 KASARGOD Keep hoisted Local Cautionary signal number
# III 2 CANNANORE ..." — one such table per region. Region names are Title Case (IMD prints
# "Kerala", "Lakshadweep", "Tamil Nadu"), which keeps the header apart from the previous
# table's ALL-CAPS port names and lower-case advice words.
_PORT_TABLE_HEAD = re.compile(
    r"((?:[A-Z][a-z]+)(?:\s+[A-Z][a-z]+){0,2})\s+Ports?\s+S\.?\s*No\.?\s+Name of the Port\s+Advice")
_PORT_ENTRY = re.compile(r"(\d+)\.?\s+([A-Z][A-Z .'()/-]*?)\s+(Keep\s.*?)(?=\s+\d+\.?\s+[A-Z]{2,}|\s*$)")
_PORT_NUMBERED = re.compile(r"(?:(?<=\s)|^)\d+\.?\s+[A-Z]{3,}")


def extract_port_warning(text: str) -> dict | None:
    """The bulletin's PORT WARNING section, or None when it says Nil / is absent.

    {"text": the section verbatim, "parsed": bool,
     "groups": [{"region": "Kerala", "ports": [{"name": "KASARGOD", "advice": "Keep hoisted ..."}]}]}

    `parsed` is True only if EVERY numbered port in the section was read into a group; otherwise
    `groups` is empty and callers must show `text` as-is — a port must never silently vanish
    from a safety warning."""
    flat = _flatten(text)
    m = re.search(r"PORT WARNING\s*:?\s*(.+?)(?=HIGH WAVE ALERT|OCEAN CURRENT|SWELL SURGE|FOR SWELL|DUTY OFFICER|$)", flat, re.I)
    if not m:
        return None
    body = m.group(1).strip()
    if not body or re.fullmatch(r"nil\.?", body, re.I):
        return None

    heads = list(_PORT_TABLE_HEAD.finditer(body))
    groups: list[dict] = []
    for i, h in enumerate(heads):
        chunk = body[h.end(): heads[i + 1].start() if i + 1 < len(heads) else len(body)].strip()
        ports = []
        for e in _PORT_ENTRY.finditer(chunk):
            name, advice = e.group(2).strip(), e.group(3).strip()
            tail = re.search(r"\s*(\([A-Z .'-]+\))$", advice)     # "... III (COONDAPUR)": part of the port's name
            if tail:
                name, advice = f"{name} {tail.group(1)}", advice[: tail.start()].strip()
            ports.append({"name": name, "advice": advice})
        if ports:
            groups.append({"region": h.group(1).strip(), "ports": ports})

    table_text = " ".join(body[h.end(): heads[i + 1].start() if i + 1 < len(heads) else len(body)]
                          for i, h in enumerate(heads))
    parsed = bool(groups) and sum(len(g["ports"]) for g in groups) == len(_PORT_NUMBERED.findall(table_text))
    return {"text": body, "groups": groups if parsed else [], "parsed": parsed}


# ── INCOIS swell surge / high wave alerts ────────────────────────────────────

_ALERT_SPLIT = re.compile(r"(?=(?:Swell Surge|High Wave|Ocean Current) Alert for the coast of)", re.I)
_KEEP_CAPS = {"FH", "IST", "TN"}


def _strip_column_noise(s: str) -> str:
    """PDF table columns interleave ALL-CAPS labels ('SWELL SURGE ALERT',
    the district name) into the sentence — drop them, but keep genuine
    place abbreviations like 'FH' (fishing harbour)."""
    s = re.sub(r"\b[A-Z]{2,}\b", lambda m: m.group(0) if m.group(0) in _KEEP_CAPS else " ", s)
    s = re.sub(r"\s+", " ", s)
    # A label can also sit between the halves of a wrapped date ("20-" ALERT "09-2026").
    return re.sub(r"(\d)-\s+(\d)", r"\1-\2", s)


def extract_swell_alerts(text: str, now: datetime | None = None, drop_expired: bool = True) -> tuple[list[dict], int]:
    """Returns (alerts, unparsed_count). Alerts already past their end time
    are dropped; duplicates (IMD lists some districts twice) are merged."""
    flat = _flatten(text)
    now = now or datetime.now(timezone.utc)
    alerts, seen, unparsed = [], set(), 0

    for block in _ALERT_SPLIT.split(flat):
        head = re.match(r"(Swell Surge|High Wave|Ocean Current) Alert for the coast of\s+([A-Z][A-Za-z ,.&\-]*?)(?:\s+from\s+|\.\s)", block, re.I)
        if not head:
            continue
        kind = head[1].title()
        place = re.sub(r"\s+", " ", head[2]).strip(" ,.")
        rest = _strip_column_noise(block[head.end():])

        # "from Kappil To Pozhiyoor." is part of the head text after `from`.
        sm = re.search(r"\bfrom\s+(.+?)\.\s", _strip_column_noise(block), re.I)
        stretch = sm.group(1).strip() if sm else None

        period = re.search(r"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*sec", rest)
        height = re.search(r"with\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*m\s*height", rest)
        when = re.search(
            r"during\s*(\d{1,2}):(\d{2})\s*hours\s*on\s*(\d{2})-(\d{2})-\s*(\d{4})\s*to\s*(\d{1,2}):(\d{2})\s*hours\s*on\s*(\d{2})-(\d{2})-\s*(\d{4})",
            rest,
        )
        if not (period and height and when):
            unparsed += 1
            continue

        start = datetime(int(when[5]), int(when[4]), int(when[3]), int(when[1]), int(when[2]), tzinfo=IST)
        end = datetime(int(when[10]), int(when[9]), int(when[8]), int(when[6]), int(when[7]), tzinfo=IST)
        if drop_expired and end < now:
            continue
        key = (kind, place, start, end)
        if key in seen:
            continue
        seen.add(key)
        parts = [p.strip() for p in place.split(",") if p.strip()]
        alerts.append({
            "kind": kind,
            "place": place,
            "districts": [p for p in parts if not canonical_state(p)],
            "state": next((canonical_state(p) for p in parts if canonical_state(p)), None),
            "stretch": stretch,
            "period_s": [float(period[1]), float(period[2])],
            "height_m": [float(height[1]), float(height[2])],
            "from_utc": start.astimezone(timezone.utc).isoformat(),
            "until_utc": end.astimezone(timezone.utc).isoformat(),
        })
    return alerts, unparsed


# ── One call for everything ──────────────────────────────────────────────────

def extract_facts(text: str, now: datetime | None = None, drop_expired: bool = True) -> dict:
    issued = parse_issue_time(text)
    valid_until, assumed, note = parse_validity(text, issued)
    start_date = issued.date() if issued else None
    swell, unparsed = extract_swell_alerts(text, now, drop_expired)
    return {
        "issued_at_utc": issued.astimezone(timezone.utc).isoformat() if issued else None,
        "issued_at_ist": issued.isoformat() if issued else None,
        "valid_until_utc": valid_until.astimezone(timezone.utc).isoformat() if valid_until else None,
        "validity_assumed": assumed,
        "validity_note": note,
        "status": bulletin_status(issued, valid_until, now),
        "wind_statements": extract_wind_statements(text, start_date),
        "nil_coasts": extract_nil_coasts(text),
        "venture_advisory_text": extract_venture_advisory(text),
        "caution_advisory_text": extract_caution_advisory(text),
        "thunderstorm": extract_thunderstorm(text),
        "port_warning": extract_port_warning(text),
        "swell_alerts": swell,
        "unparsed_swell_alerts": unparsed,
    }
