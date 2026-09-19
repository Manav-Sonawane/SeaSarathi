"""
Tests for src/services/translation_service.py — Sarvam is mocked; no network.
The property that matters: translation can only ever ADD text. Any failure
must return None so callers keep the original English safety wording.
"""
import asyncio
import time
import unittest
from unittest import mock

from src.services import translation_service as ts


def run(coro):
    return asyncio.run(coro)


class TranslationServiceTests(unittest.TestCase):
    def setUp(self):
        ts._CACHE.clear()
        ts._down_until = 0.0

    def test_english_and_unknown_languages_are_not_translated(self):
        with mock.patch.object(ts, "sarvam_translate") as fake:
            self.assertEqual(run(ts.translate_many(["hello"], "en")), [None])
            self.assertEqual(run(ts.translate_many(["hello"], "xx")), [None])
            fake.assert_not_called()

    def test_translates_dedupes_and_caches(self):
        with mock.patch.object(ts, "sarvam_translate", side_effect=lambda text, lang: f"{lang}:{text}") as fake:
            out = run(ts.translate_many(["a", "b", "a", ""], "hi"))
            self.assertEqual(out, ["hi:a", "hi:b", "hi:a", None])
            self.assertEqual(fake.call_count, 2)          # "a" sent once, empty string never
            run(ts.translate_many(["a", "b"], "hi"))
            self.assertEqual(fake.call_count, 2)          # second request served from cache

    def test_failure_returns_none_and_backs_off(self):
        with mock.patch.object(ts, "sarvam_translate", side_effect=RuntimeError("boom")) as fake:
            self.assertEqual(run(ts.translate_many(["a"], "hi")), [None])
            self.assertEqual(fake.call_count, 1)
            # Cooldown: a different text isn't even attempted while Sarvam is marked down.
            self.assertEqual(run(ts.translate_many(["b"], "hi")), [None])
            self.assertEqual(fake.call_count, 1)

    def test_slow_translation_falls_back_then_lands_in_cache(self):
        def slow(text, lang):
            time.sleep(0.4)
            return f"{lang}:{text}"

        async def scenario():
            with mock.patch.object(ts, "_CALL_TIMEOUT_S", 0.1), mock.patch.object(ts, "sarvam_translate", side_effect=slow):
                first = await ts.translate_many(["a"], "hi")
                await asyncio.sleep(0.6)                   # background call finishes
                second = await ts.translate_many(["a"], "hi")
            return first, second

        first, second = run(scenario())
        self.assertEqual(first, [None])                    # timed out -> caller keeps English
        self.assertEqual(second, ["hi:a"])                 # ...but the result was cached for next time


if __name__ == "__main__":
    unittest.main()
