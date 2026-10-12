import json
import threading
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import runpod_relay as R


class Fake(BaseHTTPRequestHandler):
    seen: list = []

    def log_message(self, *a):
        pass

    def do_POST(self):
        b = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        Fake.seen.append({"path": self.path, "auth": self.headers.get("Authorization"), "body": b})
        if b["messages"][0]["content"] == "redirect":
            self.send_response(302); self.send_header("Location", "http://127.0.0.1:1/x"); self.end_headers(); return
        out = json.dumps({"choices": [{"message": {"role": "assistant", "content": "ok"}}]}).encode()
        self.send_response(200); self.send_header("Content-Length", str(len(out))); self.end_headers(); self.wfile.write(out)

    do_GET = lambda self: (self.send_response(200), self.send_header("Content-Length", "2"), self.end_headers(), self.wfile.write(b"{}"))


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
