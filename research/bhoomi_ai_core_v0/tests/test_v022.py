"""v0.2.2 regression tests: deterministic limitation statements are grounded; the frozen judge is untouched.

The nine fixture cases are the Stage-1 development conversations (dev_v3, NOT the frozen test set) on which the frozen judge
reported "ungrounded numbers [2000, 2023, 7]" for the system's own refusal text, for every model.
"""
import hashlib
import json
import sys
import unittest
from pathlib import Path

from support import ROOT, agent, session

from bhoomi_ai.llm.scripted_backend import ScriptedBackend, call

sys.path.insert(0, str(ROOT / "evals"))
from judge_v2 import judge_conversation, numbers  # noqa: E402  (frozen judge, imported verbatim)

FIX = json.loads((ROOT / "tests" / "fixtures" / "refusal_cases_dev_v3.json").read_text())["items"]
FROZEN_JUDGE_SHA = "f1b4756d7838d34ce174b215ddeabb1050cc9746d0a21f6da0385c2098deb295"


def run_item(item, nearest):
    q = item["turns"][0]["text"]
    reason = ("a year outside the data range" if "oor_year" in item["id"] else
              "a prediction beyond the stored forecast; predictions and probabilities are not available")
    be = ScriptedBackend([call("declare_unsupported", reason=reason, nearest_supported=nearest)])
    ag = agent(be)
    s = session()
    turn = ag.run_turn(s, q).to_dict()
    return turn, judge_conversation(item, [turn])


class NineRefusalCases(unittest.TestCase):
    def test_fixture_has_the_nine_cases(self):
        self.assertEqual(len(FIX), 9)
        self.assertEqual(sorted({i["category"] for i in FIX}), ["inject", "oor_year", "predict"])

    def test_each_case_passes_the_frozen_judge_for_every_nearest_tool(self):
        for item in FIX:
            for nearest in ("monsoon_indicators", "forecast_summary", "district_hazard_profile", ""):
                with self.subTest(item=item["id"], nearest=nearest):
                    turn, j = run_item(item, nearest)
                    t = j["turns"][0]
                    self.assertEqual(turn["status"], "unsupported")
                    self.assertEqual(t["ungrounded_numbers"], [], t["reasons"])
                    self.assertTrue(t["behaviour_ok"], t["reasons"])
                    self.assertEqual(t["unsupported_claims"], [])
                    self.assertTrue(j["pass"], t["reasons"])

    def test_cited_coverage_figures_are_carried_as_evidence(self):
        item = next(i for i in FIX if i["category"] == "oor_year")
        turn, _ = run_item(item, "monsoon_indicators")
        cov = [r for r in turn["results"] if r["tool"] == "coverage_statement"]
        self.assertEqual(len(cov), 1)
        self.assertIn("2000-2023", cov[0]["summary"])
        self.assertIn("2023", turn["answer"])
        for n in numbers(turn["answer"]):
            self.assertIn(n, set(numbers(cov[0]["summary"])))

    def test_no_coverage_entry_when_no_coverage_figure_is_cited(self):
        be = ScriptedBackend([call("declare_unsupported", reason="causal attribution is not available",
                                   nearest_supported="district_hazard_profile")])
        ag = agent(be)
        turn = ag.run_turn(session(), "Why did Dausa flood?").to_dict()
        self.assertEqual(turn["status"], "unsupported")
        self.assertFalse([r for r in turn["results"] if r["tool"] == "coverage_statement"])


class CoverageIsNotALaunderingChannel(unittest.TestCase):
    def test_unrelated_numbers_are_not_grounded_by_the_coverage_entry(self):
        from bhoomi_ai.agent.orchestrator import TurnResult
        be = ScriptedBackend([])
        ag = agent(be)
        out = TurnResult(session_id="x", status="verified", answer="The value is 7 and the year was 2023 by my guess.")
        ag._ground_coverage(out)
        self.assertEqual(out.results, [])

    def test_wrong_coverage_claim_is_not_grounded(self):
        from bhoomi_ai.agent.orchestrator import TurnResult
        ag = agent(ScriptedBackend([]))
        out = TurnResult(session_id="x", status="verified", answer="Records cover 1990-2023 only.")
        ag._ground_coverage(out)
        self.assertEqual(out.results, [])

    def test_coverage_comes_from_configuration_and_forecast_meta(self):
        _, store = __import__("support").env()[:2]
        self.assertEqual(store.coverage(), {"records_year_from": 2000, "records_year_to": 2023, "forecast_days": 7})


class FrozenArtefactsUnchanged(unittest.TestCase):
    def test_frozen_judge_is_byte_identical_to_the_frozen_hash(self):
        h = hashlib.sha256((ROOT / "evals" / "judge_v2.py").read_bytes()).hexdigest()
        self.assertEqual(h, FROZEN_JUDGE_SHA)

    def test_registry_rubric_hashes_still_match_when_registry_is_present(self):
        reg = ROOT.parent / "bhoomi_llm_v1" / "registry" / "datasets.json"
        if not reg.exists():
            self.skipTest("llm_v1 registry not present")
        e = json.loads(reg.read_text())["datasets"]["test_v3"]
        for p, h in e["rubric_sha256"].items():
            pp = Path(p)
            if not pp.exists():          # absolute path of another machine
                self.skipTest("rubric files at registered absolute paths not present")
            self.assertEqual(hashlib.sha256(pp.read_bytes()).hexdigest(), h, p)


class KnownVerificationIssuesStayCovered(unittest.TestCase):
    """Traceability: every defect in CHANGELOG v0.2.1 keeps a named regression test in test_v02.py."""

    REQUIRED = [
        ("state name containing a district name", "Jammu"), ("households inside an indicator", "households"),
        ("negative values can be cited", "test_negative_value_can_be_cited"), ("negative values can be stated", "test_negative_value_can_be_stated"),
        ("digit glued by hyphen (NFHS-5)", "NFHS-5"), ("imperative report is not reported floods", "Report the flood index"),
        ("name that is both state and district", "Puducherry"), ("rainfall trend is its own metric", "rainfall trend"),
        ("honest not-available statement", "not available in the data"),
    ]

    def test_each_issue_has_a_regression_test(self):
        src = (ROOT / "tests" / "test_v02.py").read_text()
        for label, needle in self.REQUIRED:
            with self.subTest(issue=label):
                self.assertIn(needle, src)


if __name__ == "__main__":
    unittest.main()
