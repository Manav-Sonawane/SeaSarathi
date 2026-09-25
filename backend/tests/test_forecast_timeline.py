"""
Tests for GET /forecast/timeline's builder (src/routers/forecast.py) — the
hourly forecast is faked; no network.
"""
import unittest
from unittest import mock

import numpy as np
import pandas as pd

from src.agents.tide import SEA_LEVEL_COLUMN
from src.routers import forecast

NOW = pd.Timestamp("2026-09-21T04:40:00", tz="UTC")
START = pd.Timestamp("2026-09-21T00:00:00", tz="UTC")     # frames start at midnight, like Open-Meteo's


def frames(hours=72, tide=True, wave_nan_at=None):
    dates = pd.date_range(START, periods=hours, freq="h")
    weather = pd.DataFrame({"date": dates, "wind_speed_10m": np.arange(hours, dtype=float),
                            "wind_gusts_10m": np.arange(hours, dtype=float) + 10})
    marine = pd.DataFrame({"date": dates, "wave_height": np.linspace(1.0, 2.0, hours)})
    if wave_nan_at is not None:
        marine.loc[wave_nan_at, "wave_height"] = np.nan
    if tide:
        marine[SEA_LEVEL_COLUMN] = np.sin(np.arange(hours) / 2.0)
    return weather, marine


def build(weather, marine, hours=48):
    from src.services import weather_service
    combined = {weather_service.generate_grid_point_id(9.97, 76.28): {
        "general_weather_forecast": weather, "marine_forecast": marine}}
    with mock.patch.object(weather_service, "fetch_combined_forecasts_for_grid_cached", return_value=combined):
        return forecast.build_timeline(9.97, 76.28, hours, now_utc=NOW)


class TimelineTests(unittest.TestCase):
    def test_starts_at_the_current_hour_and_covers_the_requested_span(self):
        out = build(*frames(), hours=24)
        self.assertEqual(out["hours"], 24)
        self.assertEqual(out["points"][0]["t"], "2026-09-21T04:00:00+00:00")     # 04:40 floored to the hour
        self.assertEqual(out["points"][-1]["t"], "2026-09-22T03:00:00+00:00")

    def test_hours_already_past_are_left_out(self):
        out = build(*frames())
        self.assertTrue(all(p["t"] >= "2026-09-21T04:00:00" for p in out["points"]))

    def test_each_point_carries_wind_gust_wave_and_tide(self):
        p = build(*frames())["points"][0]
        self.assertEqual(set(p), {"t", "wind_kmh", "gust_kmh", "wave_m", "tide_m"})
        self.assertEqual(p["wind_kmh"], 4.0)             # hour index 4 (04:00 UTC)
        self.assertEqual(p["gust_kmh"], 14.0)

    def test_short_forecast_returns_what_exists(self):
        out = build(*frames(hours=30), hours=48)
        self.assertEqual(out["hours"], 26)               # 04:00 -> 05:00 next day

    def test_missing_tide_column_is_reported_not_faked(self):
        out = build(*frames(tide=False))
        self.assertFalse(out["tide_available"])
        self.assertTrue(all(p["tide_m"] is None for p in out["points"]))

    def test_tide_available_when_present(self):
        self.assertTrue(build(*frames())["tide_available"])

    def test_gaps_become_null_not_zero(self):
        weather, marine = frames(wave_nan_at=4)
        self.assertIsNone(build(weather, marine)["points"][0]["wave_m"])

    def test_marine_data_missing_altogether_still_gives_wind(self):
        weather, _ = frames()
        out = build(weather, None)
        self.assertIsNotNone(out["points"][0]["wind_kmh"])
        self.assertTrue(all(p["wave_m"] is None for p in out["points"]))

    def test_no_weather_is_an_error(self):
        _, marine = frames()
        with self.assertRaises(ValueError):
            build(pd.DataFrame(), marine)

    def test_thresholds_match_the_alert_cutoffs(self):
        t = build(*frames())["thresholds"]
        self.assertEqual((t["wind_high_kmh"], t["wind_moderate_kmh"], t["wave_high_m"], t["wave_moderate_m"]),
                         (46, 28, 3.5, 2.0))


if __name__ == "__main__":
    unittest.main()
