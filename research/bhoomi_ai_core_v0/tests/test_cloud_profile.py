"""cloud_beta deployment profile: restricted-source tools never run and restricted tables are never read."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock
from datetime import datetime, timezone
from pathlib import Path

from support import ROOT

from bhoomi_ai.agent.memory import MemoryGuard
from bhoomi_ai.agent.orchestrator import Agent
from bhoomi_ai.agent.session import SessionManager
from bhoomi_ai.config import AccessError, _active_profile, check_readable, load_config
from bhoomi_ai.data_access import RESTRICTED_KEYS, DataStore
from bhoomi_ai.llm.scripted_backend import ScriptedBackend, call, say
from bhoomi_ai.tools import Registry, ToolContext
from bhoomi_ai.tools.base import Tool
from bhoomi_ai.tools.registry import UnavailableTool, tool_licence_classes
from bhoomi_ai.tools.impl import MethodNotes

RESTRICTED_TOOLS = {"forecast_summary", "monsoon_indicators", "rainfall_features", "reported_flood_months"}
OPENED: list[str] = []


def _hook(event, args):
    if event == "open" and args and isinstance(args[0], (str, bytes, Path)):
        OPENED.append(str(args[0]))


sys.addaudithook(_hook)


def cloud_cfg():
    with mock.patch.dict(os.environ, {"BHOOMI_DEPLOYMENT_PROFILE": "cloud_beta"}):
        cfg = load_config()
    cfg["paths"] = {**cfg["paths"], "district_cache": Path(tempfile.mkdtemp()) / "district_cache.json",
                    "feedback_db": Path(tempfile.mkdtemp()) / "fb.sqlite"}
    return cfg


class CloudProfile(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cfg = cloud_cfg()
        cls.store = DataStore(cls.cfg)
        cls.reg = Registry(profile="cloud_beta")
        cls.ctx = ToolContext(cls.store, cls.cfg, datetime(2026, 10, 10, 9, tzinfo=timezone.utc))
        MethodNotes._index = None

    @classmethod
    def tearDownClass(cls):
        MethodNotes._index = None
        _active_profile["name"] = None

    def test_only_cleared_documents_without_restricted_sources_are_quotable(self):
        names = {Path(p).name for p in self.cfg["doc_sources"]}
        self.assertEqual(names, {"METHODOLOGY.md"})
        excluded = dict(self.cfg["doc_sources_excluded"])
        for flood_doc in ("label_definitions.md", "decisions_and_assumptions.md", "retrospective_validation.md"):
            self.assertIn(flood_doc, excluded)
        out = MethodNotes().run({"topic": "IFI-Impacts flood label crosswalk LGD CHIRPS"}, self.ctx)
        self.assertNotRegex(json.dumps(out.__dict__, default=str, ensure_ascii=False), r"(?i)\b(IFI|LGD|CHIRPS)\b")

    def test_a_cleared_document_that_names_a_restricted_source_is_still_dropped(self):
        d = Path(tempfile.mkdtemp())
        doc = d / "note.md"
        doc.write_text("Flood labels come from the IFI-Impacts database.", encoding="utf-8")
        with mock.patch.dict(os.environ, {"BHOOMI_DEPLOYMENT_PROFILE": "cloud_beta"}):
            import bhoomi_ai.config as c
            real = c.json.loads
            def fake(text, *a, **k):
                cfg = real(text, *a, **k)
                if isinstance(cfg, dict) and "doc_sources" in cfg:
                    cfg["doc_sources"] = [str(doc)]
                    cfg["cloud"] = {"doc_sources_cleared": [str(doc)]}
                return cfg
            with mock.patch.object(c.json, "loads", fake):
                cfg = c.load_config()
        self.assertEqual(cfg["doc_sources"], [])
        self.assertEqual(cfg["doc_sources_excluded"][0][1], "names a restricted source")

    def test_restricted_directories_are_unreadable_but_allowed_data_is(self):
        _active_profile["name"] = "cloud_beta"
        for rel in ("research/bhoomi_flood_v0/outputs/district_month_labels.csv",
                    "research/bhoomi_monsoon_v0/outputs/district_year_indicators.csv",
                    "research/bhoomi_flood_v0/docs/label_definitions.md"):
            with self.assertRaises(AccessError):
                check_readable(ROOT.parents[1] / rel)
        self.assertTrue(check_readable(ROOT.parents[1] / "client/public/data/india_hex_props.json"))

    def test_tool_schemas_are_identical_to_the_local_profile(self):
        self.assertEqual(self.reg.specs(), Registry(profile="local_dev").specs())

    def test_restricted_tools_are_inert_and_say_so(self):
        for name in RESTRICTED_TOOLS:
            self.assertIsInstance(self.reg.tools[name], UnavailableTool)
            args = {"district": "Jaisalmer", "year": 2009} if name != "forecast_summary" else {"district": "Kota"}
            r = self.reg.execute(name, args, self.ctx)
            self.assertEqual(r.status, "unsupported", name)
            self.assertEqual(r.facts, [])
            self.assertIn("not available in the hosted research beta", r.summary)

    def test_permitted_tools_are_unchanged_and_return_the_same_values(self):
        local = Registry(profile="local_dev")
        lctx = ToolContext(DataStore(load_config()), load_config(), self.ctx.now)
        for name, args in (("district_hazard_profile", {"district": "Kota"}), ("wash_context", {"district": "Kota"}),
                           ("historical_climate", {"district": "Kota"}), ("rank_districts", {"metric": "heat_risk", "state": "Rajasthan"})):
            a, b = self.reg.execute(name, args, self.ctx), local.execute(name, args, lctx)
            self.assertEqual(a.status, "ok", name)
            self.assertEqual([(f.key, f.value) for f in a.facts], [(f.key, f.value) for f in b.facts], name)

    def test_unclassified_tools_fail_closed(self):
        class Mystery(Tool):
            name, description, parameters, semantics = "mystery_tool", "x", {"type": "object", "properties": {}}, {}
        r = Registry(tools=[Mystery()], profile="cloud_beta")
        self.assertIsInstance(r.tools["mystery_tool"], UnavailableTool)

    def test_data_layer_refuses_restricted_tables_and_forecast_values(self):
        for k in RESTRICTED_KEYS | {"forecast"}:
            with self.assertRaises(PermissionError, msg=k):
                self.store.path(k)
        districts = self.store.cache()["districts"]
        self.assertTrue(districts)
        self.assertTrue(all(v is None for d in districts.values() for v in d["forecast_risk_by_day"]))

    def test_no_restricted_file_is_opened_while_serving_questions(self):
        mark = len(OPENED)
        be = ScriptedBackend([call("monsoon_indicators", district="Jaisalmer", year=2009), say("n/a"),
                              call("reported_flood_months", district="Dungarpur"), say("n/a"),
                              call("forecast_summary", district="Kota"), say("n/a"),
                              call("district_hazard_profile", district="Kota"), say("Kota 4.03")])
        ag = Agent(be, self.reg, self.store, self.cfg, clock=lambda: self.ctx.now, guard=MemoryGuard(250, 600, lambda: 4000.0))
        s = SessionManager().create()
        for q in ("Show monsoon indicators for Jaisalmer in 2009.", "Which months were floods reported in Dungarpur?",
                  "What is the forecast for Kota?", "What is the hazard index of Kota?"):
            ag.run_turn(s, q)
        touched = OPENED[mark:]
        for bad in ("monsoon_v0", "flood_v0", "district_year_indicators", "district_descriptive", "district_month_labels",
                    "chirps_features", "lgd_verification", "forecast_risk"):
            self.assertFalse([p for p in touched if bad in p], f"{bad} was opened")

    def test_monsoon_question_never_returns_restricted_values(self):
        be = ScriptedBackend([call("monsoon_indicators", district="Jaisalmer", year=2009),
                              say("The JJAS total was 126.4 mm [F1]."), say("The JJAS total was 126.4 mm [F1].")])
        ag = Agent(be, self.reg, self.store, self.cfg, clock=lambda: self.ctx.now, guard=MemoryGuard(250, 600, lambda: 4000.0))
        t = ag.run_turn(SessionManager().create(), "Show monsoon indicators for Jaisalmer in 2009.").to_dict()
        self.assertNotEqual(t["status"], "verified")
        self.assertNotIn("126.4", t["answer"])

    def test_licence_classes_match_the_project_policy_when_present(self):
        pol = ROOT.parent / "bhoomi_llm_v1" / "configs" / "licence_policy.json"
        if not pol.exists():
            self.skipTest("llm_v1 policy not in this checkout")
        want = {k: v["class"] for k, v in json.loads(pol.read_text())["tools"].items()}
        self.assertEqual(tool_licence_classes(), want)
        self.assertEqual({k for k, v in want.items() if v == "decision_only"}, RESTRICTED_TOOLS)


if __name__ == "__main__":
    unittest.main()


class BetaTagging(unittest.TestCase):
    def test_interactions_carry_deployment_and_user_hash_and_are_not_exported_by_default(self):
        from bhoomi_ai.feedback import FeedbackStore
        fs = FeedbackStore(Path(tempfile.mkdtemp()) / "fb.sqlite")
        turn = {"session_id": "a" * 24, "status": "verified", "answer": "x", "request": "What is the hazard of Kota?",
                "model": {"model": "m"}, "trace": [], "results": [], "verification": {}}
        iid = fs.log_interaction(turn, "0.2.4", "sha", deployment="cloud_beta", user_hash="ab" * 16)
        rec = fs.get(iid)
        self.assertEqual((rec["deployment"], rec["user_hash"]), ("cloud_beta", "ab" * 16))
        fs.add_review(iid, "Reviewer A", "correct", authorize_training=True, authorized_by="Owner")
        m = fs.export_training_jsonl(Path(tempfile.mkdtemp()) / "o.jsonl", "sys", tool_specs=[])
        self.assertEqual(m["written"], 0)
        self.assertEqual(m["skipped"]["beta_user"], 1)

    def test_server_rejects_malformed_tags(self):
        from bhoomi_ai.server import App
        app = App.__new__(App)                      # only the validation path is exercised
        app.max_chars = 1500
        self.assertEqual(app.chat({"message": "hi", "deployment": "prod"})[0], 400)
        self.assertEqual(app.chat({"message": "hi", "user_hash": "NOT HEX"})[0], 400)
