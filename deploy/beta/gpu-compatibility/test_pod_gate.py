"""Pod gate: auth + allowlist in front of a fake 'vLLM' that, like the real one, leaves /invocations unauthenticated."""
import json
import threading
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pod_gate as G

EDGE, INTERNAL = "e" * 43, "i" * 43


class FakeVllm(BaseHTTPRequestHandler):
    seen: list = []

    def log_message(self, *a):
        pass

    def _out(self, code, obj):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        FakeVllm.seen.append(("GET", self.path, self.headers.get("Authorization")))
        if self.path == "/v1/models":
            return self._out(200, {"data": [{"id": "bhoomi-llm-v1-ckpt160", "parent": "Qwen/Qwen3-4B-Instruct-2507"}]})
        self._out(200, {"leak": "unauthenticated vllm route"})

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0); body = self.rfile.read(n)
        FakeVllm.seen.append(("POST", self.path, self.headers.get("Authorization"), json.loads(body or b"{}")))
        if self.path == "/v1/chat/completions":
            return self._out(200, {"model": "bhoomi-llm-v1-ckpt160", "choices": [{"message": {"role": "assistant", "content": "ok"}}]})
        self._out(200, {"leak": "invocations answered without a key"})


class GateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.up = ThreadingHTTPServer(("127.0.0.1", 0), FakeVllm)
        threading.Thread(target=cls.up.serve_forever, daemon=True).start()
        cls.gate = G.make_server("127.0.0.1", 0, f"http://127.0.0.1:{cls.up.server_address[1]}", EDGE, INTERNAL)
        threading.Thread(target=cls.gate.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.gate.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.gate.shutdown(); cls.gate.server_close(); cls.up.shutdown(); cls.up.server_close()

    def call(self, method, path, body=None, key=EDGE, raw=None):
        h = {"Content-Type": "application/json"}
        if key is not None:
            h["Authorization"] = f"Bearer {key}"
        data = raw if raw is not None else (None if body is None else json.dumps(body).encode())
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    def test_authenticated_chat_and_models_are_forwarded_with_the_internal_key_only(self):
        FakeVllm.seen.clear()
        self.assertEqual(self.call("POST", "/v1/chat/completions", {"messages": [{"role": "user", "content": "hi"}]})[0], 200)
        self.assertEqual(self.call("GET", "/v1/models")[0], 200)
        for rec in FakeVllm.seen:
            self.assertEqual(rec[2], f"Bearer {INTERNAL}")          # vLLM sees its private key, never the edge key
            self.assertNotIn(EDGE, str(rec))

    def test_missing_or_wrong_key_never_reaches_vllm(self):
        FakeVllm.seen.clear()
        for key in (None, "", "wrong", EDGE + "x", INTERNAL):
            self.assertEqual(self.call("POST", "/v1/chat/completions", {"messages": []}, key=key)[0], 401, key)
            self.assertEqual(self.call("GET", "/v1/models", key=key)[0], 401, key)
        self.assertEqual(FakeVllm.seen, [])

    def test_unauthenticated_vllm_routes_are_not_reachable_even_with_the_edge_key(self):
        FakeVllm.seen.clear()
        for method, path in [("POST", "/invocations"), ("GET", "/invocations"), ("GET", "/health"), ("GET", "/metrics"), ("GET", "/docs"),
                             ("GET", "/openapi.json"), ("POST", "/v1/completions"), ("POST", "/v1/embeddings"), ("POST", "/inference/v1/generate"),
                             ("GET", "/v1/chat/completions"), ("POST", "/v1/models"), ("POST", "/v1/chat/completions/../../invocations")]:
            code, out = self.call(method, path, {"messages": []} if method == "POST" else None)
            self.assertIn(code, (404, 405, 401), (method, path, code))
            self.assertNotIn("leak", out)
        self.assertFalse([x for x in FakeVllm.seen if x[1] not in ("/v1/chat/completions", "/v1/models")])

    def test_streaming_oversize_and_bad_json_are_refused_at_the_gate(self):
        FakeVllm.seen.clear()
        self.assertEqual(self.call("POST", "/v1/chat/completions", {"stream": True, "messages": []})[0], 400)
        self.assertEqual(self.call("POST", "/v1/chat/completions", raw=b"not json")[0], 400)
        self.assertEqual(self.call("POST", "/v1/chat/completions", {"messages": [{"role": "user", "content": "x" * (G.MAX_BODY + 5)}]})[0], 413)
        self.assertEqual(FakeVllm.seen, [])

    def test_model_down_is_a_generic_503(self):
        dead = G.make_server("127.0.0.1", 0, "http://127.0.0.1:1", EDGE, INTERNAL)
        threading.Thread(target=dead.serve_forever, daemon=True).start()
        self.addCleanup(lambda: (dead.shutdown(), dead.server_close()))
        req = urllib.request.Request(f"http://127.0.0.1:{dead.server_address[1]}/v1/models", headers={"Authorization": f"Bearer {EDGE}"})
        with self.assertRaises(urllib.error.HTTPError) as c:
            urllib.request.urlopen(req, timeout=10)
        self.assertEqual(c.exception.code, 503)

    def test_configuration_is_strict(self):
        with self.assertRaises(SystemExit):
            G.make_server("127.0.0.1", 0, "http://127.0.0.1:1", "short", INTERNAL)
        with self.assertRaises(SystemExit):
            G.make_server("127.0.0.1", 0, "http://127.0.0.1:1", EDGE, EDGE)       # keys must differ


if __name__ == "__main__":
    unittest.main()
