import json
import threading
import time
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import runpod_relay as R


class Fake(BaseHTTPRequestHandler):
    seen: list = []
    models: list = [{"id": "bhoomi-v1", "object": "model", "parent": "Qwen/Qwen3-4B-Instruct-2507"}]

    def log_message(self, *a):
        pass

    def _out(self, obj):
        out = json.dumps(obj).encode()
        self.send_response(200); self.send_header("Content-Length", str(len(out))); self.end_headers(); self.wfile.write(out)

    def do_POST(self):
        b = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        Fake.seen.append({"path": self.path, "auth": self.headers.get("Authorization"), "body": b})
        if b["messages"][0]["content"] == "redirect":
            self.send_response(302); self.send_header("Location", "http://127.0.0.1:1/x"); self.end_headers(); return
        model = "attacker/other" if b["messages"][0]["content"] == "wrongmodel" else b.get("model")
        self._out({"model": model, "choices": [{"message": {"role": "assistant", "content": "ok"}}]})

    def do_GET(self):
        Fake.seen.append({"path": self.path, "auth": self.headers.get("Authorization"), "body": None})
        self._out({"object": "list", "data": Fake.models, "secret_extra": "must-not-be-forwarded"})


def env(**kw):
    e = {"RELAY_UPSTREAM": "http://127.0.0.1:%d/v2/abcdef123/openai/v1", "RELAY_MODEL": "bhoomi-v1", "RUNPOD_API_KEY": "k-secret",
         "RELAY_MAX_TOKENS": "100", "RELAY_DAILY_REQUEST_CAP": "3", "RELAY_PORT": "0"}
    e.update(kw)
    return e


class RelayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.up = ThreadingHTTPServer(("127.0.0.1", 0), Fake)
        cls.port = cls.up.server_address[1]
        threading.Thread(target=cls.up.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.up.shutdown()

    def start(self, **kw):
        e = env(**kw)
        e["RELAY_UPSTREAM"] = e["RELAY_UPSTREAM"] % self.port if "%d" in e["RELAY_UPSTREAM"] else e["RELAY_UPSTREAM"]
        cfg = R.Config(e, allow_test_upstream=True)
        srv = R.make_server(cfg)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.shutdown)
        return f"http://127.0.0.1:{srv.server_address[1]}"

    def post(self, base, path, payload):
        r = urllib.request.Request(base + path, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(r) as x:
                return x.status, json.loads(x.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    def test_model_pinned_stream_off_tokens_clamped_key_injected(self):
        Fake.seen.clear()
        s, out = self.post(self.start(), "/v1/chat/completions",
                           {"model": "attacker/other", "stream": True, "max_tokens": 99999, "messages": [{"role": "user", "content": "hi"}],
                            "tools": [{"type": "function"}]})
        self.assertEqual(s, 200)
        sent = Fake.seen[-1]
        self.assertEqual(sent["path"], "/v2/abcdef123/openai/v1/chat/completions")
        self.assertEqual(sent["body"]["model"], "bhoomi-v1")
        self.assertIs(sent["body"]["stream"], False)
        self.assertEqual(sent["body"]["max_tokens"], 100)
        self.assertEqual(sent["auth"], "Bearer k-secret")
        self.assertIn("tools", sent["body"])                # tool schemas pass through untouched

    def get(self, base, path):
        try:
            with urllib.request.urlopen(base + path) as x:
                return x.status, json.loads(x.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    def test_wrong_model_in_response_fails_closed_and_stops_dispatch(self):
        base = self.start()
        s, out = self.post(base, "/v1/chat/completions", {"messages": [{"role": "user", "content": "wrongmodel"}]})
        self.assertEqual((s, out["error"]), (502, "model identity check failed"))
        self.assertNotIn("attacker", json.dumps(out))
        Fake.seen.clear()
        s, _ = self.post(base, "/v1/chat/completions", {"messages": [{"role": "user", "content": "q"}]})
        self.assertEqual(s, 503)                              # stopped until an operator restarts/reviews
        self.assertEqual(Fake.seen, [])                       # and nothing further reached the provider

    def test_models_requires_pinned_lora_with_pinned_parent_and_is_sanitised(self):
        Fake.models = [{"id": "bhoomi-v1", "parent": "Qwen/Qwen3-4B-Instruct-2507", "owned_by": "x"},
                       {"id": "other", "parent": None}]
        try:
            s, out = self.get(self.start(), "/v1/models")
        finally:
            Fake.models = [{"id": "bhoomi-v1", "object": "model", "parent": "Qwen/Qwen3-4B-Instruct-2507"}]
        self.assertEqual(s, 200)
        self.assertEqual([d["id"] for d in out["data"]], ["bhoomi-v1"])
        self.assertEqual(out["data"][0]["parent"], "Qwen/Qwen3-4B-Instruct-2507")
        self.assertTrue(out["bhoomi_relay"]["verified"])
        self.assertNotIn("secret_extra", json.dumps(out))

    def test_models_with_wrong_parent_or_missing_lora_fails_closed(self):
        for models in ([{"id": "bhoomi-v1", "parent": "Qwen/Qwen2.5-3B"}], [{"id": "bhoomi-v1"}], [{"id": "not-ours", "parent": "Qwen/Qwen3-4B-Instruct-2507"}]):
            Fake.models = models
            try:
                base = self.start()
                self.assertEqual(self.get(base, "/v1/models")[0], 502, models)
                self.assertEqual(self.post(base, "/v1/chat/completions", {"messages": [{"role": "user", "content": "q"}]})[0], 503)
            finally:
                Fake.models = [{"id": "bhoomi-v1", "object": "model", "parent": "Qwen/Qwen3-4B-Instruct-2507"}]

    def test_verified_models_answer_is_cached_so_core_lookups_do_not_reach_the_provider(self):
        Fake.seen.clear()
        base = self.start()
        for _ in range(5):
            self.assertEqual(self.get(base, "/v1/models")[0], 200)
        self.assertEqual(len([x for x in Fake.seen if x["body"] is None]), 1)

    def test_identity_cache_expires(self):
        Fake.seen.clear()
        base = self.start(RELAY_IDENTITY_TTL_S="0.05")
        self.get(base, "/v1/models"); time.sleep(0.15); self.get(base, "/v1/models")
        self.assertEqual(len([x for x in Fake.seen if x["body"] is None]), 2)

    def test_pod_upstream_shape_and_credentials(self):
        good = "https://zdww5ekt7i887w-8000.proxy.runpod.net/v1"
        vllm_key = "v" * 43
        cfg = R.Config(env(RELAY_UPSTREAM=good, RELAY_UPSTREAM_KEY=vllm_key, RUNPOD_API_KEY="account-key"))
        self.assertEqual((cfg.kind, cfg.key), ("pod", vllm_key))
        for bad in ("https://zdww5ekt7i887w-8000.proxy.runpod.net/v1/../x", "http://zdww5ekt7i887w-8000.proxy.runpod.net/v1",
                    "https://zdww5ekt7i887w-8000.proxy.runpod.net.evil.com/v1", "https://evil.example/zdww5ekt7i887w-8000/v1",
                    "https://zdww5ekt7i887w.proxy.runpod.net/v1", "https://zdww5ekt7i887w-8000.proxy.runpod.net/openai/v1"):
            with self.assertRaises(SystemExit, msg=bad):
                R.Config(env(RELAY_UPSTREAM=bad, RELAY_UPSTREAM_KEY=vllm_key))
        with self.assertRaises(SystemExit):                   # no fallback to the account key
            R.Config(env(RELAY_UPSTREAM=good, RUNPOD_API_KEY="a" * 43))
        with self.assertRaises(SystemExit):                   # key must differ from the account key
            R.Config(env(RELAY_UPSTREAM=good, RELAY_UPSTREAM_KEY="a" * 43, RUNPOD_API_KEY="a" * 43))
        with self.assertRaises(SystemExit):                   # and be long enough to be a real secret
            R.Config(env(RELAY_UPSTREAM=good, RELAY_UPSTREAM_KEY="short"))

    def test_only_two_routes_exist(self):
        base = self.start()
        for p in ("/v1/completions", "/v1/embeddings", "/metrics", "/", "/v1/chat/completions/../x", "/v1/files"):
            self.assertEqual(self.post(base, p, {"messages": []})[0], 404, p)

    def test_bad_json_and_oversize_are_rejected(self):
        base = self.start()
        r = urllib.request.Request(base + "/v1/chat/completions", data=b"not json", method="POST")
        with self.assertRaises(urllib.error.HTTPError) as c:
            urllib.request.urlopen(r)
        self.assertEqual(c.exception.code, 400)
        big = {"messages": [{"role": "user", "content": "x" * (R.MAX_BODY + 10)}]}
        self.assertEqual(self.post(base, "/v1/chat/completions", big)[0], 413)

    def test_daily_cap_is_enforced_independently(self):
        base = self.start(RELAY_DAILY_REQUEST_CAP="2")
        codes = [self.post(base, "/v1/chat/completions", {"messages": [{"role": "user", "content": "q"}]})[0] for _ in range(4)]
        self.assertEqual(codes, [200, 200, 429, 429])

    def test_redirects_are_not_followed_and_upstream_errors_are_generic(self):
        s, out = self.post(self.start(), "/v1/chat/completions", {"messages": [{"role": "user", "content": "redirect"}]})
        self.assertEqual(s, 502)
        self.assertNotIn("127.0.0.1", json.dumps(out))

    def test_upstream_must_be_the_pinned_runpod_url(self):
        for bad in ("https://evil.example/v2/abcdef123/openai/v1", "http://api.runpod.ai/v2/abcdef123/openai/v1",
                    "https://api.runpod.ai/v2/abcdef123/openai/v1/../../x", "https://api.runpod.ai.evil.com/v2/abcdef123/openai/v1", ""):
            with self.assertRaises(SystemExit, msg=bad):
                R.Config(env(RELAY_UPSTREAM=bad))
        R.Config(env(RELAY_UPSTREAM="https://api.runpod.ai/v2/abcdef123/openai/v1"))

    def test_loopback_only(self):
        cfg = R.Config(env(RELAY_UPSTREAM="http://127.0.0.1:%d/v2/abcdef123/openai/v1" % self.port), allow_test_upstream=True)
        srv = R.make_server(cfg)
        self.addCleanup(srv.server_close)
        self.assertEqual(srv.server_address[0], "127.0.0.1")


if __name__ == "__main__":
    unittest.main()
