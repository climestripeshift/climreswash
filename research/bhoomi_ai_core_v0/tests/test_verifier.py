import unittest
from collections import defaultdict

import support


class VerifierBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cfg, cls.store, cls.reg, cls.ver = support.env()

    def result(self, name, now=support.CLOCK_EXPIRED, **args):
        a, e = self.reg.validate(name, args)
        self.assertEqual(e, [])
        r = self.reg.execute(name, a, support.ctx(now))
        support.numbered([r])
        return r

    def rules(self, text, results, user="", refusal=False):
        rep = self.ver.verify(text, results, user, refusal=refusal)
        return {v.rule for v in rep.violations}, rep


class NumericAndUnitTests(VerifierBase):
    def test_correct_answer_passes(self):
        r = self.result("monsoon_indicators", district="Jaisalmer", year=2009)
        ok, rep = self.rules("Jaisalmer's JJAS rainfall in 2009 was 126.4 mm [F1] with a longest dry spell of 32 days [F2]. "
                             "This is a CHIRPS satellite-gauge estimate.", [r], "Jaisalmer 2009")
        self.assertEqual(ok, set(), rep.violations)

    def test_hallucinated_number_rejected(self):
        r = self.result("monsoon_indicators", district="Jaisalmer", year=2009)
        ok, _ = self.rules("JJAS rainfall was 143.4 mm [F1].", [r], "Jaisalmer 2009")
        self.assertIn("number_not_in_evidence", ok)

    def test_wrong_units_correct_numbers(self):
        r = self.result("monsoon_indicators", district="Jaisalmer", year=2009)
        ok, _ = self.rules("Rainfall was 126.4 days and the dry spell lasted 32 mm [F1].", [r], "Jaisalmer 2009")
        self.assertIn("unit_mismatch", ok)

    def test_percent_and_mm_are_not_interchangeable(self):
        r = self.result("monsoon_indicators", district="Jaisalmer", year=2009)
        ok, _ = self.rules("The July-August share was 86.4 mm [F1].", [r], "Jaisalmer 2009")
        self.assertIn("unit_mismatch", ok)

    def test_unitless_value_given_a_unit(self):
        r = self.result("monsoon_indicators", district="Jaisalmer", year=2009)
        ok, _ = self.rules("The concentration index was 49.8 mm [F1].", [r], "Jaisalmer 2009")
        self.assertIn("unit_mismatch", ok)

    def test_rounding_is_allowed(self):
        r = self.result("monsoon_indicators", district="Jaisalmer", year=2009)
        ok, _ = self.rules("Rainfall was about 126 mm [F1].", [r], "Jaisalmer 2009")
        self.assertEqual(ok, set())

    def test_population_in_millions_checked(self):
        r = self.result("district_hazard_profile", district="Jodhpur")
        ok, _ = self.rules("Jodhpur has 3.9 million people [F13]. Index values are screening indices [F1].", [r], "Jodhpur")
        self.assertNotIn("number_not_in_evidence", ok)
        ok2, _ = self.rules("Jodhpur has 7.9 million people [F13].", [r], "Jodhpur")
        self.assertIn("number_not_in_evidence", ok2)

    def test_unknown_fact_id(self):
        r = self.result("monsoon_indicators", district="Jaisalmer", year=2009)
        ok, _ = self.rules("Rainfall was 126.4 mm [F99].", [r], "Jaisalmer 2009")
        self.assertIn("unknown_fact_id", ok)

    def test_date_not_in_evidence(self):
        r = self.result("monsoon_indicators", district="Jaisalmer", year=2009)
        ok, _ = self.rules("The onset proxy date was 2009-07-19 [F1], a provisional proxy.", [r], "Jaisalmer 2009")
        self.assertIn("date_not_in_evidence", ok)
        ok2, _ = self.rules("The provisional onset proxy date was 2009-07-09 [F1].", [r], "Jaisalmer 2009")
        self.assertNotIn("date_not_in_evidence", ok2)

    def test_forecast_value_attached_to_wrong_date(self):
        r = self.result("forecast_summary", district="Jaipur")
        ok, _ = self.rules("This expired forecast gave 2.33 on 2026-09-09 [F6].", [r], "Jaipur forecast")
        self.assertIn("date_value_mismatch", ok)
        ok2, _ = self.rules("This expired forecast gave 2.33 on September 15 [F12].", [r], "Jaipur forecast")
        self.assertNotIn("date_value_mismatch", ok2)


class PlaceTests(VerifierBase):
    def test_unresolved_district_rejected(self):
        r = self.result("district_hazard_profile", district="Jodhpur")
        ok, _ = self.rules("Jodhpur and Udaipur both score 4.76 [F1].", [r], "Jodhpur")
        self.assertIn("unexpected_place", ok)

    def test_same_name_district_wrong_state(self):
        cache = self.store.cache()["districts"]
        by = defaultdict(set)
        for v in cache.values():
            by[v["district"]].add(v["state"])
        name, states = next((d, sorted(s)) for d, s in by.items() if len(s) > 1 and " " not in d)
        r = self.result("district_hazard_profile", district=name, state=states[0])
        other = states[1]
        txt = f"{name} {other} has an overall index of {r.facts[-1].value if False else ''}"
        ok, _ = self.rules(f"The profile of {name} {other} is shown [F1].", [r], f"{name} in {states[0]}")
        self.assertIn("wrong_state_for_district", ok)
        ok2, _ = self.rules(f"The profile of {name} {states[0]} is shown [F1].", [r], f"{name} in {states[0]}")
        self.assertNotIn("wrong_state_for_district", ok2)

    def test_ambiguity_result_allows_candidates_only(self):
        cache = self.store.cache()["districts"]
        by = defaultdict(set)
        for v in cache.values():
            by[v["district"]].add(v["state"])
        name = next(d for d, s in by.items() if len(s) > 1)
        r = self.result("district_hazard_profile", district=name)
        self.assertEqual(r.status, "ambiguous")
        ok, _ = self.rules(f"There are several: {', '.join(sorted(by[name]))}.", [r], name)
        self.assertNotIn("unexpected_place", ok)


class ClaimTypeTests(VerifierBase):
    def test_index_called_probability(self):
        r = self.result("district_hazard_profile", district="Jodhpur")
        ok, _ = self.rules("Jodhpur has a 4.76 percent probability of flooding [F1].", [r], "Jodhpur")
        self.assertIn("index_as_probability", ok)

    def test_disclaimer_about_probability_is_allowed(self):
        r = self.result("district_hazard_profile", district="Jodhpur")
        ok, _ = self.rules("The overall screening index is 4.76 (index, 0-10 scale) [F1]. It is not a probability.", [r], "Jodhpur")
        self.assertEqual(ok, set())

    def test_future_claim_rejected(self):
        r = self.result("district_hazard_profile", district="Jodhpur")
        ok, _ = self.rules("Jodhpur will flood by 2035 with an index of 4.76 [F1].", [r], "Jodhpur")
        self.assertIn("unsupported_prediction", ok)

    def test_causal_claim_rejected(self):
        r = self.result("district_hazard_profile", district="Jodhpur")
        ok, _ = self.rules("The index of 4.76 [F1] is caused by climate change.", [r], "Jodhpur")
        self.assertIn("unsupported_causal_claim", ok)

    def test_reanalysis_described_as_observation(self):
        r = self.result("historical_climate", district="Barmer")
        mean = r.facts[0].value
        ok, _ = self.rules(f"Barmer's observed rainfall averages {mean:.0f} mm per year [F1].", [r], "Barmer")
        self.assertIn("observation_vs_estimate", ok)
        ok2, _ = self.rules(f"ERA5 reanalysis gives Barmer a mean of {mean:.0f} mm per year [F1].", [r], "Barmer")
        self.assertNotIn("observation_vs_estimate", ok2)

    def test_village_level_claim_rejected(self):
        r = self.result("district_hazard_profile", district="Jodhpur")
        ok, _ = self.rules("Villages in Jodhpur are at an index of 4.76 [F1].", [r], "Jodhpur")
        self.assertIn("resolution_overclaim", ok)
        ok2, _ = self.rules("The overall index is 4.76 [F1]; it does not describe villages.", [r], "Jodhpur")
        self.assertNotIn("resolution_overclaim", ok2)

    def test_absence_of_flood_report_is_not_no_flood(self):
        r = self.result("reported_flood_months", district="Barmer", year_from=2015, year_to=2020)
        ok, _ = self.rules("There were no floods in Barmer in 2017 [F1].", [r], "Barmer")
        self.assertIn("absence_as_evidence", ok)

    def test_cv_called_monsoon_reliability(self):
        r = self.result("historical_climate", district="Barmer")
        cv = next(f for f in r.facts if f.key == "rainfall_cv")
        ok, _ = self.rules(f"Barmer's monsoon reliability is {cv.value:.2f} [F3] from ERA5 reanalysis.", [r], "Barmer")
        self.assertIn("misnamed_indicator", ok)

    def test_onset_must_be_proxy_not_imd(self):
        r = self.result("monsoon_indicators", district="Jaisalmer", year=2009)
        ok, _ = self.rules("The IMD onset was 2009-07-09 [F11].", [r], "Jaisalmer 2009")
        self.assertIn("onset_proxy_as_imd", ok)
        ok2, _ = self.rules("The onset was 2009-07-09 [F11].", [r], "Jaisalmer 2009")
        self.assertIn("onset_not_labelled_proxy", ok2)

    def test_rajasthan_result_generalised_to_india(self):
        r = self.result("monsoon_indicators", district="Jaisalmer", year=2009)
        ok, _ = self.rules("Across India, rainfall in the monsoon was 126.4 mm [F1].", [r], "Jaisalmer 2009")
        self.assertIn("coverage_overreach", ok)

    def test_quoted_passages_are_exempt_from_causal_rule(self):
        r = self.result("method_notes", topic="monsoon onset proxy")
        self.assertEqual(r.status, "ok")
        passage = r.data["passages"][0]["text"][:90].replace('"', "'")
        ok, _ = self.rules(f'The documentation says: "{passage}" [F1].', [r], "how is onset defined")
        self.assertNotIn("unsupported_causal_claim", ok)


class StaleForecastTests(VerifierBase):
    def test_expired_forecast_must_be_flagged(self):
        r = self.result("forecast_summary", district="Jaipur")
        ok, _ = self.rules("Jaipur's forecast peaks at 2.33 on September 15 [F12].", [r], "Jaipur forecast")
        self.assertIn("stale_forecast_not_flagged", ok)

    def test_present_tense_for_stale_forecast_rejected(self):
        r = self.result("forecast_summary", district="Jaipur")
        ok, _ = self.rules("Today the forecast is expired but rises to 2.33 on September 15 [F12].", [r], "Jaipur forecast")
        self.assertIn("stale_forecast_deictic", ok)

    def test_properly_flagged_stale_forecast_passes(self):
        r = self.result("forecast_summary", district="Jaipur")
        ok, rep = self.rules("This forecast is an expired archive issued 2026-09-09 and valid 2026-09-09 to 2026-09-15 [F1]. "
                             "Its highest daily index was 2.33 [F12].", [r], "Jaipur forecast")
        self.assertEqual(ok, set(), rep.violations)

    def test_current_forecast_needs_no_flag(self):
        r = self.result("forecast_summary", now=support.CLOCK_CURRENT, district="Jaipur")
        ok, _ = self.rules("The highest daily index is 2.33 [F12] this week.", [r], "Jaipur forecast")
        self.assertNotIn("stale_forecast_not_flagged", ok)


class EvidenceRequiredTests(VerifierBase):
    def test_no_tool_answer_cannot_discuss_hazards(self):
        ok, _ = self.rules("Jodhpur is prone to drought and heat.", [], "tell me about Jodhpur")
        self.assertIn("ungrounded_claim", ok)

    def test_no_tool_greeting_passes(self):
        ok, _ = self.rules("Hello! Ask me about a district.", [], "hi")
        self.assertEqual(ok, set())

    def test_refusal_may_name_what_it_declines(self):
        ok, _ = self.rules("I cannot give future flood probabilities for Barmer.", [], "Will Barmer flood in 2035?", refusal=True)
        self.assertEqual(ok, set())

    def test_number_in_user_text_is_allowed(self):
        ok, _ = self.rules("I cannot predict 2035.", [], "Will it flood in 2035?", refusal=True)
        self.assertNotIn("number_not_in_evidence", ok)


if __name__ == "__main__":
    unittest.main()


class FalsePositiveRegressionTests(VerifierBase):
    """Phrasings that were wrongly rejected in the first held-out run."""

    def test_degrees_per_decade(self):
        r = self.result("historical_climate", district="Ajmer")
        tr = next(f for f in r.facts if f.key == "temp_trend_c_decade")
        ok, rep = self.rules(f"ERA5 reanalysis shows warming of {tr.value:.2f} °C per decade [{tr.id}].", [r], "Ajmer")
        self.assertNotIn("unit_mismatch", ok, rep.violations)

    def test_state_named_in_coverage_note_is_allowed(self):
        r = self.result("describe_capabilities")
        ok, _ = self.rules("Some tools cover Rajasthan only.", [r], "what can you do")
        self.assertNotIn("unexpected_place", ok)

    def test_count_from_coverage_text_is_allowed(self):
        r = self.result("describe_capabilities")
        ok, _ = self.rules("The monsoon tools cover the 33 historical districts of Rajasthan.", [r], "what can you do")
        self.assertNotIn("number_not_in_evidence", ok)


class ScopeTests(VerifierBase):
    def test_state_question_answered_from_national_ranking_is_rejected(self):
        r = self.result("rank_districts", metric="drought_risk", order="asc", top_n=3)
        d = r.data["rows"][0]
        ok, _ = self.rules(f"The Rajasthan district with the lowest drought index is {d['district']}, "
                           f"{d['state']} with {r.facts[0].value:.2f} [F1].", [r],
                           "Which Rajasthan district has the lowest drought index?")
        self.assertIn("scope_not_applied", ok)

    def test_state_scoped_ranking_passes(self):
        r = self.result("rank_districts", metric="drought_risk", order="asc", top_n=3, state="Rajasthan")
        d = r.data["rows"][0]
        ok, _ = self.rules(f"The lowest drought index in Rajasthan is {d['district']} at {r.facts[0].value:.2f} [F1].",
                           [r], "Which Rajasthan district has the lowest drought index?")
        self.assertNotIn("scope_not_applied", ok)

    def test_national_question_not_affected(self):
        r = self.result("rank_districts", metric="drought_risk", top_n=3)
        d = r.data["rows"][0]
        ok, _ = self.rules(f"The highest drought index in India is {d['district']}, {d['state']} at "
                           f"{r.facts[0].value:.2f} [F1].", [r], "Which district in India has the highest drought index?")
        self.assertNotIn("scope_not_applied", ok)


class SubstitutionAndPeriodTests(VerifierBase):
    """Regressions: wrong period, tool-call text and substituted answers released as 'verified' in the second full run."""

    def test_flood_window_not_applied(self):
        r = self.result("reported_flood_months", district="Jaipur")     # defaults 2000-2023
        ok, _ = self.rules("Floods were reported in Jaipur in 2000-08 and 2004-07 between 2010 and 2020.", [r],
                           "In which months between 2010 and 2020 was a flood reported in Jaipur?")
        self.assertIn("period_not_applied", ok)

    def test_flood_window_applied(self):
        r = self.result("reported_flood_months", district="Kota", year_from=2015, year_to=2020)
        ok, _ = self.rules("Reported flood months in Kota between 2015 and 2020 include 2016-08.", [r],
                           "In which months between 2015 and 2020 was a flood reported in Kota?")
        self.assertNotIn("period_not_applied", ok)

    def test_since_year_window(self):
        r = self.result("reported_flood_months", district="Kota", year_from=2010, year_to=2023)
        ok, _ = self.rules("Reported flood months in Kota since 2010 include 2016-08.", [r], "Floods reported in Kota since 2010?")
        self.assertNotIn("period_not_applied", ok)

    def test_season_total_for_a_year_needs_that_year(self):
        r = self.result("monsoon_indicators", district="Jaisalmer")      # no year -> long-term descriptive facts only
        mean = next(f for f in r.facts if f.key == "jjas_mean_mm").value
        ok, _ = self.rules(f"Jaisalmer received {mean:.1f} mm in 2009.", [r], "Monsoon rainfall in Jaisalmer in 2009?")
        self.assertIn("period_not_applied", ok)

    def test_tool_call_markup_is_never_an_answer(self):
        r = self.result("district_hazard_profile", district="Kota")
        ok, _ = self.rules('<tool_call> {"name": "district_hazard_profile", "arguments": {"district": "Kota"}} </tool_call>',
                           [r], "Kota")
        self.assertIn("tool_call_text_in_answer", ok)

    def test_village_question_answered_with_district_data_is_rejected(self):
        r = self.result("rank_districts", metric="flood_risk", state="Rajasthan", top_n=3)
        ok, _ = self.rules(f"The top districts are {r.data['rows'][0]['district']} with {r.facts[0].value:.2f} [F1].", [r],
                           "Which villages in Kota are most at risk of flooding?")
        self.assertIn("requested_resolution_unaddressed", ok)
        ok2, _ = self.rules(f"Village-level results are not available; at district level the top is "
                            f"{r.data['rows'][0]['district']} with {r.facts[0].value:.2f} [F1].", [r],
                            "Which villages in Kota are most at risk of flooding?")
        self.assertNotIn("requested_resolution_unaddressed", ok2)

    def test_future_question_answered_with_current_data_is_rejected(self):
        r = self.result("district_hazard_profile", district="Barmer")
        ok, _ = self.rules(f"Barmer's flood screening index is {next(f for f in r.facts if f.key == 'flood_risk').value:.2f} [F8].",
                           [r], "Will Barmer flood in 2035?")
        self.assertIn("requested_future_unaddressed", ok)
        ok2, _ = self.rules("Predictions for 2035 are not available; the current flood screening index is "
                            f"{next(f for f in r.facts if f.key == 'flood_risk').value:.2f} (index, 0-10 scale) [F8].",
                            [r], "Will Barmer flood in 2035?")
        self.assertNotIn("requested_future_unaddressed", ok2)

    def test_forecast_question_is_not_a_future_question(self):
        r = self.result("forecast_summary", district="Jaipur")
        ok, _ = self.rules("This expired forecast peaked at 2.33 on September 15 [F12].", [r], "What does the 7-day forecast say for Jaipur?")
        self.assertNotIn("requested_future_unaddressed", ok)


class IndicatorAssociationTests(VerifierBase):
    """Regression for a defect found in the first real-model run: a value was attributed to the wrong hazard."""

    def setUp(self):
        self.r = self.result("district_hazard_profile", district="Jodhpur")
        self.id = {f.key: f.id for f in self.r.facts}

    def test_fire_value_labelled_as_flood_is_rejected(self):
        fire = next(f for f in self.r.facts if f.key == "fire_risk")
        ok, _ = self.rules(f"The pluvial flood screening index for Jodhpur is {fire.value:.2f} [{fire.id}].", [self.r], "Jodhpur flood")
        self.assertIn("indicator_mismatch", ok)

    def test_cited_fact_must_match_figure_in_sentence(self):
        flood = next(f for f in self.r.facts if f.key == "flood_risk")
        poll = next(f for f in self.r.facts if f.key == "pollution_risk")
        ok, _ = self.rules(f"The flood screening index is {flood.value:.2f} [{poll.id}].", [self.r], "Jodhpur flood")
        self.assertIn("citation_mismatch", ok)

    def test_correct_attribution_passes(self):
        flood = next(f for f in self.r.facts if f.key == "flood_risk")
        ok, rep = self.rules(f"The pluvial flood screening index for Jodhpur is {flood.value:.2f} [{flood.id}]; "
                             "it is a screening index, not a probability.", [self.r], "Jodhpur flood")
        self.assertEqual(ok, set(), rep.violations)

    def test_default_profile_returns_all_hazard_channels(self):
        keys = {f.key for f in self.r.facts}
        for k in ("flood_risk", "heat_risk", "drought_risk", "wetbulb_risk", "fire_risk", "hex_risk"):
            self.assertIn(k, keys)
