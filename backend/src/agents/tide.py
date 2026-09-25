"""
tide.py — tide information from the hourly sea-level forecast we already fetch.

Open-Meteo's marine API (the same call that supplies wave height) returns
`sea_level_height_msl`: hourly sea level relative to mean sea level, including
the tide. From it: the level now, whether the water is rising or falling, and
the next highs and lows. It is a global-model estimate at roughly 8 km and
1-hour resolution — good for "is the tide coming in?" and "when is low tide?",
NOT a substitute for official tide tables, and the answer says so.
"""
from datetime import timedelta

from src.agents.time_window import IST

SEA_LEVEL_COLUMN = "sea_level_height_msl"
MAX_EVENTS = 6                 # highs/lows reported
LOOKAHEAD_HOURS = 48
SLACK_M_PER_HOUR = 0.02        # below this hourly change the water is called "slack"

# Words meaning "tide" — English, Hinglish and the app's other 9 languages.
_TIDE_WORDS = (
    "tide", "tidal", "high tide", "low tide", "ebb",
    "ज्वार", "भाटा", "भरती", "ओहोटी",                     # Hindi, Marathi
    "ஓதம்", "அலை ஏற்றம்",                                # Tamil
    "పోటు", "ఆటుపోట్లు",                                  # Telugu
    "വേലിയേറ്റം", "വേലിയിറക്കം",                          # Malayalam
    "জোয়ার", "ভাটা",                                       # Bengali
    "ભરતી", "ઓટ",                                          # Gujarati
    "ଜୁଆର", "ଭଟା",                                         # Odia
    "ಉಬ್ಬರ", "ಇಳಿತ",                                       # Kannada
)


def mentions_tide(query: str) -> bool:
    q = (query or "").lower()
    return any(w in q for w in _TIDE_WORDS)


def _when(ts_utc, now_utc) -> str:
    """'today 14:00 IST' / 'tomorrow 02:00 IST' / '23 Sep 02:00 IST'."""
    t = ts_utc.astimezone(IST)
    days = (t.date() - now_utc.astimezone(IST).date()).days
    day = "today" if days == 0 else "tomorrow" if days == 1 else f"{t.day} {t:%b}"
    return f"{day} {t:%H:%M} IST"


def summarize_tide(df, now_utc) -> dict | None:
    """Tide summary from an hourly marine DataFrame (columns: date [UTC], sea level),
    or None if the frame has no usable sea-level data (e.g. a cached forecast from
    before the column was requested).

    {"current_m", "trend": rising|falling|slack, "events": [{"type": high|low, "time_utc",
     "time_text", "height_m"}, ...], "range_m", "note"}"""
    if df is None or getattr(df, "empty", True) or SEA_LEVEL_COLUMN not in df.columns:
        return None
    s = df[["date", SEA_LEVEL_COLUMN]].dropna().sort_values("date")
    hour = now_utc.replace(minute=0, second=0, microsecond=0)
    s = s[(s["date"] >= hour) & (s["date"] <= hour + timedelta(hours=LOOKAHEAD_HOURS))].reset_index(drop=True)
    if len(s) < 3:
        return None

    levels = s[SEA_LEVEL_COLUMN].astype(float).tolist()
    times = list(s["date"])
    current = levels[0]
    delta = levels[1] - levels[0]
    trend = "slack" if abs(delta) < SLACK_M_PER_HOUR else "rising" if delta > 0 else "falling"

    events = []
    for i in range(1, len(levels) - 1):
        before, here, after = levels[i - 1], levels[i], levels[i + 1]
        kind = "high" if before < here >= after else "low" if before > here <= after else None
        # A flat top/bottom spanning two hours would be counted twice; keep the first.
        if kind and not (events and events[-1]["type"] == kind and (times[i] - events[-1]["_t"]) <= timedelta(hours=1)):
            events.append({"type": kind, "_t": times[i], "time_utc": times[i].isoformat(),
                           "time_text": _when(times[i], now_utc), "height_m": round(here, 2)})
    for e in events:
        del e["_t"]

    return {
        "current_m": round(current, 2),
        "trend": trend,
        "events": events[:MAX_EVENTS],
        "range_m": round(max(levels) - min(levels), 2),
        "note": "Model estimate (about 8 km, hourly) relative to mean sea level; not an official tide table.",
    }


def tide_prompt_text(tide: dict | None) -> str:
    """The tide block for the answer prompt."""
    if not tide:
        return "Tide: data not available right now — say you cannot give tide information; do not guess."
    events = tide["events"]
    listed = "; ".join(f"{i}) {e['type'].upper()} tide, {e['height_m']:+.2f} m, {e['time_text']}" for i, e in enumerate(events, 1))
    nxt = (f"The NEXT tide event is a {events[0]['type'].upper()} tide at {events[0]['time_text']} "
           f"({events[0]['height_m']:+.2f} m). " if events else "There is no clear high or low in the next 48 hours. ")
    return (f"Tide (model estimate, relative to mean sea level): the water is now {tide['current_m']:+.2f} m and {tide['trend']}. "
            f"{nxt}Upcoming events in chronological order: {listed or 'none'}. Answer a tide question with the earliest "
            f"matching event first (a high tide means the water is at its highest, a low tide at its lowest). "
            f"{tide['note']}")


def tide_fallback(tide: dict | None) -> str:
    """Plain English tide sentence for when the LLM is unavailable."""
    if not tide:
        return "Tide information is not available right now."
    ev = ", ".join(f"{e['type']} {e['height_m']:+.2f} m {e['time_text']}" for e in tide["events"][:3])
    return f"Tide (model estimate): now {tide['current_m']:+.2f} m and {tide['trend']}." + (f" Next: {ev}." if ev else "")
