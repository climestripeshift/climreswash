"""Standalone, localhost-only chat server (stdlib only).

Security posture
  * binds only to loopback; Host and Origin headers are checked (DNS-rebinding / CSRF);
  * JSON bodies only, hard size cap, strict field whitelist and types;
  * per-minute rate limit, session and turn caps, one model call at a time;
  * serves exactly one static page; no file path is ever taken from a request;
  * tools are read-only and file reads are restricted to an allowlist (config.check_readable);
  * no CORS headers, a strict CSP, and no request bodies in server logs.
This server is a research surface. It is not wired into the production Express app.
"""
from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import __version__
from .agent.orchestrator import Agent
from .agent.prompts import SYSTEM
from .agent.session import SessionLimitError, SessionManager
from .config import ROOT, load_config

SID = re.compile(r"^[0-9a-f]{24}$")
LOOPBACK = {"127.0.0.1", "localhost", "::1"}
PROMPT_SHA = hashlib.sha256(SYSTEM.encode()).hexdigest()[:16]


class RateLimiter:
    def __init__(self, per_min: int, clock=time.time):
        self.per_min, self.clock, self.q = per_min, clock, deque()
        self.lock = threading.Lock()

    def allow(self) -> bool:
        now = self.clock()
        with self.lock:
            while self.q and now - self.q[0] > 60:
                self.q.popleft()
            if len(self.q) >= self.per_min:
                return False
            self.q.append(now)
            return True


class App:
    """Transport-independent request handling (unit-testable without sockets)."""

    def __init__(self, agent: Agent, sessions: SessionManager, feedback, cfg: dict, clock=time.time):
        self.agent, self.sessions, self.feedback, self.cfg = agent, sessions, feedback, cfg
        lim = cfg["limits"]
        self.max_bytes = lim["max_request_bytes"]
        self.max_chars = cfg["agent"]["max_user_chars"]
        self.rate = RateLimiter(lim["rate_limit_per_min"], clock)
        self.model_lock = threading.Lock()
        self.page = (ROOT / "ui" / "index.html").read_bytes() if (ROOT / "ui" / "index.html").exists() else b"<h1>Bhoomi AI</h1>"

    # ---- helpers
    def allowed_hosts(self, port: int) -> set[str]:
        return {f"{h}:{port}" for h in ("127.0.0.1", "localhost", "[::1]")}

    @staticmethod
    def _trim(turn: dict, interaction_id: str) -> dict:
        return {
            "interaction_id": interaction_id, "session_id": turn["session_id"], "status": turn["status"],
            "answer": turn["answer"], "evidence": turn["evidence"], "links": turn["links"],
            "notes": turn.get("notes", []),
            "verification": {"passed": turn["verification"].get("passed"),
                             "violations": turn["verification"].get("violations", [])},
            "repaired": turn["repaired"], "fallback_used": turn["fallback_used"], "latency_s": turn["latency_s"],
            "tool_trace": [{"step": s["step"], "latency_s": s["latency_s"],
                            "calls": [{"name": c["name"], "arguments": c["arguments"], "status": c.get("status"),
                                       "errors": c.get("validation_errors")} for c in s["calls"]]}
                           for s in turn["trace"]],
            "facts": [{"id": f["id"], "label": f["key"], "display": f["display"]} for f in turn["facts"]],
            "model": {"name": turn["model"].get("model"), "digest": turn["model"].get("digest"),
                      **{k: turn["model"][k] for k in ("experimental", "evaluation_only", "deployable", "label", "registry_id",
                                                       "base_revision", "adapter_sha256") if k in turn["model"]}},
            "provenance": {"core_version": __version__, "prompt_sha256": PROMPT_SHA,
                           "tool_calls": turn["trace"], "results": turn.get("results", []), "deployment": "research"},
            "memory": turn["memory"],
        }

    # ---- API
    def chat(self, payload) -> tuple[int, dict]:
        if not isinstance(payload, dict) or set(payload) - {"message", "session_id", "deployment", "user_hash", "deadline_ms"}:
            return 400, {"error": "body must be an object with 'message' and optional 'session_id'"}
        msg, sid = payload.get("message"), payload.get("session_id")
        deployment, user_hash = payload.get("deployment"), payload.get("user_hash")
        end = payload.get("deadline_ms")
        if end is not None and (not isinstance(end, (int, float)) or not time.time() * 1000 < end <= (time.time() + 125) * 1000):
            return 400, {"error": "invalid deadline"}
        if deployment is not None and deployment not in ("local_dev", "cloud_beta"):
            return 400, {"error": "invalid deployment tag"}
        if user_hash is not None and not (isinstance(user_hash, str) and re.fullmatch(r"[0-9a-f]{16,64}", user_hash)):
            return 400, {"error": "invalid user_hash"}
        if not isinstance(msg, str) or not msg.strip():
            return 400, {"error": "'message' must be a non-empty string"}
        if len(msg) > self.max_chars:
            return 400, {"error": f"'message' is limited to {self.max_chars} characters"}
        if sid is not None and (not isinstance(sid, str) or not SID.match(sid)):
            return 400, {"error": "invalid session_id"}
        if not self.rate.allow():
            return 429, {"error": "rate limit exceeded; wait a moment"}
        try:
            session = self.sessions.begin_turn(sid)
        except SessionLimitError as e:
            return 429, {"error": str(e)}
        if not self.model_lock.acquire(blocking=False):
            return 429, {"error": "the model is busy with another request; try again shortly"}
        from .llm.deadline import deadline
        deadline_token = deadline.set(end / 1000 if end is not None else None)
        try:
            turn = self.agent.run_turn(session, msg).to_dict()
        finally:
            deadline.reset(deadline_token)
            self.model_lock.release()
        iid = self.feedback.log_interaction(turn, __version__, PROMPT_SHA, deployment=deployment, user_hash=user_hash)
        return 200, self._trim(turn, iid)

    def feedback_post(self, payload) -> tuple[int, dict]:
        if not isinstance(payload, dict) or set(payload) - {"interaction_id", "rating", "comment"}:
            return 400, {"error": "invalid feedback body"}
        iid, rating, comment = payload.get("interaction_id"), payload.get("rating"), payload.get("comment", "")
        if not isinstance(iid, str) or not re.fullmatch(r"[0-9a-f]{32}", iid) or rating not in ("up", "down") \
                or not isinstance(comment, str):
            return 400, {"error": "invalid feedback body"}
        try:
            self.feedback.add_user_feedback(iid, rating, comment)
        except KeyError:
            return 404, {"error": "unknown interaction"}
        return 200, {"ok": True, "note": "Recorded as user feedback only. It is not used for training without expert review."}

    def health(self) -> dict:
        return {"ok": True, "version": __version__, "model": self.agent.backend.model_info(),
                "memory": self.agent.guard.check(), "sessions": self.sessions.count(), "prompt_sha": PROMPT_SHA}


def make_handler(app: App, port: int):
    hosts = app.allowed_hosts(port)

    class H(BaseHTTPRequestHandler):
        server_version = "BhoomiAI"
        sys_version = ""

        def log_message(self, fmt, *a):  # no bodies, no client data
            pass

        def _send(self, code: int, body: bytes, ctype="application/json"):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy",
                             "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
                             "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, code, obj):
            self._send(code, json.dumps(obj, default=str).encode())

        def _guard(self) -> bool:
            host = self.headers.get("Host", "")
            if host not in hosts:
                self._json(403, {"error": "forbidden host"})
                return False
            origin = self.headers.get("Origin")
            if origin and origin not in {f"http://{h}" for h in hosts}:
                self._json(403, {"error": "forbidden origin"})
                return False
            return True

        def do_GET(self):
            if not self._guard():
                return
            if self.path in ("/", "/index.html"):
                self._send(200, app.page, "text/html; charset=utf-8")
            elif self.path == "/api/health":
                self._json(200, app.health())
            else:
                self._json(404, {"error": "not found"})

        def do_POST(self):
            if not self._guard():
                return
            if self.path not in ("/api/chat", "/api/feedback"):
                return self._json(404, {"error": "not found"})
            if not self.headers.get("Content-Type", "").startswith("application/json"):
                return self._json(415, {"error": "application/json required"})
            try:
                n = int(self.headers.get("Content-Length", ""))
            except ValueError:
                return self._json(411, {"error": "Content-Length required"})
            if n < 0 or n > app.max_bytes:
                return self._json(413, {"error": f"request body limited to {app.max_bytes} bytes"})
            try:
                payload = json.loads(self.rfile.read(n).decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return self._json(400, {"error": "invalid JSON"})
            code, body = app.chat(payload) if self.path == "/api/chat" else app.feedback_post(payload)
            self._json(code, body)

        def do_PUT(self):
            self._json(405, {"error": "method not allowed"})

        do_DELETE = do_PATCH = do_PUT

    return H


def serve(host: str | None = None, port: int | None = None, backend=None, cfg: dict | None = None):
    from .agent.orchestrator import Agent
    from .data_access import DataStore
    from .feedback import FeedbackStore
    from .llm import OllamaBackend
    from .tools import Registry
    cfg = cfg or load_config()
    host = host or cfg["server"]["host"]
    port = port or cfg["server"]["port"]
    if host not in LOOPBACK:
        raise SystemExit("refusing to bind to a non-loopback address")
    from .llm import make_backend
    backend = backend or make_backend(cfg)      # env-selected; default = the original local Ollama model (rollback path)
    store = DataStore(cfg)
    agent = Agent(backend, Registry(profile=cfg.get("deployment_profile")), store, cfg)
    lim = cfg["limits"]
    app = App(agent, SessionManager(lim["max_sessions"], lim["max_turns_per_session"], lim["session_idle_s"]),
              FeedbackStore(cfg["paths"]["feedback_db"]), cfg)
    srv = ThreadingHTTPServer((host, port), make_handler(app, port))
    srv.daemon_threads = True
    return srv, app


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int)
    a = ap.parse_args()
    srv, _ = serve(port=a.port)
    print(f"Bhoomi AI Core v{__version__} on http://{srv.server_address[0]}:{srv.server_address[1]} (localhost only)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
