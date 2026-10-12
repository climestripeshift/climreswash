import unittest

import support
from bhoomi_ai.llm.base import LLMError, LLMResponse, ToolCall
from bhoomi_ai.llm.ollama_backend import parse_content_tool_calls
from bhoomi_ai.llm.scripted_backend import ScriptedBackend, call, say


def run(script, text, **kw):
    be = ScriptedBackend(script)
    ag = support.agent(be, **kw)
    s = support.session()
    return ag.run_turn(s, text), be, s, ag


class ToolSelectionAndAnswering(unittest.TestCase):
    def test_single_tool_then_verified_answer(self):
        r, be, *_ = run([call("monsoon_indicators", district="Jaisalmer", year=2009),
                         say("Jaisalmer received 126.4 mm of CHIRPS-estimated JJAS rainfall in 2009 [F1].")],
                        "How much monsoon rain did Jaisalmer get in 2009?")
        self.assertEqual(r.status, "verified")
        self.assertIn("126.4 mm", r.answer)
        self.assertIn("jjas_total_mm", [f["key"] for f in r.facts])
        self.assertIn("Limitation".lower(), r.evidence.lower())
        # tool specs and results really went through the model
        self.assertEqual(len(be.calls), 2)
        self.assertTrue(any(m["role"] == "tool" for m in be.calls[1]["messages"]))

    def test_multi_step_multi_tool(self):
        r, *_ = run([call("district_hazard_profile", district="Jodhpur"),
                     call("wash_context", district="Jodhpur"),
                     say("Jodhpur's overall screening index is 4.76 (index, 0-10 scale) [F1]. WASH survey values are in the evidence.")],
                    "Jodhpur hazards and WASH")
        self.assertEqual(r.status, "verified")
        tools = [c["name"] for s in r.trace for c in s["calls"]]
        self.assertEqual(tools, ["district_hazard_profile", "wash_context"])

    def test_parallel_calls_in_one_step(self):
        be = ScriptedBackend([
            LLMResponse(tool_calls=[ToolCall("district_hazard_profile", {"district": "Jodhpur"}),
                                    ToolCall("wash_context", {"district": "Jodhpur"})]),
            say("Jodhpur overall screening index is 4.76 (index, 0-10 scale) [F1].")])
        r = support.agent(be).run_turn(support.session(), "Jodhpur?")
        self.assertEqual(r.status, "verified")
        self.assertEqual(len(r.results), 2)

    def test_followup_uses_session_context(self):
        be = ScriptedBackend([call("district_hazard_profile", district="Kota"),
                              say("Kota's overall screening index is 4.03 (index, 0-10 scale) [F1]."),
                              call("reported_flood_months", district="Kota"), say("Kota had 4 reported flood months [F2].")])
        ag = support.agent(be)
        s = support.session()
        ag.run_turn(s, "Kota hazards")
        ag.run_turn(s, "and its reported floods?")
        second_system = be.calls[2]["messages"][0]["content"]
        self.assertIn("district=Kota", second_system)
        self.assertIn("state=Rajasthan", second_system)
        # history carries the previous turn but not its evidence tags
        hist = [m["content"] for m in be.calls[2]["messages"] if m["role"] == "assistant"]
        self.assertTrue(hist and "[F1]" not in hist[0])


class ValidationAndRecovery(unittest.TestCase):
    def test_invalid_args_are_returned_to_model_then_corrected(self):
        r, be, *_ = run([call("monsoon_indicators", district="Jaisalmer", year=1850),
                         call("monsoon_indicators", district="Jaisalmer", year=2009),
                         say("Jaisalmer rainfall was 126.4 mm [F1].")], "Jaisalmer 2009 rain")
        self.assertEqual(r.status, "verified")
        self.assertTrue(r.trace[0]["calls"][0]["validation_errors"])
        self.assertTrue(any(m["role"] == "tool" and m["content"].startswith("ERROR") for m in be.calls[1]["messages"]))

    def test_unknown_tool_is_rejected(self):
        r, *_ = run([call("run_shell", cmd="ls"), call("run_shell", cmd="ls"), call("run_shell", cmd="ls"),
                     call("run_shell", cmd="ls")], "do something")
        self.assertEqual(r.status, "tool_failure")
        self.assertFalse(r.results)

    def test_malformed_arguments_string(self):
        be = ScriptedBackend([LLMResponse(tool_calls=[ToolCall("district_hazard_profile", '{"district": "Kota"')]),
                              call("district_hazard_profile", district="Kota"),
                              say("Kota overall index is 4.03 (index, 0-10 scale) [F1].")])
        r = support.agent(be).run_turn(support.session(), "Kota")
        self.assertEqual(r.status, "verified")
        self.assertEqual(r.trace[0]["calls"][0]["validation_errors"], ["arguments must be a JSON object"])

    def test_duplicate_call_not_executed_twice(self):
        r, *_ = run([call("district_hazard_profile", district="Kota"), call("district_hazard_profile", district="Kota"),
                     say("Kota overall index is 4.03 (index, 0-10 scale) [F1].")], "Kota")
        self.assertEqual(len(r.results), 1)

    def test_tool_exception_does_not_become_an_answer(self):
        from bhoomi_ai.tools import Registry
        from bhoomi_ai.tools.impl import DistrictHazardProfile

        class Broken(DistrictHazardProfile):
            def run(self, a, c):
                raise RuntimeError("disk gone")
        cfg, store, _, ver = support.env()
        from bhoomi_ai.agent.orchestrator import Agent
        ag = Agent(ScriptedBackend([call("district_hazard_profile", district="Kota"),
                                    say("Kota has a risk index of 9.9."),
                                    say("Kota has a risk index of 9.9.")]), Registry([Broken()]), store, cfg, ver,
                   clock=lambda: support.CLOCK_EXPIRED)
        r = ag.run_turn(support.session(), "Kota?")
        self.assertNotIn("9.9", r.answer)
        self.assertIn(r.status, ("no_evidence", "fallback"))


class VerificationGate(unittest.TestCase):
    def test_hallucinated_number_is_repaired(self):
        r, be, *_ = run([call("monsoon_indicators", district="Jaisalmer", year=2009),
                         say("Jaisalmer had 143.4 mm [F1]."),
                         say("Jaisalmer had 126.4 mm [F1].")], "Jaisalmer 2009 rain")
        self.assertEqual(r.status, "verified")
        self.assertTrue(r.repaired)
        self.assertIn("126.4", r.answer)
        self.assertNotIn("143.4", r.answer)
        self.assertIn("rejected", be.calls[2]["messages"][-1]["content"])

    def test_persistent_hallucination_falls_back_to_verified_results(self):
        r, *_ = run([call("monsoon_indicators", district="Jaisalmer", year=2009),
                     say("Jaisalmer had 143.4 mm [F1]."), say("Honestly it was 150 mm [F1].")], "Jaisalmer 2009 rain")
        self.assertEqual(r.status, "fallback")
        self.assertTrue(r.fallback_used)
        self.assertNotIn("143.4", r.answer)
        self.assertNotIn("150 mm", r.answer)
        self.assertIn("126.4 mm", r.answer)
        self.assertIn("limitation", r.evidence)

    def test_wrong_units_trigger_fallback(self):
        r, *_ = run([call("monsoon_indicators", district="Jaisalmer", year=2009),
                     say("It was 126.4 days [F1]."), say("It was 126.4 days [F1].")], "Jaisalmer 2009 rain")
        self.assertEqual(r.status, "fallback")

    def test_expired_forecast_gets_flagged_in_fallback(self):
        r, *_ = run([call("forecast_summary", district="Jaipur"),
                     say("Today's forecast for Jaipur peaks at 2.33 [F12]."),
                     say("Tomorrow will be worse [F12].")], "Jaipur forecast today?")
        self.assertEqual(r.status, "fallback")
        self.assertIn("expired", r.answer + r.evidence)

    def test_missing_citation_is_a_warning_not_a_rejection(self):
        r, *_ = run([call("monsoon_indicators", district="Jaisalmer", year=2009),
                     say("Jaisalmer rainfall was 126.4 mm.")], "Jaisalmer 2009 rain")
        self.assertEqual(r.status, "verified")
        self.assertTrue(r.verification["warnings"])

    def test_parenthesised_citation_is_accepted(self):
        r, *_ = run([call("monsoon_indicators", district="Jaisalmer", year=2009),
                     say("Jaisalmer rainfall was 126.4 mm (F1).")], "Jaisalmer 2009 rain")
        self.assertEqual(r.status, "verified")
        self.assertEqual(r.verification["cited_fact_ids"], ["F1"])

    def test_wrong_citation_is_still_rejected(self):
        r, *_ = run([call("monsoon_indicators", district="Jaisalmer", year=2009),
                     say("Rainfall was 126.4 mm [F2]."), say("Rainfall was 126.4 mm [F2].")], "Jaisalmer 2009 rain")
        self.assertEqual(r.status, "fallback")

    def test_answer_without_tools_about_hazards_is_not_released(self):
        r, *_ = run([say("Barmer is highly drought prone."), say("Barmer is highly drought prone.")], "Is Barmer drought prone?")
        self.assertEqual(r.status, "no_evidence")
        self.assertNotIn("highly drought prone", r.answer)

    def test_greeting_without_tools_is_released(self):
        r, *_ = run([say("Hello. Ask me about a district.")], "hi")
        self.assertEqual(r.status, "direct")

    def test_empty_model_answer(self):
        r, *_ = run([say("   ")], "hi")
        self.assertIn(r.status, ("no_evidence",))


class ControlTools(unittest.TestCase):
    def test_model_declines_future_prediction(self):
        r, *_ = run([call("declare_unsupported", reason="Future flood probabilities cannot be given.",
                          nearest_supported="Historical reported flood months for Barmer are available.")],
                    "Will Barmer flood in 2035?")
        self.assertEqual(r.status, "unsupported")
        # v0.2: the limitation wording is deterministic (the model decides to decline; code states why, explicitly)
        self.assertIn("predictions and future probabilities are not available", r.answer)
        self.assertIn("Historical reported flood months for Barmer are available", r.answer)

    def test_refusal_with_invented_number_is_replaced(self):
        r, *_ = run([call("declare_unsupported", reason="The chance is 37 percent but I cannot say more.")],
                    "Will Barmer flood in 2035?")
        self.assertEqual(r.status, "unsupported")
        self.assertNotIn("37", r.answer)
        self.assertTrue(r.fallback_used)

    def test_clarification_for_ambiguous_district(self):
        cache = support.env()[1].cache()["districts"]
        from collections import defaultdict
        by = defaultdict(set)
        for v in cache.values():
            by[v["district"]].add(v["state"])
        name = next(d for d, s in by.items() if len(s) > 1)
        states = sorted(by[name])
        r, *_ = run([call("district_hazard_profile", district=name),
                     call("ask_clarification", question=f"Which {name}: {states[0]} or {states[1]}?")], f"hazards in {name}")
        self.assertEqual(r.status, "clarification")
        self.assertIn(states[0], r.answer)

    def test_ambiguous_result_then_bad_prose_lists_candidates(self):
        cache = support.env()[1].cache()["districts"]
        from collections import defaultdict
        by = defaultdict(set)
        for v in cache.values():
            by[v["district"]].add(v["state"])
        name = next(d for d, s in by.items() if len(s) > 1)
        r, *_ = run([call("district_hazard_profile", district=name), say("It scores 7.7 overall."), say("It scores 7.7.")],
                    f"hazards in {name}")
        self.assertEqual(r.status, "fallback")
        self.assertIn("Which one do you mean", r.answer)
        self.assertNotIn("7.7", r.answer)

    def test_out_of_coverage_district_for_rajasthan_tool(self):
        r, *_ = run([call("reported_flood_months", district="Pune"),
                     say("Pune's reported flood record is outside the Rajasthan-only coverage.")], "Pune floods 2010")
        self.assertEqual(r.results[0]["status"], "unsupported")
        self.assertIn(r.status, ("verified", "fallback"))


class ResourceAndErrors(unittest.TestCase):
    def test_memory_pressure_blocks_model_call(self):
        be = ScriptedBackend([say("should not run")])
        ag = support.agent(be, free_mb=100.0)
        r = ag.run_turn(support.session(), "Kota?")
        self.assertEqual(r.status, "resource_limit")
        self.assertEqual(be.calls, [])

    def test_memory_warning_still_runs(self):
        r, *_ = run([say("Hello.")], "hi", free_mb=400.0)
        self.assertEqual(r.memory["level"], "warn")
        self.assertEqual(r.status, "direct")

    def test_model_unavailable(self):
        class Down(ScriptedBackend):
            def chat(self, *a, **k):
                raise LLMError("connection refused")
        r = support.agent(Down([])).run_turn(support.session(), "Kota?")
        self.assertEqual(r.status, "model_error")
        self.assertIn("unavailable", r.answer)

    def test_overlong_input_rejected_without_model_call(self):
        be = ScriptedBackend([say("x")])
        r = support.agent(be).run_turn(support.session(), "a" * 5000)
        self.assertEqual(r.status, "invalid")
        self.assertEqual(be.calls, [])

    def test_step_limit_for_runaway_tool_loop(self):
        n = [0]

        def script(messages, tools):
            n[0] += 1
            return call("district_hazard_profile", district="Kota", hazards=["flood_risk"][:1]) if n[0] == 1 else \
                call("map_link", view="grid", district=f"Kota") if n[0] == 2 else call("method_notes", topic=f"t{n[0]}")
        r, *_ = run(script, "loop forever")
        self.assertLessEqual(len(r.trace), 5)
        self.assertIn(r.status, ("fallback", "no_evidence", "verified"))


class TuningGuards(unittest.TestCase):
    """Generic orchestration guards added after the first real-model baseline."""

    def test_clarification_alongside_data_call_is_ignored(self):
        be = ScriptedBackend([LLMResponse(tool_calls=[
            ToolCall("district_hazard_profile", {"district": "Kota"}),
            ToolCall("ask_clarification", {"question": "Which district?"})]),
            say("Kota overall index is 4.03 (index, 0-10 scale) [F1].")])
        r = support.agent(be).run_turn(support.session(), "Kota hazards")
        self.assertEqual(r.status, "verified")
        self.assertIn("clarification ignored", r.trace[0]["calls"][1]["skipped"])

    def test_clarification_about_a_district_the_user_named_is_rejected_once(self):
        be = ScriptedBackend([call("ask_clarification", question="What is the district name?"),
                              call("district_hazard_profile", district="Kota"),
                              say("Kota overall index is 4.03 (index, 0-10 scale) [F1].")])
        r = support.agent(be).run_turn(support.session(), "hazard profile of Kota")
        self.assertEqual(r.status, "verified")
        self.assertIn("rejected", r.trace[0]["calls"][0]["skipped"])

    def test_second_clarification_is_honoured(self):
        be = ScriptedBackend([call("ask_clarification", question="Which year?"),
                              call("ask_clarification", question="Which year do you mean for Kota?")])
        r = support.agent(be).run_turn(support.session(), "rain in Kota")
        self.assertEqual(r.status, "clarification")

    def test_clarification_stands_when_no_district_named(self):
        be = ScriptedBackend([call("ask_clarification", question="Which district do you mean?")])
        r = support.agent(be).run_turn(support.session(), "what is the flood index there")
        self.assertEqual(r.status, "clarification")

    def test_ambiguous_district_is_not_blocked_from_clarifying(self):
        cache = support.env()[1].cache()["districts"]
        from collections import defaultdict
        by = defaultdict(set)
        for v in cache.values():
            by[v["district"]].add(v["state"])
        name = next(d for d, s in by.items() if len(s) > 1 and " " not in d and len(d) >= 4)
        st = sorted(by[name])
        be = ScriptedBackend([call("ask_clarification", question=f"Which {name}: {st[0]} or {st[1]}?")])
        r = support.agent(be).run_turn(support.session(), f"flood index of {name}")
        self.assertEqual(r.status, "clarification")

    def test_fact_id_without_figure_is_rejected_and_repaired(self):
        r, *_ = run([call("district_hazard_profile", district="Kota"),
                     say("The overall index for Kota is [F1]."),
                     say("The overall index for Kota is 4.03 (index, 0-10 scale) [F1].")], "Kota overall")
        self.assertEqual(r.status, "verified")
        self.assertTrue(r.repaired)


class FallbackParserTests(unittest.TestCase):
    def test_json_in_content(self):
        c = parse_content_tool_calls('{"name": "wash_context", "arguments": {"district": "Kota"}}')
        self.assertEqual((c[0].name, c[0].arguments, c[0].source), ("wash_context", {"district": "Kota"}, "content_json"))

    def test_tool_call_tags(self):
        c = parse_content_tool_calls('ok <tool_call>{"name":"map_link","arguments":{"view":"forecast"}}</tool_call>')
        self.assertEqual((c[0].name, c[0].source), ("map_link", "content_tag"))

    def test_code_fence(self):
        c = parse_content_tool_calls('```json\n{"name":"wash_context","parameters":{"district":"Kota"}}\n```')
        self.assertEqual(c[0].arguments, {"district": "Kota"})

    def test_plain_text_is_not_a_call(self):
        self.assertEqual(parse_content_tool_calls("Kota has 12 hexes."), [])

    def test_broken_json_is_not_executed(self):
        self.assertEqual(parse_content_tool_calls('{"name": "wash_context", "arguments": {'), [])

    def test_named_pseudo_call(self):
        c = parse_content_tool_calls('Declare_unsupported {"reason": "prediction", "nearest_supported": "x"}',
                                     {"declare_unsupported"})
        self.assertEqual((c[0].name, c[0].arguments["reason"], c[0].source), ("declare_unsupported", "prediction", "content_named"))

    def test_named_pseudo_call_requires_known_tool(self):
        self.assertEqual(parse_content_tool_calls('rm_everything {"x": 1}', {"declare_unsupported"}), [])
        self.assertEqual(parse_content_tool_calls('declare_unsupported {"reason": "x"}'), [])

    def test_several_objects_in_one_tag(self):
        c = parse_content_tool_calls('<tool_call> {"name":"wash_context","arguments":{"district":"Kota"}} '
                                     '{"name":"map_link","arguments":{"view":"forecast"}} </tool_call>')
        self.assertEqual([x.name for x in c], ["wash_context", "map_link"])

    def test_arguments_string_is_decoded(self):
        c = parse_content_tool_calls('{"name":"wash_context","arguments":"{\\"district\\": \\"Kota\\"}"}')
        self.assertEqual(c[0].arguments, {"district": "Kota"})


if __name__ == "__main__":
    unittest.main()
