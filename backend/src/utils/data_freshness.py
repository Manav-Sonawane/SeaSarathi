"""
data_freshness.py — Keeps the precomputed Copernicus SST/Chlorophyll grid
(data/dynamic/sst_chl_grid.json, built by scripts/fetch_copernicus_grid.py)
from silently going stale on a long-running server.

Two distinct behaviors, both requested explicitly:
  1. A reusable staleness check: has the grid gone stale (default: older than
     6 hours, or missing entirely)? Used by the periodic background loop and
     exposed via GET /data/freshness for visibility.
  2. An unconditional fetch on every backend startup — regardless of how
     fresh the existing grid already is — wired into main.py's lifespan.

Why background, never blocking a request or startup: the actual Copernicus
fetch takes ~90 seconds (two live dataset opens + a vectorized nearest-
neighbor selection over ~30k EEZ grid points — see fetch_copernicus_grid.py).
Blocking server startup on that every restart would make local dev painful,
and blocking a request on it would blow way past this project's <3s /chat
target. Every function here that hits the network runs off the request path.
"""

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Optional

GRID_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "data", "dynamic", "sst_chl_grid.json"
)

DEFAULT_MAX_AGE_HOURS = 6.0
# How often the background loop re-checks staleness. Deliberately much
# shorter than the staleness threshold itself (this is a cheap local file
# read) so a grid that goes stale mid-window is caught promptly rather than
# waiting for the next 6-hour boundary.
CHECK_INTERVAL_SECONDS = 30 * 60  # 30 minutes


def get_grid_age_hours() -> Optional[float]:
    """Returns the grid's age in hours, or None if it doesn't exist / can't be read."""
    path = os.path.abspath(GRID_PATH)
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        generated_at = data.get("generated_at")
        if not generated_at:
            return None
        generated_ts = datetime.fromisoformat(generated_at)
        if generated_ts.tzinfo is None:
            generated_ts = generated_ts.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - generated_ts
        return age.total_seconds() / 3600.0
    except Exception as e:
        print(f"[data_freshness] Could not read grid age: {e}")
        return None


def is_grid_stale(max_age_hours: float = DEFAULT_MAX_AGE_HOURS) -> bool:
    """True if the grid is missing, unreadable, or older than max_age_hours."""
    age = get_grid_age_hours()
    return age is None or age > max_age_hours


def _refresh_grid_blocking() -> bool:
    """
    The actual (slow, network-bound) Copernicus fetch. Only ever call this
    from a background thread/task (asyncio.to_thread) — never inline on a
    request handler or directly in an async function's main flow.
    """
    try:
        from scripts.fetch_copernicus_grid import main as fetch_grid_main
        fetch_grid_main()

        # The running process's copernicus_service module cached the OLD grid
        # file in memory (lru_cache) — drop that cache so the next lookup
        # picks up what we just wrote, instead of serving stale data from
        # memory until the process restarts.
        from src.services.copernicus_service import _load_grid
        _load_grid.cache_clear()

        return True
    except Exception as e:
        print(f"[data_freshness] Grid refresh failed: {e}")
        return False


async def refresh_grid_now() -> bool:
    """
    Unconditional refresh — used on every backend startup regardless of the
    existing grid's age. Runs the blocking fetch in a worker thread so it
    never blocks the event loop (or, if awaited during startup, never blocks
    other startup work happening concurrently).
    """
    print("[data_freshness] Fetching current Copernicus SST/Chlorophyll grid (startup)...")
    ok = await asyncio.to_thread(_refresh_grid_blocking)
    print(f"[data_freshness] Startup grid fetch {'succeeded' if ok else 'failed — keeping existing cached grid, if any'}.")
    return ok


async def refresh_grid_if_stale(max_age_hours: float = DEFAULT_MAX_AGE_HOURS) -> dict:
    """Checks staleness; only hits the network if actually stale or missing."""
    age = get_grid_age_hours()
    if age is not None and age <= max_age_hours:
        return {"refreshed": False, "age_hours": round(age, 2)}

    print(f"[data_freshness] Grid is {'missing' if age is None else f'{age:.1f}h old'} "
          f"(threshold {max_age_hours}h) — refreshing.")
    ok = await asyncio.to_thread(_refresh_grid_blocking)
    return {"refreshed": ok, "age_hours": 0.0 if ok else age}


async def start_periodic_freshness_loop(
    max_age_hours: float = DEFAULT_MAX_AGE_HOURS,
    check_interval_seconds: int = CHECK_INTERVAL_SECONDS,
) -> None:
    """
    Runs forever as a background asyncio task — start it once from the
    FastAPI lifespan startup and cancel it on shutdown. Cheap on every tick
    (one local file read); only triggers a live fetch when the grid has
    actually crossed max_age_hours.
    """
    while True:
        try:
            await asyncio.sleep(check_interval_seconds)
            await refresh_grid_if_stale(max_age_hours)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"[data_freshness] Periodic freshness check failed: {e}")
