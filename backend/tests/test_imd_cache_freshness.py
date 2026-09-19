"""
Freshness guarantees of the IMD cache (src/services/imd_cache.py), using fake
scrapers so no network is involved.

Reported 2026-09-19: the Alerts screen could show IMD data days old. These pin
the rules that prevent it: a request that finds stale data WAITS for a fresh
scrape; concurrent requests share ONE scrape; when IMD can't be reached the
previous data is returned but flagged stale with the error (never passed off as
current); and a failing source isn't hammered on every request.
"""
import asyncio
import unittest
from datetime import datetime, timedelta, timezone

from src.services import imd_cache as C

NAME = "fisherman_warnings"


class _Fake:
    def __init__(self, fail=False, delay=0.0):
        self.calls, self.fail, self.delay = 0, fail, delay

    async def __call__(self):
        self.calls += 1
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.fail:
            raise RuntimeError("IMD unreachable")
        return {"version": self.calls}


class FreshnessTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.entry = C._CACHE[NAME]
        self._saved = (self.entry.fetch, self.entry.data, self.entry.cached_at, self.entry.error,
                       self.entry.last_attempt, self.entry.task)
        self.entry.data, self.entry.cached_at, self.entry.error = {"version": 0}, None, None
        self.entry.last_attempt, self.entry.task = None, None

    def tearDown(self):
        (self.entry.fetch, self.entry.data, self.entry.cached_at, self.entry.error,
         self.entry.last_attempt, self.entry.task) = self._saved

    def _age(self, hours):
        self.entry.cached_at = datetime.now(timezone.utc) - timedelta(hours=hours)

    async def test_fresh_cache_is_served_without_scraping(self):
        self.entry.fetch = fake = _Fake()
        self._age(0.2)
        data = await C.get_fresh(NAME)
        self.assertEqual(data, {"version": 0})
        self.assertEqual(fake.calls, 0)

    async def test_stale_cache_waits_for_a_fresh_scrape(self):
        self.entry.fetch = fake = _Fake()
        self._age(5)                                    # 5 h old, TTL is 1 h
        data = await C.get_fresh(NAME)
        self.assertEqual(data, {"version": 1}, "must answer with the NEW scrape, not the 5 h old data")
        self.assertEqual(fake.calls, 1)
        self.assertFalse(C.is_stale(NAME))

    async def test_never_cached_is_scraped(self):
        self.entry.fetch = fake = _Fake()
        self.entry.data = None
        self.assertEqual(await C.get_fresh(NAME), {"version": 1})

    async def test_concurrent_requests_share_one_scrape(self):
        self.entry.fetch = fake = _Fake(delay=0.2)
        self._age(5)
        results = await asyncio.gather(*(C.get_fresh(NAME) for _ in range(6)))
        self.assertEqual(fake.calls, 1)
        self.assertTrue(all(r == {"version": 1} for r in results))

    async def test_unreachable_imd_returns_old_data_flagged_stale_with_reason(self):
        self.entry.fetch = _Fake(fail=True)
        self._age(5)
        data = await C.get_fresh(NAME)
        self.assertEqual(data, {"version": 0})          # previous data kept, not wiped
        st = C.cache_status()[NAME]
        self.assertTrue(st["stale"])
        self.assertIn("IMD unreachable", st["last_error"])
        self.assertGreaterEqual(st["age_minutes"], 299)

    async def test_failing_source_is_not_hammered_by_every_request(self):
        self.entry.fetch = fake = _Fake(fail=True)
        self._age(5)
        for _ in range(5):
            await C.get_fresh(NAME)
        self.assertEqual(fake.calls, 1, "after one failure, don't re-scrape for a few minutes")

    async def test_slow_scrape_times_out_but_keeps_running_for_next_request(self):
        self.entry.fetch = fake = _Fake(delay=0.4)
        self._age(5)
        first = await C.get_fresh(NAME, timeout=0.05)
        self.assertEqual(first, {"version": 0})          # answered with previous data, quickly
        await asyncio.sleep(0.6)                         # scrape finishes in the background
        self.assertEqual(await C.get_fresh(NAME), {"version": 1})
        self.assertEqual(fake.calls, 1)

    async def test_recovery_after_failure_window(self):
        self.entry.fetch = fake = _Fake(fail=True)
        self._age(5)
        await C.get_fresh(NAME)
        fake.fail = False
        self.entry.last_attempt = datetime.now(timezone.utc) - timedelta(minutes=10)   # retry window passed
        self.assertEqual(await C.get_fresh(NAME), {"version": 2})
        self.assertIsNone(C.cache_status()[NAME]["last_error"])


if __name__ == "__main__":
    unittest.main()
