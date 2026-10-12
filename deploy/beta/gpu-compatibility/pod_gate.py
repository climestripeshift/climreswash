#!/usr/bin/env python3
"""Authenticating gate that runs INSIDE the GPU Pod in front of vLLM (Option A: Pod behind Runpod's HTTPS proxy).

Why: vLLM's --api-key only guards /v1, /v2 and /inference. Other routes (notably /invocations, which exposes the same inference)
remain unauthenticated, and vLLM's own documentation says not to rely on --api-key alone. Runpod's HTTP proxy publishes the port
on a public URL, so the only thing reachable from outside must be this gate:

  * listens on 0.0.0.0:GATE_PORT (the only HTTP port the Pod exposes); vLLM listens on 127.0.0.1 only
  * ONLY POST /v1/chat/completions and GET /v1/models are forwarded; every other path/method is 404/405 without reaching vLLM
  * every forwarded request must carry `Authorization: Bearer <edge key>` (constant-time compare); the edge key is NOT the vLLM key
  * request size cap; stream is refused; the vLLM internal key is injected here and never leaves the Pod
  * no redirects followed, upstream errors are generic, nothing about vLLM (version, routes, docs) is exposed
Standard library only (python3 is present in the vllm-openai image).
"""
from __future__ import annotations

import hmac
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY = 256 * 1024
ALLOWED = {("POST", "/v1/chat/completions"), ("GET", "/v1/models")}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def make_server(listen_host: str, listen_port: int, upstream: str, edge_key: str, vllm_key: str, timeout_s: float = 170.0):
    if len(edge_key) < 32 or not vllm_key or edge_key == vllm_key:
        raise SystemExit("edge key (32+ chars) and a different internal vLLM key are required")
    opener = urllib.request.build_opener(_NoRedirect)
    expected = edge_key.encode()

    class H(BaseHTTPRequestHandler):
        server_version = "gate"
        sys_version = ""

        def log_message(self, *a):
            pass

        def _send(self, code: int, body: bytes = b"{}"):
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _do(self, method: str):
            path = self.path.split("?")[0]
            if (method, path) not in ALLOWED:
                return self._send(404 if method in ("GET", "POST") else 405, b'{"error":"not found"}')
            supplied = (self.headers.get("Authorization") or "")
            if not supplied.startswith("Bearer ") or not hmac.compare_digest(supplied[7:].encode(), expected):
                return self._send(401, b'{"error":"unauthorized"}')
            data = None
            if method == "POST":
                n = int(self.headers.get("Content-Length") or 0)
                if n <= 0 or n > MAX_BODY:
                    return self._send(413 if n > MAX_BODY else 400, b'{"error":"bad size"}')
                data = self.rfile.read(n)
                try:
                    req = json.loads(data)
                    if not isinstance(req, dict) or req.get("stream") not in (None, False):
                        return self._send(400, b'{"error":"streaming is not supported"}')
                except ValueError:
                    return self._send(400, b'{"error":"bad request"}')
            r = urllib.request.Request(upstream + path, data=data, method=method,
                                       headers={"Content-Type": "application/json", "Authorization": f"Bearer {vllm_key}"})
            try:
                with opener.open(r, timeout=timeout_s) as resp:   # noqa: S310 - upstream is loopback, fixed at start-up
                    return self._send(resp.status, resp.read(4 * 1024 * 1024))
            except urllib.error.HTTPError as e:
                return self._send(e.code if e.code in (400, 404, 429, 500, 503) else 502, b'{"error":"upstream error"}')
            except Exception:  # noqa: BLE001
                return self._send(503, b'{"error":"model is not ready"}')

        def do_GET(self):
            self._do("GET")

        def do_POST(self):
            self._do("POST")

        do_PUT = do_DELETE = do_PATCH = do_HEAD = do_OPTIONS = lambda self: self._send(405, b'{"error":"method not allowed"}')

    srv = ThreadingHTTPServer((listen_host, listen_port), H)
    srv.daemon_threads = True
    return srv


def main() -> int:
    key_file = os.environ.get("GATE_EDGE_KEY_FILE", "/run/bhoomi/edge-key")
    vllm_key_file = os.environ.get("GATE_VLLM_KEY_FILE", "/run/bhoomi/api-key")
    with open(key_file) as f:
        edge = f.read().strip()
    with open(vllm_key_file) as f:
        internal = f.read().strip()
    upstream = os.environ.get("GATE_UPSTREAM", "http://127.0.0.1:8001")
    if not upstream.startswith("http://127.0.0.1:"):
        raise SystemExit("the model server must be on loopback")
    srv = make_server(os.environ.get("GATE_HOST", "0.0.0.0"), int(os.environ.get("GATE_PORT", "8000")), upstream, edge, internal)
    srv.serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
