import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import support
from bhoomi_ai.llm import LLMError, OllamaBackend, OpenAICompatBackend, make_backend


class _H(BaseHTTPRequestHandler):
    seen = []

    def log_message(self, *a):
        pass

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps({"data": [{"id": "bhoomi-v1"}]}).encode())

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        _H.seen.append(body)
        msg = {"role": "assistant", "content": "", "tool_calls": [{"id": "x", "type": "function", "function": {
            "name": "district_hazard_profile", "arguments": json.dumps({"district": "Kota"})}}]}
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps({"choices": [{"message": msg}], "usage": {"prompt_tokens": 11, "completion_tokens": 5}}).encode())


class FactoryTests(unittest.TestCase):
    cfg = None

    @classmethod
    def setUpClass(cls):
        cls.cfg = support.env()[0]
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), _H)
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()

    def test_default_is_the_original_ollama_model(self):
        b = make_backend(self.cfg, {})
        self.assertIsInstance(b, OllamaBackend)
        self.assertEqual(b.model, self.cfg["model"]["name"])

    def test_openai_compat_selected_by_environment(self):
        b = make_backend(self.cfg, {"BHOOMI_LLM_BACKEND": "openai_compat", "BHOOMI_LLM_MODEL": "bhoomi-v1",
                                    "BHOOMI_LLM_BASE_URL": f"http://127.0.0.1:{self.port}/v1"})
        self.assertIsInstance(b, OpenAICompatBackend)
        r = b.chat([{"role": "system", "content": "s"}, {"role": "user", "content": "hi"}],
                   tools=[{"type": "function", "function": {"name": "district_hazard_profile", "parameters": {}}}])
        self.assertEqual((r.tool_calls[0].name, r.tool_calls[0].arguments), ("district_hazard_profile", {"district": "Kota"}))
        self.assertEqual(r.prompt_tokens, 11)
        self.assertEqual(b.model_info()["served_models"], ["bhoomi-v1"])

    def test_agent_messages_are_converted_to_openai_format(self):
        msgs = [{"role": "user", "content": "q"},
                {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "a", "arguments": {"x": 1}}},
                                                                       {"function": {"name": "b", "arguments": {}}}]},
                {"role": "tool", "content": "r1"}, {"role": "tool", "content": "r2"}]
        o = OpenAICompatBackend.to_openai_messages(msgs)
        self.assertEqual(o[1]["tool_calls"][0]["function"]["arguments"], '{"x": 1}')
        self.assertEqual([m["tool_call_id"] for m in o[2:]], ["call_1", "call_2"])

    def test_remote_endpoint_refused_unless_explicitly_allowed(self):
        with self.assertRaises(LLMError):
            OpenAICompatBackend("m", "http://example.com/v1")
        OpenAICompatBackend("m", "http://example.com/v1", allow_remote=True)

    def test_model_must_be_named(self):
        with self.assertRaises(LLMError):
            make_backend(self.cfg, {"BHOOMI_LLM_BACKEND": "openai_compat"})

    def test_unknown_backend(self):
        with self.assertRaises(LLMError):
            make_backend(self.cfg, {"BHOOMI_LLM_BACKEND": "carrier-pigeon"})

    def test_only_accepted_models_load_from_the_registry(self):
        with tempfile.TemporaryDirectory() as d:
            reg = Path(d) / "models.json"
            reg.write_text(json.dumps({"models": [{"id": "adapter-x", "status": "not_trained", "served_name": "bhoomi-x"},
                                                  {"id": "adapter-y", "status": "accepted", "served_name": "bhoomi-y"}]}))
            env = {"BHOOMI_LLM_BACKEND": "openai_compat", "BHOOMI_LLM_REGISTRY": str(reg)}
            with self.assertRaises(LLMError) as cm:
                make_backend(self.cfg, {**env, "BHOOMI_LLM_MODEL_ID": "adapter-x"})
            self.assertIn("accepted", str(cm.exception))
            with self.assertRaises(LLMError):
                make_backend(self.cfg, {**env, "BHOOMI_LLM_MODEL_ID": "missing"})
            b = make_backend(self.cfg, {**env, "BHOOMI_LLM_MODEL_ID": "adapter-y"})
            self.assertEqual(b.model, "bhoomi-y")

    def test_rollback_is_unsetting_the_variables(self):
        on = make_backend(self.cfg, {"BHOOMI_LLM_BACKEND": "openai_compat", "BHOOMI_LLM_MODEL": "m"})
        off = make_backend(self.cfg, {})
        self.assertNotEqual(type(on), type(off))
        self.assertIsInstance(off, OllamaBackend)


if __name__ == "__main__":
    unittest.main()
