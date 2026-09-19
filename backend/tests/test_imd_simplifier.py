"""
Tests for src/services/imd_simplifier.py — the LLM is faked; no network.
What matters: whatever the model answers, the summary can't contain a stale
fact, an invented number, composed advice, or miss a current wind/storm fact.
"""
import asyncio
import json
import unittest
from unittest import mock

from src.services import imd_simplifier as s

OLD = "2026-09-20T11:30:00+00:00"     # 20 Sep 17:00 IST
NEW = "2026-09-21T08:30:00+00:00"     # 21 Sep 14:00 IST
UNTIL = "2026-09-22T12:00:00+00:00"


def alert(*evidence):
    return {"type": "X", "metadata": {"evidence": list(evidence)}}


def ev(kind, place="Kerala", issued=NEW, **fields):
    return {"source": "imd-fisherman-warning", "kind": kind, "place": place,
            "issued_at_utc": issued, "valid_until_utc": UNTIL, **fields}


def facts_for(*evidence):
    return s.collect_evidence([alert(*evidence)])


def run(coro):
    return asyncio.run(coro)


class NewerWinsTests(unittest.TestCase):
    def test_later_issue_time_wins_for_same_place_and_kind(self):
        facts = facts_for(
            ev("advisory", issued=OLD, text="Fishermen are advised not to venture into the sea."),
            ev("advisory", issued=NEW, text="Fishermen are advised to be cautious."),
        )
        self.assertEqual(s.find_superseded(facts), {"F1": "F2"})

    def test_case_and_punctuation_in_place_dont_matter(self):
        facts = facts_for(ev("wind", place="Kerala", issued=OLD, wind_min=30, wind_max=40),
                          ev("wind", place="KERALA.", issued=NEW, wind_min=45, wind_max=55))
        self.assertEqual(s.find_superseded(facts), {"F1": "F2"})

    def test_same_bulletin_facts_dont_supersede_each_other(self):
        facts = facts_for(ev("wind", wind_min=30, wind_max=40, period="Day 1"),
                          ev("wind", wind_min=45, wind_max=55, period="Day 2"))
        self.assertEqual(s.find_superseded(facts), {})

    def test_different_places_or_kinds_dont_conflict(self):
        facts = facts_for(ev("swell", place="Ernakulam", issued=OLD, height_min=1, height_max=2),
                          ev("swell", place="Thrissur", issued=NEW, height_min=2, height_max=3),
                          ev("wind", issued=OLD, wind_min=30, wind_max=40))
        self.assertEqual(s.find_superseded(facts), {})

    def test_unknown_issue_time_is_never_compared(self):
        facts = facts_for(ev("storm", place="Arabian Sea", issued=None, text="Squally"),
                          ev("storm", place="Arabian Sea", issued=NEW, text="Squally weather"))
        self.assertEqual(s.find_superseded(facts), {})


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.facts = facts_for(
            ev("wind", wind_min=45, wind_max=55, gust=65, unit="kmph", period="Day 1"),       # F1
            ev("swell", place="Ernakulam", height_min=2.5, height_max=3.5, period_min=8, period_max=10),  # F2
            ev("advisory", issued=OLD, text="Fishermen are advised not to venture into the sea."),  # F3 (stale)
            ev("advisory", issued=NEW, text="Fishermen are advised to be cautious."),               # F4
            ev("thunderstorm", text="Thunderstorm with lightning likely."),                        # F5
        )
        self.superseded = s.find_superseded(self.facts)      # {F3: F4}

    def check(self, **answer):
        return s.validate_llm_answer({"keep": [], **answer}, self.facts, self.superseded)

    def test_stale_fact_the_model_keeps_is_removed(self):
        kept, advice, _ = self.check(keep=["F1", "F3"], advice_fact_id="F3")
        self.assertNotIn("F3", kept)
        self.assertIsNone(advice)

    def test_model_cannot_drop_wind_or_thunderstorm(self):
        kept, _, _ = self.check(keep=["F2"])
        self.assertIn("F1", kept)
        self.assertIn("F5", kept)

    def test_swell_is_capped_at_three(self):
        many = facts_for(*[ev("swell", place=f"D{i}", height_min=1, height_max=i + 1) for i in range(6)])
        kept, _, _ = s.validate_llm_answer({"keep": [f["id"] for f in many]}, many, {})
        self.assertEqual(len(kept), 3)

    def test_advice_must_be_an_advisory_fact(self):
        _, advice, _ = self.check(keep=["F1"], advice_fact_id="F1")
        self.assertIsNone(advice)
        _, advice, _ = self.check(keep=["F1"], advice_fact_id="F4")
        self.assertEqual(advice, "F4")

    def test_plain_sentence_with_only_cited_numbers_passes(self):
        _, _, plain = self.check(keep=["F1", "F2"], plain="Strong wind of 45 to 55 with gusts of 65, and swell of 2.5 to 3.5.")
        self.assertIsNotNone(plain)

    def test_plain_sentence_with_an_invented_number_is_dropped(self):
        _, _, plain = self.check(keep=["F1"], plain="Wind of 45 to 60 is expected.")
        self.assertIsNone(plain)

    def test_plain_sentence_that_gives_advice_is_dropped(self):
        for bad in ("Strong wind of 45 to 55. Fishermen should avoid the sea.",
                    "Wind of 45 to 55, do not go out.",
                    "Wind of 45 to 55; stay ashore."):
            _, _, plain = self.check(keep=["F1"], plain=bad)
            self.assertIsNone(plain, bad)


class EndToEndTests(unittest.TestCase):
    def setUp(self):
        s._CACHE.clear()
        self.alerts = [alert(
            ev("wind", wind_min=45, wind_max=55, gust=65, unit="kmph", period="Day 1 · 21 Sep"),
            ev("advisory", issued=OLD, text="Fishermen are advised not to venture into the sea."),
            ev("advisory", issued=NEW, text="Fishermen are advised to be cautious."),
        )]

    def test_llm_answer_is_used_and_values_come_from_the_facts(self):
        answer = json.dumps({"keep": ["F1"], "advice_fact_id": "F3", "dropped": ["F2"], "plain": "Wind of 45 to 55 with gusts of 65."})
        with mock.patch.object(s, "sarvam_generate", return_value=f"reasoning...\n{answer}"):
            out = run(s.simplify(self.alerts))
        self.assertEqual(out["method"], "llm")
        self.assertEqual(out["items"][0]["wind_max"], 55)
        self.assertEqual(out["advice"]["text"], "Fishermen are advised to be cautious.")   # newer one, quoted verbatim
        self.assertEqual(out["superseded"][0]["replaced_by_issued_text"], "21 Sep 14:00 IST")

    def test_model_picking_the_stale_advisory_still_gets_the_newer_one_shown(self):
        # It chose F2 (older); F2 is superseded, so no advice is taken from the model...
        answer = json.dumps({"keep": ["F1"], "advice_fact_id": "F2", "dropped": [], "plain": None})
        with mock.patch.object(s, "sarvam_generate", return_value=answer):
            out = run(s.simplify(self.alerts))
        self.assertIsNone(out["advice"])           # ...never the stale line

    def test_llm_failure_falls_back_to_rules_with_latest_advisory(self):
        with mock.patch.object(s, "sarvam_generate", side_effect=RuntimeError("down")):
            out = run(s.simplify(self.alerts))
        self.assertEqual(out["method"], "rules")
        self.assertEqual(out["items"][0]["wind_max"], 55)
        self.assertEqual(out["advice"]["text"], "Fishermen are advised to be cautious.")
        self.assertIsNone(out["plain"])

    def test_garbage_answer_falls_back_to_rules(self):
        with mock.patch.object(s, "sarvam_generate", return_value="I cannot help with that"):
            out = run(s.simplify(self.alerts))
        self.assertEqual(out["method"], "rules")

    def test_llm_result_is_cached_by_facts(self):
        answer = json.dumps({"keep": ["F1"], "advice_fact_id": None, "dropped": [], "plain": None})
        with mock.patch.object(s, "sarvam_generate", return_value=answer) as fake:
            run(s.simplify(self.alerts))
            run(s.simplify(self.alerts))
        self.assertEqual(fake.call_count, 1)

    def test_no_evidence_returns_none(self):
        self.assertIsNone(run(s.simplify([{"type": "HIGH_WIND", "metadata": {}}])))


if __name__ == "__main__":
    unittest.main()
