"""The frozen judge itself is tested on synthetic turns (never on the frozen benchmark's agent outputs)."""
import sys
import unittest
from pathlib import Path

import support

sys.path.insert(0, str(support.ROOT / "evals"))
from judge_v2 import judge_turn  # noqa: E402


def spec(**kw):
    e = {"behaviour": "answer", "calls": [], "numbers": [], "address": [], "mention": [], "must_not": [],
         "allowed_extra": [], "stale": False, "premise": None}
    e.update(kw)
    return {"text": "q", "expect": e}


def turn(answer="", status="verified", calls=(), results=(), evidence=""):
    return {"status": status, "answer": answer, "evidence": evidence, "latency_s": 1.0,
            "trace": [{"calls": [dict(c) for c in calls]}], "results": list(results), "fallback_used": False,
            "repaired": False, "notes": []}


def call(name, status="ok", **args):
    return {"name": name, "arguments": args, "status": status}


FACT = {"id": "F1", "key": "dry_spell_max_days", "label": "Longest dry spell", "value": 32, "display": "32 days"}
RES = {"tool": "monsoon_indicators", "status": "ok", "summary": "s", "facts": [FACT], "entities": {}, "semantics": {},
       "provenance": [], "limitations": []}


class JudgeTests(unittest.TestCase):
    def test_correct_answer_passes(self):
        s = spec(calls=[{"tool": "monsoon_indicators", "args": {"district": "Sikar", "year": 2014}}],
                 numbers=[{"value": 32, "decimals": 0}], address=[{"label": "place", "any_of": ["Sikar"]}])
        t = turn("Sikar's longest dry spell in 2014 was 32 days.", calls=[call("monsoon_indicators", district="Sikar", year=2014)],
                 results=[RES])
        self.assertTrue(judge_turn(s, t, "How long was the longest dry spell in Sikar in 2014?", [])["pass"])

    def test_wrong_tool_fails(self):
        s = spec(calls=[{"tool": "monsoon_indicators", "args": {"district": "Sikar"}}])
        r = judge_turn(s, turn("x", calls=[call("reported_flood_months", district="Sikar")]), "q", [])
        self.assertFalse(r["pass"])
        self.assertFalse(r["tool_recall"])

    def test_guard_completion_counts_only_for_effective_args(self):
        s = spec(calls=[{"tool": "rank_districts", "args": {"metric": "flood_risk", "state": "Rajasthan"}}])
        c = call("rank_districts", metric="flood_risk")
        c["completed_args"] = {"state": "Rajasthan"}
        r = judge_turn(s, turn("Banswara 4.37", calls=[c]), "q", [])
        self.assertEqual((r["args_model_ok"], r["args_effective_ok"], r["args_total"]), (0, 1, 1))

    def test_ungrounded_number_is_an_unsupported_claim(self):
        r = judge_turn(spec(), turn("It was 143.4 mm.", results=[RES]), "q", [])
        self.assertIn("ungrounded_number", r["unsupported_claims"])
        self.assertFalse(r["pass"])

    def test_stale_forecast_must_be_flagged(self):
        s = spec(stale=True)
        self.assertFalse(judge_turn(s, turn("The forecast shows a peak of 2.3."), "q", [])["pass"])
        self.assertTrue(judge_turn(s, turn("This forecast is an expired archive."), "q", [])["pass"])

    def test_false_premise_needs_true_value_and_correction(self):
        s = spec(premise={"wrong": "9.5", "true": 0.94, "decimals": 2})
        self.assertFalse(judge_turn(s, turn("Yes, it is 9.5.", results=[]), "9.5?", [])["pass"])
        r = judge_turn(s, turn("No, the index is 0.94, not 9.5."), "9.5?", [])
        self.assertTrue(r["premise_ok"])

    def test_limit_behaviour(self):
        s = spec(behaviour="limit", address=[{"label": "limitation", "any_of": [r"not available|cannot"]}])
        self.assertTrue(judge_turn(s, turn("Predictions are not available.", status="unsupported"), "q", [])["pass"])
        self.assertFalse(judge_turn(s, turn("Yes it will flood.", status="verified"), "q", [])["pass"])

    def test_limit_lead_in_fallback_counts(self):
        s = spec(behaviour="limit", address=[{"label": "limitation", "any_of": [r"zzz"]}])
        self.assertTrue(judge_turn(s, turn("Limitation: village-level results are not available.", status="fallback"), "q", [])["pass"])

    def test_false_refusal_flagged(self):
        r = judge_turn(spec(), turn("Which district?", status="clarification"), "q", [])
        self.assertTrue(r["false_refusal"])
        self.assertFalse(r["pass"])

    def test_clarify_by_listing_candidates(self):
        amb = {"tool": "district_hazard_profile", "status": "ambiguous", "summary": "specify: A (State One); A (State Two)",
               "facts": [], "entities": {}, "semantics": {}, "provenance": [], "limitations": []}
        s = spec(behaviour="clarify")
        r = judge_turn(s, turn("Please say whether you mean State One or State Two.", results=[amb]), "q", [])
        self.assertTrue(r["behaviour_ok"])

    def test_forbidden_statement_ignores_disclaimers(self):
        s = spec(must_not=[r"\bprobabilit"])
        self.assertTrue(judge_turn(s, turn("This is not a probability."), "q", [])["pass"])
        self.assertFalse(judge_turn(s, turn("The probability is high."), "q", [])["pass"])

    def test_zero_count_may_be_words(self):
        s = spec(numbers=[{"value": 0, "decimals": 0}])
        self.assertTrue(judge_turn(s, turn("None were reported."), "q", [])["numbers_ok"])


if __name__ == "__main__":
    unittest.main()
