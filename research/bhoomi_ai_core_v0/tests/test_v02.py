"""v0.2: request frame, argument grounding, answer relevance, explicit limitations."""
import unittest

import support
from bhoomi_ai.agent import relevance
from bhoomi_ai.agent.argguard import check_arguments
from bhoomi_ai.agent.frame import parse_request
from bhoomi_ai.llm.base import LLMResponse, ToolCall
from bhoomi_ai.llm.scripted_backend import ScriptedBackend, call, say


def frame(text, ctx=None):
    return parse_request(text, support.env()[1], ctx or {})


class FrameTests(unittest.TestCase):
    def test_metrics_geography_period(self):
        f = frame("What was the June-September rainfall in Jaisalmer in 2009, and the longest dry spell?")
        self.assertIn("season_rain", f.metrics)
        self.assertIn("dry_spell", f.metrics)
        self.assertNotIn("month_rain", f.metrics)
        self.assertEqual(f.years, [2009])
        self.assertEqual([s for s, _ in f.unique_districts], ["Jaisalmer"])

    def test_single_month_is_month_rain(self):
        f = frame("How much rain fell in Kota in August 2019?")
        self.assertIn("month_rain", f.metrics)
        self.assertEqual(f.months, [8])

    def test_humid_heat_is_not_dry_heat(self):
        f = frame("Tell me the humid heat (wet-bulb) index of Churu.")
        self.assertEqual(f.metrics, ["wetbulb"])

    def test_july_august_share_is_not_month_rain(self):
        f = frame("What share of Barmer's 2015 monsoon rain fell in July and August?")
        self.assertIn("jul_aug_share", f.metrics)
        self.assertNotIn("month_rain", f.metrics)

    def test_state_order_and_top_n(self):
        f = frame("Which 3 Rajasthan districts have the lowest flood screening index?")
        self.assertEqual((f.states, f.order, f.top_n), (["Rajasthan"], "asc", 3))
        self.assertIn("ranking", f.qtypes)

    def test_question_types(self):
        self.assertIn("village", frame("Which villages in Kota are most at risk?").qtypes)
        self.assertIn("prediction", frame("Will Barmer flood in 2035?").qtypes)
        self.assertIn("causal", frame("Why did Jaipur flood in 2019?").qtypes)
        self.assertIn("comparison", frame("Compare Barmer and Jaisalmer drought index").qtypes)
        self.assertIn("definition", frame("What does PCI mean in the monsoon indicators?").qtypes)

    def test_context_year(self):
        f = frame("And what was the longest dry spell that year?", {"district": "Jaisalmer", "year": 2009})
        self.assertTrue(f.uses_context_year)


class ArgumentGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.store = support.env()[1]

    def g(self, tool, args, text, ctx=None):
        return check_arguments(tool, args, frame(text, ctx), text, self.store)

    def test_state_filter_is_completed_for_ranking(self):
        r = self.g("rank_districts", {"metric": "drought_risk"}, "Top 3 districts in Rajasthan by drought screening index?")
        self.assertEqual((r.args["state"], r.args["top_n"]), ("Rajasthan", 3))
        self.assertTrue(r.notes)

    def test_order_asc_completed(self):
        r = self.g("rank_districts", {"metric": "flood_risk", "state": "Rajasthan"},
                   "Which Rajasthan district has the lowest flood screening index?")
        self.assertEqual(r.args["order"], "asc")

    def test_ranking_metric_corrected_when_question_names_one_indicator(self):
        r = self.g("rank_districts", {"metric": "flood_risk", "state": "Rajasthan"},
                   "Which 3 Rajasthan districts have the highest dry heat index?")
        self.assertEqual(r.args["metric"], "heat_risk")

    def test_national_question_gets_no_state(self):
        r = self.g("rank_districts", {"metric": "cyclone_risk"}, "Which district in India has the highest cyclone screening index?")
        self.assertNotIn("state", r.args)

    def test_flood_window_completed(self):
        r = self.g("reported_flood_months", {"district": "Jaipur"}, "In which months between 2010 and 2020 was a flood reported in Jaipur?")
        self.assertEqual((r.args["year_from"], r.args["year_to"]), (2010, 2020))

    def test_flood_since_year(self):
        r = self.g("reported_flood_months", {"district": "Kota"}, "Have floods been reported in Kota since 2012?")
        self.assertEqual((r.args["year_from"], r.args["year_to"]), (2012, 2023))

    def test_year_completed_for_monsoon(self):
        r = self.g("monsoon_indicators", {"district": "Barmer"}, "Total monsoon-season rainfall in Barmer for 2012?")
        self.assertEqual(r.args["year"], 2012)

    def test_followup_year_from_context(self):
        r = self.g("monsoon_indicators", {"district": "Jaisalmer"}, "And what was the longest dry spell that year?",
                   {"district": "Jaisalmer", "year": 2009})
        self.assertEqual(r.args["year"], 2009)

    def test_month_completed(self):
        r = self.g("rainfall_features", {"district": "Kota", "year": 2019}, "How much rain fell in Kota in August 2019?")
        self.assertEqual(r.args["month"], 8)

    def test_wrong_district_is_a_conflict_not_overwritten(self):
        r = self.g("district_hazard_profile", {"district": "Udaipur"}, "What is the flood index of Kota?")
        self.assertTrue(r.conflicts)
        self.assertEqual(r.args["district"], "Udaipur")

    def test_correct_arguments_untouched(self):
        a = {"district": "Kota", "year": 2019, "month": 8}
        r = self.g("rainfall_features", dict(a), "How much rain fell in Kota in August 2019?")
        self.assertEqual((r.args, r.completed, r.conflicts), (a, {}, []))

    def test_state_added_to_disambiguate_duplicate_name(self):
        cache = support.env()[1].cache()["districts"]
        from collections import defaultdict
        by = defaultdict(set)
        for v in cache.values():
            by[v["district"]].add(v["state"])
        name = next(d for d, s in by.items() if len(s) > 1 and " " not in d and len(d) >= 4)
        st = sorted(by[name])[0]
        r = self.g("district_hazard_profile", {"district": name}, f"Flood screening index of {name} in {st}?")
        self.assertEqual(r.args.get("state"), st)


class RelevanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cfg, cls.store, cls.reg, cls.ver = support.env()

    def res(self, name, **args):
        a, e = self.reg.validate(name, args)
        self.assertEqual(e, [])
        r = self.reg.execute(name, a, support.ctx())
        support.numbered([r])
        return r

    def rules(self, text, results, answer):
        return {v.rule for v in relevance.check(frame(text), results, answer, text)}

    def test_dry_spell_question_answered_with_flood_records(self):
        r = self.res("reported_flood_months", district="Sikar")
        self.assertIn("relevance_metric_missing",
                      self.rules("How long was the longest dry spell in Sikar in 2014?", [r], "Sikar had no reported flood months."))

    def test_correct_tool_passes(self):
        r = self.res("monsoon_indicators", district="Sikar", year=2014)
        dry = next(f for f in r.facts if f.key == "dry_spell_max_days").value
        self.assertEqual(self.rules("How long was the longest dry spell in Sikar in 2014?", [r],
                                    f"Sikar's longest dry spell in 2014 was {dry:.0f} days."), set())

    def test_answer_must_state_the_figure(self):
        r = self.res("monsoon_indicators", district="Sikar", year=2014)
        self.assertIn("relevance_answer_omits_figure",
                      self.rules("How long was the longest dry spell in Sikar in 2014?", [r], "Sikar had a dry spell in 2014."))

    def test_answer_must_name_the_place(self):
        r = self.res("monsoon_indicators", district="Sikar", year=2014)
        dry = next(f for f in r.facts if f.key == "dry_spell_max_days").value
        self.assertIn("relevance_answer_omits_place",
                      self.rules("How long was the longest dry spell in Sikar in 2014?", [r], f"The dry spell was {dry:.0f} days."))

    def test_comparison_needs_both_districts(self):
        r = self.res("district_hazard_profile", district="Barmer")
        v = next(f for f in r.facts if f.key == "drought_risk").value
        self.assertTrue(self.rules("Compare the drought screening index of Barmer and Jaisalmer.", [r],
                                   f"Barmer's drought index is {v:.2f}.") & {"relevance_district_missing", "relevance_comparison_incomplete"})

    def test_state_ranking_needs_a_ranking_result(self):
        r = self.res("district_hazard_profile", district="Kota")
        self.assertIn("relevance_ranking_missing", self.rules(
            "Which Rajasthan district has the highest flood index?", [r], "Kota's flood index is 0.94."))

    def test_honest_not_available_statement_is_not_a_relevance_failure(self):
        r = self.res("wash_context", district="Dhaulpur")
        san = next(f for f in r.facts if f.key == "wash_sanitation_pct")
        txt = (f"Dhaulpur: a functional tap-connection value is not available in the data; improved sanitation is "
               f"{san.display()} [{san.id}].")
        self.assertEqual(self.rules("What percentage of households in Dhaulpur have a functional tap connection under JJM?", [r], txt), set())

    def test_unsupported_result_skips_metric_check(self):
        r = self.res("monsoon_indicators", district="Pune", year=2009)
        self.assertEqual(r.status, "unsupported")
        self.assertEqual(self.rules("Give the 2009 monsoon dry spell for Pune.", [r], "Pune is outside coverage."), set())


class PostBenchmarkFixes(unittest.TestCase):
    """Defects found by the frozen benchmark v2 run (regression tests; v2 itself is not re-scored)."""

    @classmethod
    def setUpClass(cls):
        cls.cfg, cls.store, cls.reg, cls.ver = support.env()

    def res(self, name, **a):
        r = self.reg.execute(name, self.reg.validate(name, a)[0], support.ctx())
        support.numbered([r])
        return r

    def test_overall_index_question_not_answered_with_another_indicator(self):
        r = self.res("monsoon_indicators", district="Barmer", year=2012)
        txt = "For overall hazard index of Barmer: it was 37.6 (on a scale of 0-100)."
        viol = relevance.check(frame("For Barmer give me the 2012 monsoon rainfall total, the longest dry spell and the overall hazard index."),
                               [r], txt, "overall hazard index Barmer 2012")
        self.assertIn("relevance_metric_missing", {v.rule for v in viol})

    def test_invented_scale_is_rejected(self):
        r = self.res("monsoon_indicators", district="Barmer", year=2012)
        rep = self.ver.verify("Barmer's concentration index was 37.6 on a scale of 0-100 [F3].", [r], "Barmer 2012 PCI")
        self.assertIn("scale_not_in_evidence", {v.rule for v in rep.violations})

    def test_scale_stated_by_the_tool_is_accepted(self):
        r = self.res("district_hazard_profile", district="Kota")
        rep = self.ver.verify("Kota's overall index is 4.03 on a 0-10 scale [F1].", [r], "Kota")
        self.assertNotIn("scale_not_in_evidence", {v.rule for v in rep.violations})

    def test_spelling_variants_resolve(self):
        for variant, canon in [("Dholpur", "Dhaulpur"), ("Jalore", "Jalor"), ("Sri Ganganagar", "Ganganagar")]:
            r = self.store.resolve(variant, None)
            self.assertEqual(r["status"], "ok", variant)
            self.assertTrue(r["matches"][0].endswith("|" + canon), variant)

    def test_unknown_names_still_not_found(self):
        self.assertEqual(self.store.resolve("Atlantisgarh", None)["status"], "not_found")

    def test_decline_is_explicit_not_a_raw_tool_description(self):
        be = ScriptedBackend([call("declare_unsupported", reason="future flood/heat/drought probabilities or predictions")])
        r = support.agent(be).run_turn(support.session(), "Will Jaisalmer see more floods in 2040?")
        self.assertEqual(r.status, "unsupported")
        self.assertTrue(r.answer.startswith("I can't answer this as asked:"))
        self.assertIn("predictions and future probabilities are not available", r.answer)

    def test_nearest_supported_is_human_readable_and_has_no_internal_names(self):
        be = ScriptedBackend([call("declare_unsupported", reason="prediction or probability beyond the stored forecast",
                                   nearest_supported="forecast_summary")])
        r = support.agent(be).run_turn(support.session(), "Will Barmer flood in 2035?")
        self.assertIn("stored week-long forecast", r.answer)
        self.assertNotIn("forecast_summary", r.answer)
        self.assertNotIn("beyond the stored forecast", r.answer)

    def test_ranking_question_answered_with_a_single_district_says_so(self):
        be = ScriptedBackend([call("district_hazard_profile", district="Kota"),
                              say("Kota's overall index is 4.03 [F1]."), say("Kota's overall index is 4.03 [F1].")])
        r = support.agent(be).run_turn(support.session(), "Which three Rajasthan districts have the highest drought screening index?")
        self.assertEqual(r.status, "fallback")
        self.assertTrue(r.answer.startswith("Limitation:"))
        self.assertIn("do not answer that question", r.answer)

    def test_decline_for_village_question(self):
        be = ScriptedBackend([call("declare_unsupported", reason="village level")])
        r = support.agent(be).run_turn(support.session(), "Which households in Churu lack tap water?")
        self.assertIn("district-level", r.answer)

    def test_template_text_contains_no_stray_numerals(self):
        be = ScriptedBackend([call("declare_unsupported", reason="prediction")])
        r = support.agent(be).run_turn(support.session(), "Will there be a drought in Barmer next year?")
        import re
        self.assertEqual(re.findall(r"\d+", r.answer), [])

    def test_alias_is_recognised_by_the_question_parser(self):
        f = frame("Has a flood ever been reported in Sri Ganganagar?")
        self.assertEqual([s for s, _ in f.unique_districts], ["Sri Ganganagar"])
        be = ScriptedBackend([call("ask_clarification", question="Which district?"),
                              call("reported_flood_months", district="Ganganagar"),
                              say("Ganganagar had reported flood months [F1].")])
        r = support.agent(be).run_turn(support.session(), "Has a flood ever been reported in Sri Ganganagar?")
        self.assertEqual(r.trace[0]["calls"][0].get("skipped", "")[:22], "clarification rejected")

    def test_out_of_range_year_is_explained(self):
        f = frame("How much rain fell in Kota in 1998?")
        self.assertEqual(f.out_of_range_years, [1998])
        be = ScriptedBackend([call("declare_unsupported", reason="year outside range")])
        r = support.agent(be).run_turn(support.session(), "How much rain fell in Kota in 1998?")
        self.assertIn("2000-2023", r.answer)


class VerifierFalsePositiveFixes(unittest.TestCase):
    """Found by the Bhoomi-LLM dataset pipeline (target answers run through the production verifier)."""

    @classmethod
    def setUpClass(cls):
        cls.cfg, cls.store, cls.reg, cls.ver = support.env()

    def res(self, name, **a):
        r = self.reg.execute(name, self.reg.validate(name, a)[0], support.ctx())
        support.numbered([r])
        return r

    def test_state_name_containing_a_district_name(self):
        cache = self.store.cache()["districts"]
        key = next(k for k, v in cache.items() if v["state"] == "Jammu & Kashmir" and v["population"] > 0 and v["district"] not in ("Jammu",))
        d = cache[key]["district"]
        r = self.res("district_hazard_profile", district=d)
        fk = next(f for f in r.facts if f.key == "hex_risk")
        rep = self.ver.verify(f"{d}, Jammu & Kashmir: the overall hazard index is {fk.display()} [{fk.id}].", [r], f"overall hazard index of {d}")
        self.assertNotIn("unexpected_place", {x.rule for x in rep.violations})

    def test_households_in_a_survey_indicator_is_not_a_resolution_claim(self):
        r = self.res("wash_context", district="Tonk")
        s = next(f for f in r.facts if f.key == "wash_sanitation_pct")
        q = "What share of households in Tonk have improved sanitation?"
        rep = self.ver.verify(f"In Tonk, {s.display()} of households have improved sanitation [{s.id}] (NFHS-5 survey estimate).", [r], q)
        self.assertEqual({x.rule for x in rep.violations}, set())

    def test_household_level_request_outside_a_survey_is_still_caught(self):
        r = self.res("district_hazard_profile", district="Jaipur")
        fk = next(f for f in r.facts if f.key == "hex_risk")
        rep = self.ver.verify(f"Overall index {fk.display()} [{fk.id}] for Jaipur.", [r], "Which households in Jaipur are most at risk?")
        self.assertIn("requested_resolution_unaddressed", {x.rule for x in rep.violations})

    def test_negative_value_can_be_cited(self):
        cache = self.store.cache()["districts"]
        k = next(k for k, v in cache.items() if (v.get("hist") or {}).get("rainfall_trend_mm_decade") is not None
                 and v["hist"]["rainfall_trend_mm_decade"] < -1 and True)
        d = cache[k]["district"]
        r = self.res("historical_climate", district=d, **({"state": cache[k]["state"]} if len(self.store.resolve(d, None)["matches"]) > 1 else {}))
        tr = next(f for f in r.facts if f.key == "rainfall_trend_mm_decade")
        rep = self.ver.verify(f"ERA5 reanalysis for {d}: the rainfall trend is {tr.display()} [{tr.id}].", [r], f"rainfall trend in {d}")
        self.assertNotIn("citation_mismatch", {x.rule for x in rep.violations})

    def test_negative_value_can_be_stated(self):
        cache = self.store.cache()["districts"]
        k = next(k for k, v in cache.items() if (v.get("hist") or {}).get("rainfall_trend_mm_decade") is not None
                 and v["hist"]["rainfall_trend_mm_decade"] < -1 and len(self.store.resolve(cache[k]["district"], None)["matches"]) == 1)
        d = cache[k]["district"]
        r = self.res("historical_climate", district=d)
        tr = next(f for f in r.facts if f.key == "rainfall_trend_mm_decade")
        rep = self.ver.verify(f"ERA5 reanalysis for {d}: the rainfall trend is {tr.display()} [{tr.id}].", [r], f"rainfall trend in {d}")
        self.assertEqual({x.rule for x in rep.violations} - {"unexpected_place"}, set())

    def test_imperative_report_is_not_reported_floods(self):
        self.assertNotIn("reported_floods", frame("Report the flood index of Kota.").metrics)
        self.assertIn("reported_floods", frame("Were floods reported in Kota in 2012?").metrics)
        self.assertIn("reported_floods", frame("Show the flood records of Kota.").metrics)

    def test_name_that_is_both_state_and_district(self):
        f = frame("Compare the drought index of Saran and Puducherry.")
        self.assertIn("Puducherry", [s for s, _ in f.districts])

    def test_rainfall_trend_is_its_own_metric(self):
        f = frame("Describe Sivasagar's long-term rainfall trend.")
        self.assertIn("rain_trend", f.metrics)
        self.assertNotIn("era5_rain", f.metrics)
        self.assertIn("era5_rain", frame("What is the mean annual rainfall and the rainfall trend of Kota?").metrics)

    def test_probability_of_an_event_is_not_reported_floods(self):
        f = frame("Is Kota's flood index a probability of an event?")
        self.assertNotIn("reported_floods", f.metrics)
        self.assertIn("reported_floods", frame("Which months were flood events reported in Kota?").metrics)

    def test_hyphenated_code_digit_is_not_a_figure(self):
        r = self.res("wash_context", district="Tonk")
        s = next(f for f in r.facts if f.key == "wash_sanitation_pct")
        rep = self.ver.verify(f"{s.display()} of households have improved sanitation [{s.id}] (NFHS-5).", [r], "Tonk sanitation")
        self.assertNotIn("indicator_mismatch", {x.rule for x in rep.violations})


class OrchestrationV02(unittest.TestCase):
    def run_turn(self, script, text, **kw):
        be = ScriptedBackend(script)
        ag = support.agent(be, **kw)
        return ag.run_turn(support.session(), text), be

    def test_dropped_state_filter_is_completed_and_disclosed(self):
        r, _ = self.run_turn([call("rank_districts", metric="drought_risk"),
                              say("In Rajasthan, Jaisalmer has the highest drought screening index, 5.24 "
                                  "(index, 0-10 scale) [F1].")],
                             "Top 3 districts in Rajasthan by drought screening index?")
        self.assertEqual(r.status, "verified")
        self.assertEqual(r.trace[0]["calls"][0]["completed_args"]["state"], "Rajasthan")
        self.assertTrue(any("state=Rajasthan" in n for n in r.notes))
        self.assertEqual(r.results[0]["entities"]["state"], "Rajasthan")

    def test_wrong_tool_for_dry_spell_is_repaired_by_calling_the_right_one(self):
        r, be = self.run_turn([call("reported_flood_months", district="Sikar"),
                               say("Sikar had no reported flood months."),
                               call("monsoon_indicators", district="Sikar", year=2014),
                               say("Sikar's longest dry spell in 2014 was 25 days [F5].")],
                              "How long was the longest dry spell in Sikar in 2014?")
        tools = [c["name"] for s in r.trace for c in s["calls"]]
        self.assertIn("monsoon_indicators", tools)
        self.assertEqual(r.status, "verified")
        self.assertIn("dry spell", r.answer)

    def test_unfixed_wrong_tool_returns_explicit_limitation(self):
        r, _ = self.run_turn([call("reported_flood_months", district="Sikar"), say("Sikar had no reported flood months."),
                              say("Sikar had no reported flood months.")],
                             "How long was the longest dry spell in Sikar in 2014?")
        self.assertEqual(r.status, "fallback")
        self.assertTrue(r.answer.startswith("Limitation:"))
        self.assertIn("longest dry spell", r.answer)

    def test_village_question_gets_explicit_limitation_when_model_substitutes(self):
        r, _ = self.run_turn([call("rank_districts", metric="flood_risk", state="Rajasthan", top_n=3),
                              say("The top districts are Banswara with 4.37 [F1]."),
                              say("The top districts are Banswara with 4.37 [F1].")],
                             "Which villages in Kota are most at risk of flooding?")
        self.assertEqual(r.status, "fallback")
        self.assertIn("village", r.answer.split("\n")[0].lower())
        self.assertIn("district-level", r.answer)

    def test_future_question_without_tools_gets_explicit_limitation(self):
        r, _ = self.run_turn([say("Barmer will be flooded in 2035."), say("Barmer will be flooded in 2035.")],
                             "Will Barmer flood in 2035?")
        self.assertEqual(r.status, "no_evidence")
        self.assertIn("not available", r.answer)

    def test_guard_conflict_returned_to_model_once(self):
        r, be = self.run_turn([call("district_hazard_profile", district="Udaipur"),
                               call("district_hazard_profile", district="Kota"),
                               say("Kota overall index is 4.03 (index, 0-10 scale) [F1].")],
                              "What is the overall hazard index of Kota?")
        self.assertEqual(r.status, "verified")
        self.assertTrue(r.trace[0]["calls"][0].get("guard_conflict"))
        self.assertEqual(r.results[0]["entities"]["district"], "Kota")


if __name__ == "__main__":
    unittest.main()
