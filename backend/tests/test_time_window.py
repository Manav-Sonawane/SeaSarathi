"""
Tests for time-aware questions ("is it safe tomorrow morning?") — src/agents/time_window.py
and its use in the response fallback. No network; Sarvam is mocked.
"""
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

import pandas as pd

from src.agents import response
from src.agents.time_window import IST, parse_time_window, select_window


def at(hour, minute=0, day=21):
    """A 'now' on 2026-09-<day> at hour:minute IST."""
    return datetime(2026, 9, day, hour, minute, tzinfo=IST)


def ist(w):
    return w.start.astimezone(IST), w.end.astimezone(IST)


class ParseTests(unittest.TestCase):
    def test_tomorrow_morning(self):
        w = parse_time_window("Is it safe to go out tomorrow morning?", at(10))
        s, e = ist(w)
        self.assertEqual((s.day, s.hour, e.day, e.hour), (22, 5, 22, 12))
        self.assertIn("tomorrow morning", w.label)

    def test_tonight_runs_past_midnight(self):
        s, e = ist(parse_time_window("how is the sea tonight", at(10)))
        self.assertEqual((s.day, s.hour, e.day, e.hour), (21, 21, 22, 5))

    def test_today_evening(self):
        s, e = ist(parse_time_window("today evening ok?", at(10)))
        self.assertEqual((s.hour, e.hour), (17, 21))

    def test_window_never_includes_hours_already_past(self):
        s, _ = ist(parse_time_window("today evening", at(18, 30)))
        self.assertEqual((s.hour, s.minute), (18, 0))

    def test_time_of_day_alone_means_the_next_one(self):
        s, _ = ist(parse_time_window("what about the evening?", at(10)))
        self.assertEqual(s.day, 21)
        s, _ = ist(parse_time_window("what about the evening?", at(22)))
        self.assertEqual(s.day, 22)

    def test_a_period_that_is_already_over_is_ignored(self):
        self.assertIsNone(parse_time_window("today morning", at(15)))

    def test_day_after_tomorrow_is_the_full_day(self):
        s, e = ist(parse_time_window("day after tomorrow", at(10)))
        self.assertEqual((s.day, s.hour, e.day, e.hour), (23, 0, 24, 0))

    def test_next_24_hours(self):
        w = parse_time_window("weather for the next 24 hours", at(10, 20))
        self.assertEqual(w.end - w.start, timedelta(hours=24))
        self.assertEqual(w.label, "next 24 hours")

    def test_no_time_named_returns_none(self):
        for q in ("is it safe?", "where is the nearest fishing zone", "any cyclone warning", ""):
            self.assertIsNone(parse_time_window(q, at(10)), q)

    def test_other_languages(self):
        cases = {
            "कल सुबह समुद्र सुरक्षित है?": "tomorrow morning",        # Hindi
            "उद्या सकाळी मासेमारी?": "tomorrow morning",              # Marathi
            "நாளை காலை கடலுக்கு போகலாமா": "tomorrow morning",         # Tamil
            "రేపు ఉదయం వెళ్లవచ్చా": "tomorrow morning",               # Telugu
            "നാളെ രാവിലെ പോകാമോ": "tomorrow morning",                # Malayalam
            "ನಾಳೆ ಬೆಳಿಗ್ಗೆ ಸುರಕ್ಷಿತವೇ": "tomorrow morning",           # Kannada
            "કાલે સવારે દરિયો કેવો છે": "tomorrow morning",           # Gujarati
            "कल शाम को": "tomorrow evening",                          # Hindi evening
        }
        for query, expected in cases.items():
            w = parse_time_window(query, at(10))
            self.assertIsNotNone(w, query)
            self.assertIn(expected, w.label, query)

    def test_indic_word_inside_a_longer_word_does_not_match(self):
        self.assertIsNone(parse_time_window("कलम कहाँ है", at(10)))   # "कल" is only a prefix here


class SelectWindowTests(unittest.TestCase):
    def frame(self, start_ist, hours=72):
        first = start_ist.astimezone(timezone.utc)
        return pd.DataFrame({"date": pd.date_range(first, periods=hours, freq="h"), "wind": range(hours)})

    def test_named_window_is_sliced(self):
        now = at(10)
        df = self.frame(at(0))                       # 3 days hourly from today 00:00 IST
        w = parse_time_window("tomorrow morning", now)
        rows, covered = select_window(df, pd.Timestamp(now.astimezone(timezone.utc)), w)
        self.assertTrue(covered)
        self.assertEqual(len(rows), 7)               # 05:00-12:00

    def test_window_beyond_the_forecast_is_reported_as_not_covered(self):
        now = at(10)
        df = self.frame(at(0), hours=24)             # only today
        w = parse_time_window("tomorrow morning", now)
        rows, covered = select_window(df, pd.Timestamp(now.astimezone(timezone.utc)), w)
        self.assertFalse(covered)
        self.assertFalse(rows.empty)                 # falls back to the usual next-12-hours rows

    def test_no_window_keeps_the_old_next_12_hours_behaviour(self):
        now = at(10)
        df = self.frame(at(0))
        rows, covered = select_window(df, pd.Timestamp(now.astimezone(timezone.utc)), None)
        self.assertTrue(covered)
        expected = df[df["date"] <= pd.Timestamp(now.astimezone(timezone.utc)) + pd.Timedelta(hours=12)]
        self.assertEqual(len(rows), len(expected))


class FallbackTests(unittest.TestCase):
    def state(self, fw):
        return {"query": "is it safe tomorrow morning?", "risk_level": "MODERATE", "wind_speed_10m": 34.0,
                "wave_height": 2.1, "precipitation": 3.0, "intent": "SAFETY", "forecast_window": fw,
                "profile": {"language": "hi"}, "geofence": {}}

    def test_llm_down_gives_a_period_summary_not_a_today_sentence(self):
        fw = {"label": "tomorrow morning (05:00-12:00 IST)", "covered": True}
        with mock.patch.object(response, "sarvam_generate", side_effect=RuntimeError("down")):
            text = response.response_node(self.state(fw))["recommendation"]
        self.assertIn("tomorrow morning", text)
        self.assertIn("34 km/h", text)
        self.assertNotIn("आज", text)                 # the Hindi "today" fallback must not be used

    def test_uncovered_window_says_so(self):
        fw = {"label": "tomorrow morning (05:00-12:00 IST)", "covered": False}
        with mock.patch.object(response, "sarvam_generate", side_effect=RuntimeError("down")):
            text = response.response_node(self.state(fw))["recommendation"]
        self.assertIn("does not reach", text)

    def test_border_warning_still_takes_priority(self):
        st = self.state({"label": "tomorrow morning", "covered": True})
        st["geofence"] = {"alerts": [{"type": "GEOFENCE_DANGER", "message": "Near the boundary"}]}
        with mock.patch.object(response, "sarvam_generate", side_effect=RuntimeError("down")):
            text = response.response_node(st)["recommendation"]
        self.assertIn("boundary", text.lower())

    def test_prompt_names_the_period(self):
        seen = {}

        def fake(prompt, *a, **k):
            seen["p"] = prompt
            return "Tomorrow morning looks fine with light winds and small waves."

        with mock.patch.object(response, "sarvam_generate", side_effect=fake):
            response.response_node(self.state({"label": "tomorrow morning (05:00-12:00 IST)", "covered": True}))
        self.assertIn("Forecast period asked about: tomorrow morning", seen["p"])

    def test_no_window_leaves_the_prompt_unchanged(self):
        seen = {}

        def fake(prompt, *a, **k):
            seen["p"] = prompt
            return "Conditions are calm today with light winds and low waves."

        with mock.patch.object(response, "sarvam_generate", side_effect=fake):
            response.response_node(self.state(None))
        self.assertNotIn("Forecast period asked about", seen["p"])


if __name__ == "__main__":
    unittest.main()
