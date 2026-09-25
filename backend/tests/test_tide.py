"""
Tests for tide information (src/agents/tide.py) — built from a synthetic
semi-diurnal tide so the right answers are known. No network; Sarvam is mocked.
"""
import math
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

import pandas as pd

from src.agents import planner, response, tide

NOW = datetime(2026, 9, 21, 4, 30, tzinfo=timezone.utc)      # 10:00 IST


def tide_frame(hours=72, period_h=12.42, amp=0.5, start=None, column=tide.SEA_LEVEL_COLUMN):
    """Hourly sea level: amp * sin(2*pi*t/period), t hours after the frame start."""
    start = start or NOW.replace(minute=0) - timedelta(hours=6)
    dates = pd.date_range(start, periods=hours, freq="h")
    return pd.DataFrame({"date": dates, column: [amp * math.sin(2 * math.pi * i / period_h) for i in range(hours)]})


class SummaryTests(unittest.TestCase):
    def test_finds_alternating_highs_and_lows(self):
        s = tide.summarize_tide(tide_frame(), pd.Timestamp(NOW))
        kinds = [e["type"] for e in s["events"]]
        self.assertGreaterEqual(len(kinds), 4)
        self.assertTrue(all(a != b for a, b in zip(kinds, kinds[1:])), kinds)   # never two highs in a row

    def test_high_and_low_heights_match_the_curve(self):
        s = tide.summarize_tide(tide_frame(amp=0.5), pd.Timestamp(NOW))
        for e in s["events"]:
            self.assertAlmostEqual(abs(e["height_m"]), 0.5, delta=0.06)
            self.assertEqual(e["height_m"] > 0, e["type"] == "high")

    def test_events_are_in_the_future_and_in_order(self):
        s = tide.summarize_tide(tide_frame(), pd.Timestamp(NOW))
        times = [datetime.fromisoformat(e["time_utc"]) for e in s["events"]]
        self.assertEqual(times, sorted(times))
        self.assertGreaterEqual(times[0], NOW.replace(minute=0))

    def test_trend_rising_and_falling(self):
        rising = pd.DataFrame({"date": pd.date_range(NOW.replace(minute=0), periods=6, freq="h"),
                               tide.SEA_LEVEL_COLUMN: [0.0, 0.2, 0.4, 0.5, 0.4, 0.2]})
        self.assertEqual(tide.summarize_tide(rising, pd.Timestamp(NOW))["trend"], "rising")
        falling = rising.assign(**{tide.SEA_LEVEL_COLUMN: [0.5, 0.3, 0.1, 0.0, 0.1, 0.3]})
        self.assertEqual(tide.summarize_tide(falling, pd.Timestamp(NOW))["trend"], "falling")

    def test_flat_water_is_slack_with_no_events(self):
        flat = pd.DataFrame({"date": pd.date_range(NOW.replace(minute=0), periods=8, freq="h"),
                             tide.SEA_LEVEL_COLUMN: [0.3] * 8})
        s = tide.summarize_tide(flat, pd.Timestamp(NOW))
        self.assertEqual(s["trend"], "slack")
        self.assertEqual(s["events"], [])

    def test_times_are_given_in_ist(self):
        s = tide.summarize_tide(tide_frame(), pd.Timestamp(NOW))
        self.assertTrue(all(e["time_text"].endswith("IST") for e in s["events"]))
        self.assertTrue(all(e["time_text"].split()[0] in ("today", "tomorrow") or e["time_text"][0].isdigit()
                            for e in s["events"]))

    def test_no_usable_data_returns_none(self):
        self.assertIsNone(tide.summarize_tide(None, pd.Timestamp(NOW)))
        self.assertIsNone(tide.summarize_tide(pd.DataFrame(), pd.Timestamp(NOW)))
        # A forecast cached before the sea-level column was requested.
        self.assertIsNone(tide.summarize_tide(tide_frame(column="wave_height"), pd.Timestamp(NOW)))
        # Column present but all missing.
        empty = tide_frame().assign(**{tide.SEA_LEVEL_COLUMN: float("nan")})
        self.assertIsNone(tide.summarize_tide(empty, pd.Timestamp(NOW)))

    def test_events_capped(self):
        s = tide.summarize_tide(tide_frame(hours=120, period_h=6), pd.Timestamp(NOW))
        self.assertLessEqual(len(s["events"]), tide.MAX_EVENTS)


class QuestionTests(unittest.TestCase):
    def test_recognises_tide_questions(self):
        for q in ("When is the next low tide?", "is the tide coming in", "high tide time", "ज्वार कब है",
                  "भरती कधी आहे", "জোয়ার কখন", "ભરતી ક્યારે", "വേലിയേറ്റം എപ്പോൾ",
                  "ଜୁଆର କେବେ", "ಉಬ್ಬರ ಯಾವಾಗ"):
            self.assertTrue(tide.mentions_tide(q), q)

    def test_other_questions_are_not_tide_questions(self):
        for q in ("Is it safe tomorrow?", "where is the nearest fishing zone", "any cyclone warning", ""):
            self.assertFalse(tide.mentions_tide(q), q)

    def test_tide_question_is_a_weather_intent(self):
        self.assertEqual(planner.classify_intent_rule_based("When is the next low tide?"), "WEATHER")


class PromptTests(unittest.TestCase):
    def state(self, query, tide_data):
        return {"query": query, "risk_level": "LOW", "wind_speed_10m": 10.0, "wave_height": 1.0, "precipitation": 0.0,
                "intent": "WEATHER", "profile": {"language": "en"}, "geofence": {}, "tide": tide_data}

    def summary(self):
        return tide.summarize_tide(tide_frame(), pd.Timestamp(NOW))

    def test_tide_goes_into_the_prompt_only_when_asked(self):
        seen = []

        def fake(prompt, *a, **k):
            seen.append(prompt)
            return "The tide is going out and the next low tide is this afternoon."

        with mock.patch.object(response, "sarvam_generate", side_effect=fake):
            response.response_node(self.state("When is the next low tide?", self.summary()))
            response.response_node(self.state("How is the wind?", self.summary()))
        self.assertIn("Tide (model estimate", seen[0])
        self.assertNotIn("Tide", seen[1])

    def test_missing_tide_data_tells_the_model_not_to_guess(self):
        seen = {}

        def fake(prompt, *a, **k):
            seen["p"] = prompt
            return "I cannot give tide information right now, sorry."

        with mock.patch.object(response, "sarvam_generate", side_effect=fake):
            response.response_node(self.state("When is high tide?", None))
        self.assertIn("do not guess", seen["p"])

    def test_llm_down_still_gives_tide_figures(self):
        with mock.patch.object(response, "sarvam_generate", side_effect=RuntimeError("down")):
            text = response.response_node(self.state("When is the next low tide?", self.summary()))["recommendation"]
        self.assertIn("Tide (model estimate)", text)
        self.assertIn("IST", text)

    def test_llm_down_and_no_data_says_unavailable(self):
        with mock.patch.object(response, "sarvam_generate", side_effect=RuntimeError("down")):
            text = response.response_node(self.state("When is the next low tide?", None))["recommendation"]
        self.assertIn("not available", text)


if __name__ == "__main__":
    unittest.main()
