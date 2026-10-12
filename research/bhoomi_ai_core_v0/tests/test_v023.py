"""v0.2.3: dependent multi-step coherence. Found in interactive testing of the experimental model: a ranking's top district
(Jaipur) was paired with another district's sanitation (Jaisalmer) and every figure was individually grounded."""
import unittest

from support import ctx, env, agent, session

from bhoomi_ai.agent import relevance
from bhoomi_ai.agent.frame import parse_request
from bhoomi_ai.llm.scripted_backend import ScriptedBackend, call, say

Q = "Which Rajasthan district has the highest dry heat index, and what share of its households have improved sanitation?"


def run(*calls_):
    c = ctx()
    out = []
    for name, args in calls_:
        out.append(env()[2].execute(name, args, c))
    return out


def rule_names(question, results, answer=""):
    _, store, _, _ = env()
    return [v.rule for v in relevance.check(parse_request(question, store, {}), results, answer, question)]


class DependentEntity(unittest.TestCase):
    def test_wrong_district_for_the_second_hop_is_flagged(self):
        rs = run(("rank_districts", {"metric": "heat_risk", "state": "Rajasthan"}), ("wash_context", {"district": "Jaisalmer"}))
        self.assertIn("relevance_dependent_entity_mismatch", rule_names(Q, rs))

    def test_the_ranked_district_passes(self):
        rs = run(("rank_districts", {"metric": "heat_risk", "state": "Rajasthan"}), ("wash_context", {"district": "Jaipur"}))
        self.assertNotIn("relevance_dependent_entity_mismatch", rule_names(Q, rs))

    def test_lowest_uses_the_first_row_of_the_ascending_ranking(self):
        q = "Which Rajasthan district has the lowest dry heat index, and what share of its households have improved sanitation?"
        asc = run(("rank_districts", {"metric": "heat_risk", "state": "Rajasthan", "order": "asc"}))
        low = asc[0].data["rows"][0]["district"]
        ok = asc + run(("wash_context", {"district": low}))
        bad = asc + run(("wash_context", {"district": "Jaipur"}))
        self.assertNotIn("relevance_dependent_entity_mismatch", rule_names(q, ok))
        self.assertIn("relevance_dependent_entity_mismatch", rule_names(q, bad))

    def test_top_three_allows_any_of_the_three(self):
        q = "Which three Rajasthan districts have the highest dry heat index, and what is the sanitation access in each?"
        r = run(("rank_districts", {"metric": "heat_risk", "state": "Rajasthan", "top_n": 3}))
        top3 = [x["district"] for x in r[0].data["rows"][:3]]
        ok = r + run(*[("wash_context", {"district": d}) for d in top3])
        bad = r + run(("wash_context", {"district": "Jaisalmer"}))        # 4th place
        self.assertNotIn("relevance_dependent_entity_mismatch", rule_names(q, ok))
        self.assertIn("relevance_dependent_entity_mismatch", rule_names(q, bad))

    def test_a_district_named_by_the_user_is_not_constrained(self):
        q = "Which Rajasthan district has the highest dry heat index, and what is the sanitation access in Jaisalmer?"
        rs = run(("rank_districts", {"metric": "heat_risk", "state": "Rajasthan"}), ("wash_context", {"district": "Jaisalmer"}))
        self.assertNotIn("relevance_dependent_entity_mismatch", rule_names(q, rs))

    def test_single_tool_questions_are_unaffected(self):
        rs = run(("district_hazard_profile", {"district": "Kota"}))
        self.assertNotIn("relevance_dependent_entity_mismatch", rule_names("What is the overall hazard index of Kota?", rs))

    def test_agent_never_returns_the_mismatched_pair_as_a_verified_answer(self):
        be = ScriptedBackend([call("rank_districts", metric="heat_risk", state="Rajasthan"),
                              call("wash_context", district="Jaisalmer"),
                              say("In Rajasthan, Jaipur has the highest dry heat screening index, 1.93 (index, 0-10 scale) [F1]. "
                                  "In Jaisalmer, 75.7% [F7] of households have improved sanitation (NFHS-5 survey estimate)."),
                              say("still the same")])
        t = agent(be).run_turn(session(), Q).to_dict()
        self.assertNotEqual(t["status"], "verified")
        self.assertIn("relevance_dependent_entity_mismatch", [v["rule"] for v in t["verification"]["violations"]])


if __name__ == "__main__":
    unittest.main()


class SurveyHouseholdsAreNotAVillageRequest(unittest.TestCase):
    """The fallback lead must not claim 'household-level results are not available' for a district-level survey indicator."""

    def _lead(self, question, *calls_):
        from bhoomi_ai.agent.orchestrator import Agent
        results = run(*calls_)
        _, store, _, _ = env()
        frame = parse_request(question, store, {})
        return Agent._limitation_lead([], frame, results, question)

    def test_share_of_households_with_improved_sanitation_gets_no_village_limitation(self):
        lead = self._lead(Q, ("wash_context", {"district": "Jaipur"}))
        self.assertNotIn("village-", lead)

    def test_real_household_level_requests_still_get_the_limitation(self):
        lead = self._lead("Which households in Kota lack tap water?", ("wash_context", {"district": "Kota"}))
        self.assertIn("village-", lead)
        lead = self._lead("Which villages in Kota are most at risk of floods?", ("district_hazard_profile", {"district": "Kota"}))
        self.assertIn("village-", lead)

    def test_listing_households_never_exempt_even_with_a_survey_result(self):
        for q in ("Which households in Kota lack tap water?", "Which households have improved sanitation in Kota?",
                  "List the households in Kota without toilets."):
            with self.subTest(q=q):
                self.assertIn("village-", self._lead(q, ("wash_context", {"district": "Kota"})))
