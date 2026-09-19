"""
imd_cache.py — Backend integration layer for Phases 1-5's IMD scrapers.

Phase 6 of IMD_IMPLEMENTATION_PLAN.md ("Backend Integration": unified
scraper access, caching, scheduler, chat-agent integration), scoped to what
this project actually needs rather than the plan's literal suggestions:

- NO Redis/SQLite (plan's Task 6.1 suggestion). This project already has an
  established in-memory-cache-with-background-refresh pattern for exactly
  this kind of problem — see src/utils/data_freshness.py's Copernicus grid
  handling (unconditional refresh on startup, backgrounded so it never
  blocks server start, plus a periodic staleness-check loop). This module
  follows that same pattern for consistency rather than introducing a new
  datastore dependency for what's fundamentally the same shape of problem.
  A single-process in-memory dict is also simply adequate here — nothing
  requires this cache to survive a restart or be shared across processes.

- NO APScheduler (plan's Task 6.2 suggestion). Same reasoning: this
  project's existing periodic-loop pattern (asyncio.create_task + a
  while-True sleep loop, started/cancelled from FastAPI's lifespan) already
  does what APScheduler would, without adding a scheduling library this
  codebase doesn't otherwise use.

- Only the four LIVE-FEED scrapers are cached/scheduled here (fisherman
  warnings, sea area bulletins, cyclone warnings, port warnings). Phase 4's
  sea area ARCHIVE scraper is a browse-historical-data feature, not a live
  feed that needs periodic refreshing — it stays scrape-on-request via its
  own endpoint, matching how the plan's own Task 6.2 scheduler section only
  lists the four live sources, not the archive.

Refresh intervals (TTL) are set independently per source based on how often
each phase's own docstring/testing showed the underlying data actually
changes, not the plan's blanket suggestion: fisherman warnings (Phase 1)
are dated per-issue and typically updated a few times a day -> 3h. Sea area
bulletins (Phase 2) explicitly state their own 12h validity window -> 6h
(refresh partway through validity, not right at expiry). Cyclone/fishermen
archive (Phase 3) is the most safety-critical/fastest-changing during an
active event -> 1h. Port warnings (Phase 5) mirror Phase 3's cadence -> 3h,
matching the plan.
"""
import asyncio
from datetime import datetime, timezone
from typing import Callable, Awaitable

from src.services.imd_fisherman_scraper import scrape_fisherman_warnings
from src.services.imd_sea_area_scraper import scrape_sea_area_bulletins
from src.services.imd_cyclone_warning_scraper import scrape_cyclone_warnings
from src.services.imd_port_warning_scraper import scrape_port_warnings


class _CacheEntry:
    __slots__ = ("fetch", "ttl_hours", "data", "cached_at", "error", "last_attempt", "task")

    def __init__(self, fetch: Callable[[], Awaitable[dict]], ttl_hours: float):
        self.fetch = fetch
        self.ttl_hours = ttl_hours
        self.data: dict | None = None
        self.cached_at: datetime | None = None
        self.error: str | None = None
        self.last_attempt: datetime | None = None
        self.task: asyncio.Task | None = None   # the ONE in-flight refresh, shared by every caller


_CACHE: dict[str, _CacheEntry] = {
    # 1h: regional offices publish once or twice a day (0530-0600 IST is the main
    # issue) — a 3h TTL could hold a superseded bulletin for most of a morning.
    "fisherman_warnings": _CacheEntry(scrape_fisherman_warnings, ttl_hours=1.0),
    # 2h: this page carries the storm (TTT) warning and is re-issued every 12h — a new
    # warning must not wait up to 6h to show.
    "sea_area_bulletins": _CacheEntry(scrape_sea_area_bulletins, ttl_hours=2.0),
    "cyclone_warnings": _CacheEntry(lambda: scrape_cyclone_warnings(), ttl_hours=1.0),
    "port_warnings": _CacheEntry(lambda: scrape_port_warnings(), ttl_hours=3.0),
}

# How often the background loop re-checks staleness (5 min, so a request almost never
# has to wait for a scrape itself; see get_fresh) — same reasoning as
# data_freshness.py: much shorter than the shortest TTL above (1h) so
# nothing waits a full hour past going stale before being caught.
CHECK_INTERVAL_SECONDS = 5 * 60


def _age_hours(entry: _CacheEntry) -> float | None:
    if entry.cached_at is None:
        return None
    return (datetime.now(timezone.utc) - entry.cached_at).total_seconds() / 3600.0


def is_stale(name: str) -> bool:
    entry = _CACHE[name]
    age = _age_hours(entry)
    return age is None or age > entry.ttl_hours


async def _do_refresh(name: str) -> bool:
    entry = _CACHE[name]
    entry.last_attempt = datetime.now(timezone.utc)
    try:
        entry.data = await entry.fetch()
        entry.cached_at = datetime.now(timezone.utc)
        entry.error = None
        return True
    except Exception as e:
        entry.error = f"{type(e).__name__}: {e}"
        print(f"[imd_cache] Refresh of '{name}' failed: {entry.error}")
        return False


_BACKGROUND_TASKS: set = set()


def _start_refresh(name: str) -> asyncio.Task:
    """Starts a refresh, or joins the one already running. Concurrent callers
    (startup, the periodic loop, several /alerts requests at once) share ONE
    scrape instead of each hammering IMD."""
    entry = _CACHE[name]
    if entry.task is not None and not entry.task.done():
        return entry.task
    task = asyncio.get_running_loop().create_task(_do_refresh(name))
    entry.task = task
    _BACKGROUND_TASKS.add(task)                 # keep a reference so it can't be GC'd mid-flight
    task.add_done_callback(_BACKGROUND_TASKS.discard)
    return task


async def refresh(name: str) -> bool:
    """Unconditional refresh of one source (joins an in-flight one). Returns True
    on success. A failure keeps the previous cached data in place (with `error`
    recorded) rather than wiping it out — a transient IMD outage shouldn't turn
    "slightly stale but real" data into "nothing at all". Shielded: a cancelled
    caller doesn't kill the scrape other callers are waiting on."""
    return await asyncio.shield(_start_refresh(name))


async def refresh_all_now() -> None:
    """Unconditional refresh of every cached source, in parallel. Used on
    backend startup — backgrounded by the caller (see main.py's lifespan)
    so it never delays the server becoming ready, matching data_freshness.py's
    Copernicus-grid startup pattern."""
    print("[imd_cache] Refreshing all IMD sources (startup)...")
    results = await asyncio.gather(*(refresh(name) for name in _CACHE), return_exceptions=True)
    for name, ok in zip(_CACHE, results):
        status = "ok" if ok is True else "failed"
        print(f"[imd_cache]   {name}: {status}")


async def refresh_all_if_stale() -> None:
    for name in _CACHE:
        if is_stale(name):
            await refresh(name)


async def start_periodic_imd_refresh_loop(check_interval_seconds: int = CHECK_INTERVAL_SECONDS) -> None:
    """Runs forever as a background asyncio task — start once from the
    FastAPI lifespan, cancel on shutdown. Mirrors
    data_freshness.start_periodic_freshness_loop exactly."""
    while True:
        try:
            await asyncio.sleep(check_interval_seconds)
            await refresh_all_if_stale()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"[imd_cache] Periodic refresh check failed: {e}")


async def get_cached(name: str, refresh_if_missing: bool = True) -> dict | None:
    """Returns the cached data for one source, refreshing synchronously
    first if nothing has ever been cached yet (cold start, e.g. a request
    landing before the startup refresh finished) and `refresh_if_missing`.
    Stale data is returned immediately while a background refresh starts.
    Returns None if there's still nothing — callers (e.g. the chat agent)
    must treat that as "IMD data unavailable right now", never fabricate a
    substitute. Request paths that must show CURRENT data (GET /alerts,
    /news/feed) use get_fresh() instead."""
    entry = _CACHE[name]
    if entry.data is None and refresh_if_missing:
        await refresh(name)
    elif entry.data is None or is_stale(name):
        _revalidate_in_background(name)
    return entry.data


# A failing source must not be hammered on every request while stale.
_MIN_RETRY_SECONDS = 5 * 60
FRESH_WAIT_SECONDS = 20


def _recently_failed(entry: _CacheEntry) -> bool:
    return bool(entry.error and entry.last_attempt
                and (datetime.now(timezone.utc) - entry.last_attempt).total_seconds() < _MIN_RETRY_SECONDS)


def _revalidate_in_background(name: str) -> None:
    """Stale-while-revalidate for callers that can't wait: serve what we have,
    start one background refresh so the NEXT request is fresh."""
    entry = _CACHE[name]
    if _recently_failed(entry):
        return
    if entry.last_attempt and not entry.error and (datetime.now(timezone.utc) - entry.last_attempt).total_seconds() < _MIN_RETRY_SECONDS:
        return
    try:
        _start_refresh(name)
    except RuntimeError:
        pass   # no running loop (e.g. a sync test) — nothing to schedule


async def get_fresh(name: str, timeout: float = FRESH_WAIT_SECONDS) -> dict | None:
    """Data for a request that must not show stale IMD content: if the cache is
    older than its TTL, WAIT (up to `timeout`s) for a fresh scrape before
    answering. If IMD can't be reached in time, or failed within the last few
    minutes, the previous data is returned and `cache_status()` says it is
    stale + why — the caller must surface that, never present it as current.
    The scrape keeps running after a timeout so the next request benefits."""
    entry = _CACHE[name]
    if entry.data is not None and not is_stale(name):
        return entry.data
    if not _recently_failed(entry):
        try:
            await asyncio.wait_for(asyncio.shield(_start_refresh(name)), timeout)
        except asyncio.TimeoutError:
            print(f"[imd_cache] '{name}' refresh still running after {timeout}s — answering with previous data")
    return entry.data


def cache_status() -> dict:
    """Per-source cache metadata (age, staleness, last error) — used by the
    unified /alerts/imd/all endpoint's cache_age_minutes/next_refresh
    fields (plan's "Expected Output at End" section) and useful for
    debugging without re-triggering a scrape."""
    status = {}
    for name, entry in _CACHE.items():
        age = _age_hours(entry)
        status[name] = {
            "cached": entry.data is not None,
            "cached_at": entry.cached_at.isoformat() if entry.cached_at else None,
            "age_minutes": round(age * 60, 1) if age is not None else None,
            "ttl_hours": entry.ttl_hours,
            "stale": is_stale(name),
            "last_error": entry.error,
        }
    return status


async def get_all() -> dict:
    """Combined snapshot of every cached live-feed source, matching the
    plan's unified /alerts/imd/all shape. Triggers a refresh for any source
    that's never been cached yet (cold start); does NOT force-refresh
    merely-stale data on the request path — that's the background loop's
    job, so this endpoint stays fast."""
    results = {}
    for name in _CACHE:
        results[name] = await get_cached(name)
    return {
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "fisherman_warnings": results["fisherman_warnings"],
        "sea_area_bulletins": results["sea_area_bulletins"],
        "cyclone_warnings": results["cyclone_warnings"],
        "port_warnings": results["port_warnings"],
        "cache_status": cache_status(),
    }
