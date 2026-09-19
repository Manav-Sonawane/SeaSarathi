"""
Regression tests for IMD bulletin parsing + alert building, run against the
REAL regional fisherman-warning PDFs captured from mausam.imd.gov.in on
2026-09-19 (tests/fixtures/imd/a1..a7.txt) — not synthetic samples.

Run from backend/:   ./venv/Scripts/python.exe -m unittest discover -s tests -t .

Every test below pins a bug found live that day:
  * Kerala showed a HIGH "do not venture" alert although IMD said
    "Keralam coast NIL" (the advisory was about open-sea areas).
  * Swell-surge alerts, thunderstorm and the Arabian Sea wind/gust detail
    were never extracted (the LLM returned nothing for that region).
  * Bulletins from 2024 / Jan / Jun / Aug 2026 were shown as active alerts.
  * NORTH TAMILNADU / SOUTH ANDHRAPRADESH never matched IMD's region labels.
  * Open-Meteo's 23 km/h was stamped onto an IMD 45-55 km/h warning.
"""
import os
import unittest
from datetime import datetime, timezone

from src.services import imd_bulletin_facts as F
from src.services.imd_alerts import _fisherman_alerts, _cyclone_archive_alert

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "imd")

# 11:30 IST on 19 Sep 2026 — the moment the bug was reported.
NOW = datetime(2026, 9, 19, 6, 0, tzinfo=timezone.utc)

REGION_LABELS = {
    "a1": "West Bengal Coast, Northwest Bay of Bengal, Northeast Bay of Bengal, North Andaman Sea, South Andaman Sea",
    "a2": "South Odisha coast and North Odisha coast",
    "a3": "North Andhra coast and South Andhra coast",
    "a4": "North Tamil Nadu coast, South Tamil Nadu coast, Comorin Area, Maldives Area, Southeast Bay of Bengal, "
          "Southwest Bay of Bengal, West Central Bay of Bengal, and East Central Bay of Bengal",
    "a5": "Kerala Coast, Karnataka Coast, Lakshadweep area, Southwest Arabian Sea and southeast Arabian Sea",
    "a6": "North Maharashtra Coast, South Maharashtra coast, Goa coast, West Central Arabian Sea, East central Arabian Sea",
    "a7": "North Gujarat Coast, South Gujarat Coast, northwest Arabian Sea, northeast Arabian Sea",
}


def _text(region_id: str) -> str:
    with open(os.path.join(FIXTURES, f"{region_id}.txt"), encoding="utf-8") as f:
        return f.read()


def _cache_payload() -> dict:
    return {"fisherman_warnings": [
        {"region_id": rid, "region_label": label, "pdf_url": f"https://example/{rid}.pdf", "raw_text": _text(rid)}
        for rid, label in REGION_LABELS.items()
    ]}


def _alerts(state: str, district: str | None, now: datetime = NOW) -> list[dict]:
    return _fisherman_alerts(_cache_payload(), F.canonical_state(state), district, now)


def _by_type(alerts: list[dict]) -> dict:
    return {a["type"]: a for a in alerts}


class FreshnessTests(unittest.TestCase):
    def test_issue_time_parsed_for_every_regional_format(self):
        expected = {
            "a1": "2026-06-27T05:30", "a2": "2026-01-08T21:00", "a3": "2026-09-18T06:00",
            "a4": "2026-08-22T13:00", "a5": "2026-09-19T06:00", "a6": "2024-06-18T21:00",
            "a7": "2026-09-19T05:30",
        }
        for rid, iso in expected.items():
            issued = F.parse_issue_time(_text(rid))
            self.assertIsNotNone(issued, rid)
            self.assertEqual(issued.strftime("%Y-%m-%dT%H:%M"), iso, rid)

    def test_only_todays_bulletins_are_current(self):
        status = {rid: F.extract_facts(_text(rid), NOW)["status"] for rid in REGION_LABELS}
        self.assertEqual({rid for rid, s in status.items() if s == "current"}, {"a3", "a5", "a7"})
        for rid in ("a1", "a2", "a4", "a6"):
            self.assertEqual(status[rid], "expired", rid)

    def test_bulletin_expires_after_its_last_day(self):
        # a5: issued 19 Sep, valid for next 4 days => through 22 Sep inclusive.
        f = F.extract_facts(_text("a5"), datetime(2026, 9, 22, 18, 0, tzinfo=timezone.utc))
        self.assertEqual(f["status"], "current")
        f = F.extract_facts(_text("a5"), datetime(2026, 9, 22, 19, 0, tzinfo=timezone.utc))   # 00:30 IST on 23 Sep
        self.assertEqual(f["status"], "expired")

    def test_unreadable_date_is_unknown_never_current(self):
        self.assertEqual(F.extract_facts("Squally wind 45-55 kmph", NOW)["status"], "unknown")


class KeralaBulletinTests(unittest.TestCase):
    def setUp(self):
        self.f = F.extract_facts(_text("a5"), NOW)

    def test_kerala_karnataka_lakshadweep_are_nil(self):
        self.assertEqual(set(self.f["nil_coasts"]), {"KERALA", "KARNATAKA", "LAKSHADWEEP"})

    def test_arabian_sea_statement_has_wind_gust_and_all_four_days(self):
        arabian = [g for g in self.f["wind_statements"] if g["sea"] == "arabian_sea"]
        self.assertEqual(len(arabian), 1)
        g = arabian[0]
        self.assertEqual((g["wind_min"], g["wind_max"], g["gust"]), (45, 55, 65))
        self.assertEqual(g["days"], [1, 2, 3, 4])
        self.assertEqual(g["dates"], ["2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"])
        self.assertIn("north Somalia", g["text"])
        self.assertEqual(g["covers"], [])   # names no Indian coast

    def test_advisory_sentence_is_separated_from_last_wind_statement(self):
        self.assertTrue(self.f["venture_advisory_text"].startswith("Fishermen are advised not to venture"))
        for g in self.f["wind_statements"]:
            self.assertNotIn("advised not to venture", g["text"])

    def test_thunderstorm_names_kerala(self):
        self.assertIn("KERALA", self.f["thunderstorm"]["covers"])

    def test_every_live_swell_alert_parses_including_wrapped_dates(self):
        self.assertEqual(self.f["unparsed_swell_alerts"], 0)
        districts = {d for a in self.f["swell_alerts"] for d in a["districts"]}
        # Kozhikode / Uttara Kannada have their dates wrapped across lines in the PDF.
        for d in ("ERNAKULAM", "KOZHIKODE", "UTTARA KANNADA", "KOLLAM", "THOOTHUKKUDI"):
            self.assertIn(d, districts)

    def test_ernakulam_swell_matches_the_pdf_numbers(self):
        a = next(a for a in self.f["swell_alerts"] if a["districts"] == ["ERNAKULAM"])
        self.assertEqual(a["state"], "KERALA")
        self.assertEqual(a["stretch"], "Munambam FH To Maruvakad")
        self.assertEqual(a["period_s"], [17.0, 21.0])
        self.assertEqual(a["height_m"], [0.7, 1.0])
        # PDF: "23:30 hours on 18-09-2026 to 05:30 hours on 20-09-2026" (IST)
        self.assertEqual(a["from_utc"], "2026-09-18T18:00:00+00:00")
        self.assertEqual(a["until_utc"], "2026-09-20T00:00:00+00:00")

    def test_swell_alerts_drop_once_finished(self):
        later = datetime(2026, 9, 21, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(F.extract_facts(_text("a5"), later)["swell_alerts"], [])


class GujaratBulletinTests(unittest.TestCase):
    def test_coast_warning_is_separate_from_open_sea(self):
        stmts = F.extract_facts(_text("a7"), NOW)["wind_statements"]
        coast = [g for g in stmts if "GUJARAT" in g["covers"]]
        sea = [g for g in stmts if g["sea"] == "arabian_sea"]
        self.assertEqual((coast[0]["wind_min"], coast[0]["wind_max"], coast[0]["gust"]), (30, 40, 50))
        self.assertEqual(coast[0]["days"], [1])
        self.assertTrue(coast[0]["sea_state"].startswith("Sea will be rough"))
        self.assertTrue(sea and all(g["covers"] == [] for g in sea))


class AlertBuilderTests(unittest.TestCase):
    def test_kochi_is_not_told_to_stay_ashore_for_somalia(self):
        alerts = _alerts("KERALA", "Ernakulam")
        self.assertFalse([a for a in alerts if a["severity"] == "HIGH"], "Kerala coast is NIL — no HIGH alert")
        types = _by_type(alerts)
        self.assertIn("IMD_SWELL_SURGE_ALERT", types)
        self.assertIn("IMD_THUNDERSTORM_WARNING", types)
        self.assertIn("IMD_OPEN_SEA_WARNING", types)
        self.assertNotIn("IMD_COAST_WIND_WARNING", types)

    def test_kochi_swell_card_is_for_its_own_district_first(self):
        swell = _by_type(_alerts("KERALA", "Ernakulam"))["IMD_SWELL_SURGE_ALERT"]
        self.assertEqual(swell["severity"], "MODERATE")
        self.assertIn("Ernakulam", swell["message"])
        self.assertIn("0.7–1.0 m", swell["message"])
        self.assertTrue(swell["metadata"]["detail_rows"][0]["label"].startswith("Ernakulam"))

    def test_open_sea_card_carries_arabian_sea_wind_gust_days_and_nil(self):
        card = _by_type(_alerts("KERALA", "Ernakulam"))["IMD_OPEN_SEA_WARNING"]
        self.assertEqual(card["severity"], "INFO")
        self.assertEqual(card["metadata"]["wind_conditions"], "45–55 km/h, gusting 65 km/h")
        self.assertIn("NIL", card["message"])
        self.assertIn("Arabian Sea", card["message"])
        self.assertEqual(card["metadata"]["detail_rows"][0]["label"], "Day 1–4 · 19 Sep–22 Sep")
        # Bay of Bengal areas are not this coast's sea.
        self.assertNotIn("Andaman", card["message"])

    def test_east_coast_gets_bay_of_bengal_not_arabian_sea(self):
        card = _by_type(_alerts("SOUTH ANDHRAPRADESH", "Nellore"))["IMD_OPEN_SEA_WARNING"]
        self.assertIn("Bay of Bengal", card["message"])
        self.assertNotIn("Somalia", card["message"])

    def test_gujarat_gets_a_moderate_coast_warning(self):
        alerts = _by_type(_alerts("GUJARAT", "Junagadh"))
        coast = alerts["IMD_COAST_WIND_WARNING"]
        self.assertEqual(coast["severity"], "MODERATE")          # 30-40 km/h gusting 50 = "be cautious"
        self.assertEqual(coast["metadata"]["wind_conditions"], "30–40 km/h, gusting 50 km/h")
        self.assertNotIn("No wind warning names", alerts["IMD_OPEN_SEA_WARNING"]["message"])

    def test_expired_bulletins_are_never_active_alerts(self):
        for state, district in (("NORTH TAMILNADU", "Chennai"), ("MAHARASHTRA", "Mumbai"), ("ODISHA", "Puri"), ("ANDAMAN", "South Andaman")):
            alerts = _alerts(state, district)
            self.assertEqual([a["type"] for a in alerts], ["IMD_BULLETIN_EXPIRED"], state)
            self.assertEqual(alerts[0]["severity"], "INFO", state)

    def test_tamilnadu_and_andhra_sector_names_now_match(self):
        self.assertEqual(F.canonical_state("NORTH TAMILNADU"), "TAMIL NADU")
        self.assertEqual(F.canonical_state("SOUTH TAMILNADU"), "TAMIL NADU")
        self.assertEqual(F.canonical_state("SOUTH ANDHRAPRADESH"), "ANDHRA PRADESH")
        self.assertEqual(F.canonical_state("NICOBAR"), "ANDAMAN & NICOBAR")
        self.assertTrue(_alerts("NORTH TAMILNADU", "Chennai"), "Tamil Nadu used to get no IMD alert at all")

    def test_imd_cards_carry_no_open_meteo_numbers_and_show_issue_time(self):
        for a in _alerts("KERALA", "Ernakulam"):
            m = a["metadata"]
            for k in ("wind_speed_10m", "wind_gusts_10m", "wave_height_m"):
                self.assertNotIn(k, m)
            self.assertEqual(m["issued_at_text"], "19 Sep 06:00 IST")

    def test_state_level_summary_for_news_feed(self):
        swell = _by_type(_alerts("KERALA", None))["IMD_SWELL_SURGE_ALERT"]
        self.assertEqual(swell["severity"], "MODERATE")
        self.assertNotIn("none listed", swell["message"])


class CycloneArchiveTests(unittest.TestCase):
    """RSMC archive gave South Tamil Nadu 'advised not to venture into the sea' (HIGH) while
    that day's actual bulletin read 'FISHERMEN WARNING FOR TAMIL NADU COAST: NIL'."""

    def _payload(self, text):
        return {"cyclone_warnings": [{
            "region_id": "145", "region_name": "South Tamil Nadu",
            "warnings": [{"issue_datetime_ist": "19-09-2026 00:00:00", "warning": text, "message": "",
                          "venture_advisory": True, "severity": "HIGH", "pdf_url": "https://example/x.pdf"}],
        }]}

    def test_scopeless_summary_is_a_caution_not_a_cyclone_alert(self):
        a = _cyclone_archive_alert(self._payload("Fishermen are advised not to venture into the sea"), "TAMIL NADU", NOW)
        self.assertEqual(a["type"], "IMD_FISHERMEN_ARCHIVE_ADVISORY")   # must not set the app's cyclone flag
        self.assertEqual(a["severity"], "MODERATE")
        self.assertIn("does not say which areas", a["message"])

    def test_genuine_cyclone_language_stays_high(self):
        a = _cyclone_archive_alert(self._payload("Cyclonic storm over Bay of Bengal. Fishermen advised not to venture"), "TAMIL NADU", NOW)
        self.assertEqual((a["type"], a["severity"]), ("IMD_CYCLONE_WARNING", "HIGH"))

    def test_old_archive_entries_are_ignored(self):
        later = datetime(2026, 9, 21, 12, 0, tzinfo=timezone.utc)   # >36 h after 19 Sep 00:00 IST
        self.assertIsNone(_cyclone_archive_alert(self._payload("Fishermen are advised not to venture into the sea"), "TAMIL NADU", later))

    def test_other_states_unaffected(self):
        self.assertIsNone(_cyclone_archive_alert(self._payload("Fishermen are advised not to venture into the sea"), "KERALA", NOW))


if __name__ == "__main__":
    unittest.main()
