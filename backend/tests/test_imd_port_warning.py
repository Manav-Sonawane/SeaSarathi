"""
Tests for the PORT WARNING section of IMD's fisherman bulletin: it used to be swallowed into
the thunderstorm warning, producing one wall of "Keep hoisted Local Cautionary signal number III"
text. Now the thunderstorm sentence stands alone and the ports are parsed into a short alert.
The bulletin text below is the flattened text as it appeared in the app.
"""
import unittest
from datetime import datetime, timezone

from src.services import imd_alerts as A
from src.services import imd_bulletin_facts as F

SIGNAL = "Keep hoisted Local Cautionary signal number III"
KERALA = ["KASARGOD", "CANNANORE", "TELLICHERRY", "KOZHIKODE", "BEYPORE", "PONNANI", "AZHIKKAL", "KOCHI",
          "ALAPUZHA", "NEEPORT QUILON", "THIRUVANANTHAPURAM"]
KARNATAKA = ["KARWAR", "MANGALORE", "PANAMBUR", "HONAVAR", "BHATKAL", "GANGOLI", "MALPE"]


def rows(names, first_dot_every_other=True):
    """'1 KASARGOD Keep hoisted ... 2. CANNANORE ...' — IMD's numbering mixes '1' and '1.'."""
    return " ".join(f"{i}{'.' if (i % 2 == 0) == first_dot_every_other else ''} {n} {SIGNAL}" for i, n in enumerate(names, 1))


THUNDER = ("Thunderstorm accompanied by lightning and gusty wind with speed reaching 30-40 Kmph is very "
           "likely to occur at one or two places over Keralam on 26th & 29th September 2026.")
BULLETIN = (f"THUNDERSTORM WARNING: {THUNDER} PORT WARNING: Kerala Ports S.No Name of the Port Advice {rows(KERALA)} "
            f"Lakshadweep Port S.No Name of the Port Advice 1 MINICOY {SIGNAL} "
            f"Karnataka Ports S.No Name of the Port Advice {rows(KARNATAKA)} HIGH WAVE ALERT: Nil. OCEAN CURRENT ALERT: Nil.")


class ThunderstormTests(unittest.TestCase):
    def test_thunderstorm_text_no_longer_includes_the_port_table(self):
        ts = F.extract_thunderstorm(BULLETIN)
        self.assertEqual(ts["text"], THUNDER)
        self.assertNotIn("Keep hoisted", ts["text"])
        self.assertIn("KERALA", ts["covers"])


class PortWarningParseTests(unittest.TestCase):
    def setUp(self):
        self.pw = F.extract_port_warning(BULLETIN)

    def test_every_port_of_every_region_is_read(self):
        self.assertTrue(self.pw["parsed"])
        got = {g["region"]: [p["name"] for p in g["ports"]] for g in self.pw["groups"]}
        self.assertEqual(got["Kerala"], KERALA)
        self.assertEqual(got["Lakshadweep"], ["MINICOY"])
        self.assertEqual(len(got["Karnataka"]), 7)

    def test_advice_is_kept_word_for_word(self):
        self.assertTrue(all(p["advice"] == SIGNAL for g in self.pw["groups"] for p in g["ports"]))

    def test_trailing_bracketed_place_belongs_to_the_port_name(self):
        text = f"PORT WARNING: Karnataka Ports S.No Name of the Port Advice 1 GANGOLI {SIGNAL} (COONDAPUR) 2. MALPE {SIGNAL}"
        names = [p["name"] for p in F.extract_port_warning(text)["groups"][0]["ports"]]
        self.assertEqual(names, ["GANGOLI (COONDAPUR)", "MALPE"])
        self.assertTrue(all(p["advice"] == SIGNAL for p in F.extract_port_warning(text)["groups"][0]["ports"]))

    def test_nil_or_absent_is_none(self):
        self.assertIsNone(F.extract_port_warning("PORT WARNING: Nil. HIGH WAVE ALERT: Nil."))
        self.assertIsNone(F.extract_port_warning("HIGH WAVE ALERT: Nil."))

    def test_a_row_that_cannot_be_read_falls_back_to_the_raw_text(self):
        # Second row has a different advice format: no port may silently disappear.
        text = f"PORT WARNING: Kerala Ports S.No Name of the Port Advice 1 KASARGOD {SIGNAL} 2 CANNANORE Hoist signal five HIGH WAVE ALERT: Nil."
        pw = F.extract_port_warning(text)
        self.assertFalse(pw["parsed"])
        self.assertEqual(pw["groups"], [])
        self.assertIn("CANNANORE", pw["text"])

    def test_unstructured_text_falls_back_to_the_raw_text(self):
        pw = F.extract_port_warning("PORT WARNING: Ports on the coast should keep signal 5 hoisted. HIGH WAVE ALERT: Nil.")
        self.assertFalse(pw["parsed"])
        self.assertIn("signal 5", pw["text"])


class PortAlertTests(unittest.TestCase):
    META = {"issued_at_utc": "2026-09-26T00:00:00+00:00", "distance_km": 0}

    def alert(self, state="KERALA", text=BULLETIN):
        return A._port_alert(F.extract_port_warning(text), state, "imd-fisherman-warning", self.META, "Issued 26 Sep")

    def test_short_message_for_the_users_state_only(self):
        a = self.alert()
        self.assertEqual(a["type"], "IMD_PORT_WARNING")
        self.assertEqual(a["severity"], "MODERATE")
        self.assertEqual(a["message"], f"{SIGNAL} — all 11 Kerala ports.")
        self.assertLess(len(a["message"]), 100)

    def test_ports_are_bullet_rows_not_prose(self):
        rows_ = self.alert()["metadata"]["detail_rows"]
        self.assertEqual(rows_[0]["label"], SIGNAL)
        self.assertEqual(rows_[0]["text"].split(" · ")[:3], ["Kasargod", "Cannanore", "Tellicherry"])
        self.assertIn("Neeport Quilon", rows_[0]["text"])

    def test_other_regions_are_summarised_not_dumped(self):
        other = self.alert()["metadata"]["detail_rows"][-1]
        self.assertIn("Lakshadweep: 1 port", other["text"])
        self.assertIn("Karnataka: 7 ports", other["text"])
        self.assertNotIn("Keep hoisted", other["text"])

    def test_state_with_no_ports_in_the_warning_gets_no_alert(self):
        self.assertIsNone(self.alert(state="GOA"))

    def test_different_advice_per_port_is_kept_separate(self):
        text = (f"PORT WARNING: Kerala Ports S.No Name of the Port Advice 1 KASARGOD {SIGNAL} "
                "2 CANNANORE Keep hoisted Distant Cautionary signal number II HIGH WAVE ALERT: Nil.")
        a = self.alert(text=text)
        self.assertEqual(len(a["metadata"]["detail_rows"]), 2)
        self.assertIn("Distant Cautionary signal number II (1 port)", a["message"])

    def test_unreadable_table_still_shows_imds_own_text(self):
        a = self.alert(text="PORT WARNING: Ports on the coast should keep signal 5 hoisted. HIGH WAVE ALERT: Nil.")
        self.assertIn("signal 5", a["message"])


class NewestSourceWinsTests(unittest.TestCase):
    def alert(self, type_, issued, severity="MODERATE"):
        return {"type": type_, "severity": severity, "metadata": {"issued_at_utc": issued}}

    def test_older_archive_advisory_is_dropped_when_a_newer_bulletin_says_coast_clear(self):
        alerts = [self.alert("IMD_FISHERMEN_ARCHIVE_ADVISORY", "2026-09-25T18:30:00+00:00"),      # 26 Sep 00:00 IST
                  self.alert("IMD_COAST_CLEAR", "2026-09-26T00:00:00+00:00", "INFO"),            # 26 Sep 05:30 IST
                  self.alert("IMD_THUNDERSTORM_WARNING", "2026-09-26T00:00:00+00:00")]
        kept = [a["type"] for a in A.drop_superseded_archive_advisories(alerts)]
        self.assertEqual(kept, ["IMD_COAST_CLEAR", "IMD_THUNDERSTORM_WARNING"])

    def test_a_newer_archive_advisory_is_kept(self):
        alerts = [self.alert("IMD_FISHERMEN_ARCHIVE_ADVISORY", "2026-09-26T06:00:00+00:00"),
                  self.alert("IMD_COAST_CLEAR", "2026-09-26T00:00:00+00:00", "INFO")]
        self.assertEqual(len(A.drop_superseded_archive_advisories(alerts)), 2)

    def test_archive_advisory_stays_when_there_is_no_coast_clear_bulletin(self):
        alerts = [self.alert("IMD_FISHERMEN_ARCHIVE_ADVISORY", "2026-09-25T18:30:00+00:00")]
        self.assertEqual(A.drop_superseded_archive_advisories(alerts), alerts)

    def test_cyclone_warnings_are_never_dropped(self):
        alerts = [self.alert("IMD_CYCLONE_WARNING", "2026-09-25T18:30:00+00:00", "HIGH"),
                  self.alert("IMD_COAST_CLEAR", "2026-09-26T00:00:00+00:00", "INFO")]
        self.assertEqual(len(A.drop_superseded_archive_advisories(alerts)), 2)

    def test_missing_timestamps_are_never_compared(self):
        alerts = [{"type": "IMD_FISHERMEN_ARCHIVE_ADVISORY", "metadata": {}},
                  self.alert("IMD_COAST_CLEAR", "2026-09-26T00:00:00+00:00", "INFO")]
        self.assertEqual(len(A.drop_superseded_archive_advisories(alerts)), 2)


if __name__ == "__main__":
    unittest.main()
