"""
time_window.py — understands WHEN a fisherman is asking about.

"Is it safe tomorrow morning?" used to be answered from the same fixed
next-12-hours forecast as any other question. This finds the time they named
("today evening", "tomorrow morning", "tonight", "day after tomorrow", "next 24
hours") so the data agent can read the forecast for that period. Times are
Indian Standard Time — the fishermen's day.

A query that names no time returns None and the caller keeps its existing
behaviour, so nothing changes for questions that never asked about a time.
Recognised in English and the app's other 9 languages (Hindi, Marathi, Tamil,
Telugu, Malayalam, Bengali, Gujarati, Odia, Kannada) for the common words:
tomorrow / day after tomorrow, morning / afternoon / evening / night.
"""
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))

# (start hour, length in hours) in IST. Night runs 21:00 -> 05:00 next day.
_PERIODS = {"morning": (5, 7), "afternoon": (12, 5), "evening": (17, 4), "night": (21, 8)}
_DAY_NAMES = {0: "today", 1: "tomorrow", 2: "day after tomorrow"}

# Latin-script phrases (regex, matched on the lower-cased query).
_RE_DAY_AFTER = re.compile(r"day after tomorrow|\bparso\b|\bparson\b")
_RE_TOMORROW = re.compile(r"\b(tomorrow|tomorow|tmrw|tmr|kal)\b")
_RE_TODAY = re.compile(r"\b(today|aaj)\b")
_RE_TONIGHT = re.compile(r"\btonight\b|\baaj raat\b")
_RE_NEXT_24H = re.compile(r"\b(next|coming|following)?\s*24\s*(h|hr|hrs|hour|hours)\b")
_RE_PERIOD = {
    "morning": re.compile(r"\bmorning\b|\bsubah\b|\bsavere\b"),
    "afternoon": re.compile(r"\bafternoon\b|\bdopahar\b"),
    "evening": re.compile(r"\bevening\b|\bshaam\b"),
    "night": re.compile(r"\bnight\b|\braat\b"),
}

# Indic-script words, matched as whole tokens (a bare substring like "कल" would
# also hit unrelated longer words).
_TOK_TOMORROW = {"कल", "उद्या", "நாளை", "రేపు", "നാളെ", "কাল", "আগামীকাল", "કાલે", "କାଲି", "ଆସନ୍ତାକାଲି", "ನಾಳೆ"}
_TOK_DAY_AFTER = {"परसों", "परसो", "परवा"}
_TOK_PERIOD = {
    "morning": {"सुबह", "सवेरे", "सकाळी", "सकाळ", "காலை", "ఉదయం", "രാവിലെ", "সকাল", "সকালে", "સવારે", "સવાર", "ସକାଳ", "ସକାଳେ", "ಬೆಳಿಗ್ಗೆ", "ಬೆಳಗ್ಗೆ"},
    "afternoon": {"दोपहर", "दुपारी", "மதியம்", "మధ్యాహ్నం", "ഉച്ചയ്ക്ക്", "দুপুর", "দুপুরে", "બપોરે", "બપોર", "ಮಧ್ಯಾಹ್ನ"},
    "evening": {"शाम", "संध्याकाळी", "மாலை", "సాయంత్రం", "വൈകുന്നേരം", "সন্ধ্যা", "সন্ধ্যায়", "સાંજે", "સાંજ", "ସନ୍ଧ୍ୟା", "ಸಂಜೆ"},
    "night": {"रात", "रात्री", "இரவு", "రాత్రి", "രാത്രി", "রাত", "রাতে", "રાત", "રાત્રે", "ରାତି", "ರಾತ್ರಿ"},
}
_TOKEN_SPLIT = re.compile(r"[\s,.;:!?()\[\]\"'।]+")


@dataclass(frozen=True)
class TimeWindow:
    start: datetime      # timezone-aware, UTC
    end: datetime        # timezone-aware, UTC (exclusive)
    label: str           # e.g. "tomorrow morning (05:00-12:00 IST)" — for prompts/logs


def _label(day_offset: int, period: str | None, start_ist: datetime, end_ist: datetime) -> str:
    if period is None:
        return f"{_DAY_NAMES[day_offset]} (full day, IST)"
    name = "tonight" if (period == "night" and day_offset == 0) else f"{_DAY_NAMES[day_offset]} {period}"
    return f"{name} ({start_ist:%H:%M}-{end_ist:%H:%M} IST)"


def _make(now_ist: datetime, day_offset: int, period: str | None) -> tuple[datetime, datetime, str]:
    day_start = (now_ist + timedelta(days=day_offset)).replace(hour=0, minute=0, second=0, microsecond=0)
    if period is None:
        start, end = day_start, day_start + timedelta(days=1)
    else:
        first_hour, length = _PERIODS[period]
        start = day_start + timedelta(hours=first_hour)
        end = start + timedelta(hours=length)
    return start, end, _label(day_offset, period, start, end)


def parse_time_window(query: str, now: datetime | None = None) -> TimeWindow | None:
    """The period the query names, or None if it names none (or names one that is
    already over). `now` is for tests; defaults to the current time."""
    now_ist = (now or datetime.now(timezone.utc)).astimezone(IST)
    q = (query or "").lower()
    tokens = {t for t in _TOKEN_SPLIT.split(q) if t}

    period = next(
        (p for p in _PERIODS if _RE_PERIOD[p].search(q) or tokens & _TOK_PERIOD[p]),
        None,
    )
    if _RE_DAY_AFTER.search(q) or tokens & _TOK_DAY_AFTER:
        offset: int | None = 2
    elif _RE_TOMORROW.search(q) or tokens & _TOK_TOMORROW:
        offset = 1
    elif _RE_TONIGHT.search(q):
        offset, period = 0, "night"
    elif _RE_TODAY.search(q):
        offset = 0
    else:
        offset = None

    if offset is None and period is None:
        if _RE_NEXT_24H.search(q):
            start = now_ist.replace(minute=0, second=0, microsecond=0)
            return TimeWindow(start.astimezone(timezone.utc), (start + timedelta(hours=24)).astimezone(timezone.utc),
                              "next 24 hours")
        return None

    if offset is None:
        # Only a time of day ("in the evening?"): the next one that hasn't ended yet.
        for off in (0, 1):
            start, end, label = _make(now_ist, off, period)
            if end > now_ist:
                break
    else:
        start, end, label = _make(now_ist, offset, period)

    if end <= now_ist:
        return None     # e.g. "this morning" asked in the afternoon — nothing left to forecast
    start = max(start, now_ist.replace(minute=0, second=0, microsecond=0))   # never include hours already past
    return TimeWindow(start.astimezone(timezone.utc), end.astimezone(timezone.utc), label)


def select_window(df, now_utc, window: TimeWindow | None):
    """Rows of an hourly forecast DataFrame (column "date", UTC) for `window`.
    Returns (rows, covered). Without a window, or when the forecast doesn't reach
    it, the usual next-12-hours rows are returned and covered is False for a
    named window — so the caller can say the forecast doesn't extend that far
    instead of silently answering about a different period."""
    import pandas as pd
    if window is not None:
        rows = df[(df["date"] >= window.start) & (df["date"] < window.end)]
        if not rows.empty:
            return rows, True
    rows = df[df["date"] <= now_utc + pd.Timedelta(hours=12)]
    if rows.empty:
        rows = df.head(12)
    return rows, window is None
