import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import support
from bhoomi_ai.agent.memory import MemoryGuard
from bhoomi_ai.agent.session import SessionLimitError, SessionManager
from bhoomi_ai.feedback import FeedbackStore
from bhoomi_ai.llm.scripted_backend import ScriptedBackend, call, say
from bhoomi_ai.server import App, make_handler, serve


class SessionTests(unittest.TestCase):
    def test_session_cap(self):
        sm = SessionManager(max_sessions=2)
        sm.create(); sm.create()
        with self.assertRaises(SessionLimitError):
            sm.create()

    def test_idle_expiry(self):
        t = [0.0]
        sm = SessionManager(idle_s=10, clock=lambda: t[0])
        s = sm.create()
        t[0] = 11
        self.assertIsNone(sm.get(s.id))

    def test_turn_cap(self):
        sm = SessionManager(max_turns=1)
        s = sm.begin_turn(None)
        s.turns.append(object())
        with self.assertRaises(SessionLimitError):
            sm.begin_turn(s.id)

    def test_unknown_session_id_starts_new(self):
        sm = SessionManager()
        self.assertNotEqual(sm.begin_turn("f" * 24).id, "f" * 24)


class MemoryGuardTests(unittest.TestCase):
    def test_levels(self):
        self.assertEqual(MemoryGuard(250, 600, lambda: 100).check()["level"], "stop")
        self.assertEqual(MemoryGuard(250, 600, lambda: 400).check()["level"], "warn")
        self.assertEqual(MemoryGuard(250, 600, lambda: 2000).check()["level"], "ok")
        self.assertEqual(MemoryGuard(250, 600, lambda: None).check()["level"], "unknown")

    def test_real_reader_returns_number_on_this_machine(self):
        from bhoomi_ai.agent.memory import read_available_mb
        v = read_available_mb()
        self.assertTrue(v is None or v > 0)


class FeedbackTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.fb = FeedbackStore(Path(self.tmp.name) / "fb.sqlite")
        self.addCleanup(self.tmp.cleanup)

    def _turn(self, answer="Overall index 4.76 [F1].", results=None, status="verified"):
        return {"session_id": "s", "request": "Jodhpur hazards?", "status": status, "answer": answer,
                "model_draft": answer, "model": {"model": "qwen2.5:3b", "digest": "abc"},
                "trace": [{"step": 0, "calls": [{"name": "district_hazard_profile", "arguments": {"district": "Jodhpur"},
                                                 "status": "ok"}]}],
                "results": results if results is not None else [
                    {"tool": "district_hazard_profile", "status": "ok", "summary": "s",
                     "facts": [{"id": "F1", "key": "hex_risk", "value": 4.76, "display": "4.76"}],
                     "provenance": [{"file": "client/public/data/india_hex_props.json", "sha256": "x"}],
                     "semantics": {"data_class": "screening_index"}}],
                "verification": {"passed": True}, "latency_s": 1.0, "prompt_tokens": 10, "completion_tokens": 5}

    def test_logged_interaction_is_unreviewed_and_not_exportable(self):
        iid = self.fb.log_interaction(self._turn(), "0.1.0")
        rec = self.fb.get(iid)
        self.assertEqual(rec["review_state"], "unreviewed")
        out = Path(self.tmp.name) / "o.jsonl"
        m = self.fb.export_training_jsonl(out, "SYS")
        self.assertEqual(m["written"], 0)

    def test_user_thumbs_up_is_not_a_review(self):
        iid = self.fb.log_interaction(self._turn(), "0.1.0")
        self.fb.add_user_feedback(iid, "up", "nice")
        out = Path(self.tmp.name) / "o.jsonl"
        self.assertEqual(self.fb.export_training_jsonl(out, "SYS")["written"], 0)

    def test_review_without_authorization_not_exported(self):
        iid = self.fb.log_interaction(self._turn(), "0.1.0")
        self.fb.add_review(iid, "Dr A", "correct")
        out = Path(self.tmp.name) / "o.jsonl"
        m = self.fb.export_training_jsonl(out, "SYS", allow_restricted_internal=True)
        self.assertEqual(m["written"], 0)
        self.assertEqual(m["skipped"]["not_authorized"], 1)

    def test_authorization_requires_named_person(self):
        iid = self.fb.log_interaction(self._turn(), "0.1.0")
        with self.assertRaises(ValueError):
            self.fb.add_review(iid, "Dr A", "correct", authorize_training=True)
        with self.assertRaises(ValueError):
            self.fb.add_review(iid, " ", "correct")

    def test_reviewed_authorized_export_with_corrections(self):
        iid = self.fb.log_interaction(self._turn(answer="wrong 9.9", status="fallback"), "0.1.0")
        self.fb.add_review(iid, "Dr A", "incorrect", corrected_answer="Overall index 4.76 [F1].",
                           authorize_training=True, authorized_by="PI")
        out = Path(self.tmp.name) / "o.jsonl"
        m = self.fb.export_training_jsonl(out, "SYS", allow_restricted_internal=True)
        self.assertEqual(m["written"], 1)
        row = json.loads(out.read_text().splitlines()[0])
        self.assertEqual(row["messages"][-1]["content"], "Overall index 4.76 [F1].")
        self.assertEqual(row["review"]["reviewer"], "Dr A")
        self.assertEqual(row["messages"][0]["content"], "SYS")
        self.assertEqual(row["schema_version"], "bhoomi.training_example.v1")
        self.assertEqual(row["target"]["answer_source"], "reviewer_correction")

    def test_incorrect_without_correction_is_skipped(self):
        iid = self.fb.log_interaction(self._turn(), "0.1.0")
        self.fb.add_review(iid, "Dr A", "incorrect", authorize_training=True, authorized_by="PI")
        m = self.fb.export_training_jsonl(Path(self.tmp.name) / "o.jsonl", "SYS", allow_restricted_internal=True)
        self.assertEqual(m["written"], 0)

    def test_unsafe_verdict_never_exported(self):
        iid = self.fb.log_interaction(self._turn(), "0.1.0")
        self.fb.add_review(iid, "Dr A", "unsafe", corrected_answer="x", authorize_training=True, authorized_by="PI")
        m = self.fb.export_training_jsonl(Path(self.tmp.name) / "o.jsonl", "SYS", allow_restricted_internal=True)
        self.assertEqual(m["written"], 0)

    def test_restricted_source_excluded_by_default(self):
        res = [{"tool": "monsoon_indicators", "status": "ok", "summary": "s", "facts": [],
                "provenance": [{"file": "research/bhoomi_monsoon_v0/outputs/district_year_indicators.csv", "sha256": "x"}],
                "semantics": {"data_class": "satellite_gauge_estimate"}}]
        iid = self.fb.log_interaction(self._turn(results=res), "0.1.0")
        self.fb.add_review(iid, "Dr A", "correct", authorize_training=True, authorized_by="PI")
        out = Path(self.tmp.name) / "o.jsonl"
        self.assertEqual(self.fb.export_training_jsonl(out, "SYS")["skipped"]["restricted"], 1)
        m = self.fb.export_training_jsonl(out, "SYS", allow_restricted_internal=True)
        self.assertEqual(m["written"], 1)
        self.assertTrue(json.loads(out.read_text().splitlines()[0])["licence"]["internal_research_only"])

    def test_model_version_and_tool_calls_are_recorded(self):
        iid = self.fb.log_interaction(self._turn(), "0.1.0", "promptsha")
        rec = self.fb.get(iid)
        self.assertEqual(json.loads(rec["model_json"])["digest"], "abc")
        self.assertEqual(json.loads(rec["tool_calls_json"])[0]["name"], "district_hazard_profile")
        self.assertEqual(rec["system_prompt_sha"], "promptsha")


class AppTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.fb = FeedbackStore(Path(self.tmp.name) / "fb.sqlite")

    def app(self, script, **lim):
        cfg, *_ = support.env()
        be = ScriptedBackend(script)
        ag = support.agent(be)
        cfg2 = {**cfg, "limits": {**cfg["limits"], **lim}}
        return App(ag, SessionManager(), self.fb, cfg2), be

    def test_chat_roundtrip_and_logging(self):
        app, _ = self.app([call("district_hazard_profile", district="Jodhpur"),
                           say("Jodhpur overall index 4.76 (index, 0-10 scale) [F1].")])
        code, body = app.chat({"message": "Jodhpur hazards"})
        self.assertEqual(code, 200)
        self.assertEqual(body["status"], "verified")
        self.assertEqual(self.fb.get(body["interaction_id"])["status"], "verified")
        self.assertEqual(self.fb.stats()["training_authorized"], 0)

    def test_validation(self):
        app, _ = self.app([])
        self.assertEqual(app.chat([])[0], 400)
        self.assertEqual(app.chat({"message": ""})[0], 400)
        self.assertEqual(app.chat({"message": 5})[0], 400)
        self.assertEqual(app.chat({"message": "x" * 2000})[0], 400)
        self.assertEqual(app.chat({"message": "hi", "session_id": "../etc"})[0], 400)
        self.assertEqual(app.chat({"message": "hi", "extra": 1})[0], 400)

    def test_rate_limit(self):
        app, _ = self.app([say("Hello.")] * 5, rate_limit_per_min=2)
        self.assertEqual(app.chat({"message": "hi"})[0], 200)
        self.assertEqual(app.chat({"message": "hi"})[0], 200)
        self.assertEqual(app.chat({"message": "hi"})[0], 429)

    def test_busy_model_returns_429(self):
        app, _ = self.app([say("Hello.")])
        app.model_lock.acquire()
        self.assertEqual(app.chat({"message": "hi"})[0], 429)
        app.model_lock.release()

    def test_feedback_endpoint_validates(self):
        app, _ = self.app([say("Hello.")])
        _, body = app.chat({"message": "hi"})
        self.assertEqual(app.feedback_post({"interaction_id": body["interaction_id"], "rating": "up"})[0], 200)
        self.assertEqual(app.feedback_post({"interaction_id": "zz", "rating": "up"})[0], 400)
        self.assertEqual(app.feedback_post({"interaction_id": "0" * 32, "rating": "up"})[0], 404)
        self.assertEqual(app.feedback_post({"interaction_id": body["interaction_id"], "rating": "meh"})[0], 400)


class SocketTests(unittest.TestCase):
    """Real HTTP server on an ephemeral loopback port."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cfg, store, reg, ver = support.env()
        be = ScriptedBackend(lambda m, t: say("Hello."))
        ag = support.agent(be)
        lim = cfg["limits"]
        cls.app = App(ag, SessionManager(), FeedbackStore(Path(cls.tmp.name) / "fb.sqlite"), cfg)
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), None)
        cls.port = cls.srv.server_address[1]
        cls.srv.RequestHandlerClass = make_handler(cls.app, cls.port)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        cls.tmp.cleanup()

    def req(self, method="GET", path="/", body=None, headers=None, raw=None):
        h = {"Host": f"127.0.0.1:{self.port}"}
        h.update(headers or {})
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        if data is not None:
            h.setdefault("Content-Type", "application/json")
        r = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=data, headers=h, method=method)
        try:
            with urllib.request.urlopen(r, timeout=20) as resp:
                return resp.status, resp.read(), dict(resp.headers)
        except urllib.error.HTTPError as e:
            return e.code, e.read(), dict(e.headers)

    def test_page_and_headers(self):
        c, body, h = self.req()
        self.assertEqual(c, 200)
        self.assertIn(b"Bhoomi AI", body)
        self.assertIn("default-src 'self'", h["Content-Security-Policy"])
        self.assertEqual(h["X-Content-Type-Options"], "nosniff")
        self.assertNotIn("Access-Control-Allow-Origin", h)

    def test_chat_over_http(self):
        c, body, _ = self.req("POST", "/api/chat", {"message": "hi"})
        self.assertEqual(c, 200)
        self.assertEqual(json.loads(body)["status"], "direct")

    def test_foreign_host_header_rejected(self):
        c, *_ = self.req(headers={"Host": "evil.example:80"})
        self.assertEqual(c, 403)

    def test_foreign_origin_rejected(self):
        c, *_ = self.req("POST", "/api/chat", {"message": "hi"}, headers={"Origin": "http://evil.example"})
        self.assertEqual(c, 403)

    def test_oversize_body_rejected(self):
        c, *_ = self.req("POST", "/api/chat", raw=b'{"message":"' + b"a" * 20000 + b'"}')
        self.assertEqual(c, 413)

    def test_non_json_rejected(self):
        c, *_ = self.req("POST", "/api/chat", raw=b"message=hi", headers={"Content-Type": "text/plain"})
        self.assertEqual(c, 415)
        c, *_ = self.req("POST", "/api/chat", raw=b"{not json}")
        self.assertEqual(c, 400)

    def test_no_file_serving_or_traversal(self):
        for p in ["/etc/passwd", "/../config/agent.json", "/config/agent.json", "/data/feedback.sqlite", "/src/bhoomi_ai/server.py"]:
            c, *_ = self.req(path=p)
            self.assertEqual(c, 404, p)

    def test_other_methods_rejected(self):
        c, *_ = self.req("PUT", "/api/chat", {"message": "hi"})
        self.assertEqual(c, 405)

    def test_refuses_non_loopback_bind(self):
        with self.assertRaises(SystemExit):
            serve(host="0.0.0.0", port=0)


if __name__ == "__main__":
    unittest.main()
