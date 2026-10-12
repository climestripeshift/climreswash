#!/usr/bin/env python3
"""Loopback relay between the Bhoomi AI Core and a Runpod Serverless (worker-vllm) OpenAI-compatible endpoint.

Why it exists: the Core's experimental backend only talks to a loopback model server (a deliberate gate that stays unchanged).
This relay *is* that loopback server; it is the single place that holds the Runpod API key and the only code that may reach the
network, and it can reach exactly one pinned URL.

What it enforces (all configurable only through the environment, never by a request):
  * upstream must be https://api.runpod.ai/v2/<endpoint-id>/openai/v1 (pinned; no redirects followed)
  * only POST /v1/chat/completions and GET /v1/models are forwarded; every other path is 404
  * the model name is overwritten with the pinned name; stream is forced off; max_tokens is clamped
  * request body size cap, per-request timeout, a concurrency cap, and a daily request cap that is independent of the gateway
Standard library only. Start:  RUNPOD_API_KEY=... RELAY_UPSTREAM=https://api.runpod.ai/v2/<id>/openai/v1 RELAY_MODEL=<name> python3 runpod_relay.py
"""
from __future__ import annotations

import json
from contextlib import closing
import os
import re
import sys
import sqlite3
import uuid
import calendar
from pathlib import Path
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

UPSTREAM_RE = re.compile(r"^https://api\.runpod\.ai/v2/[A-Za-z0-9]{6,40}/openai/v1$")
MAX_BODY = 256 * 1024


class Config:
    def __init__(self, env=None, allow_test_upstream: bool = False):
        e = os.environ if env is None else env
        self.upstream = (e.get("RELAY_UPSTREAM") or "").rstrip("/")
        ok = bool(UPSTREAM_RE.match(self.upstream))
        if allow_test_upstream:      # tests only: a plain-http loopback fake
            u = urlparse(self.upstream)
            ok = ok or (u.scheme == "http" and u.hostname in ("127.0.0.1", "localhost"))
        if not ok:
            raise SystemExit("RELAY_UPSTREAM must be https://api.runpod.ai/v2/<endpoint-id>/openai/v1")
        self.key = e.get("RUNPOD_API_KEY") or ""
        if not self.key and not allow_test_upstream:
            raise SystemExit("RUNPOD_API_KEY is required")
        self.model = e.get("RELAY_MODEL") or ""
        if not self.model:
            raise SystemExit("RELAY_MODEL (the pinned served model / LoRA name) is required")
        self.max_tokens = int(e.get("RELAY_MAX_TOKENS", "600"))
        self.timeout_s = float(e.get("RELAY_TIMEOUT_S", "180"))
        self.concurrency = int(e.get("RELAY_CONCURRENCY", "2"))
        self.daily_cap = int(e.get("RELAY_DAILY_REQUEST_CAP", "400"))
        self.port = int(e.get("RELAY_PORT", "8081"))
        self.test_only = allow_test_upstream
        self.database_url = e.get("RELAY_DATABASE_URL") or e.get("BETA_DATABASE_URL")
        if self.database_url:
            database = urlparse(self.database_url)
            if database.scheme not in ("postgres", "postgresql") or (database.hostname not in ("127.0.0.1", "localhost", "::1")
                    and parse_qs(database.query).get("sslmode") != ["verify-full"]):
                raise SystemExit("Remote relay PostgreSQL requires verified TLS")
        self.budget_db = e.get("RELAY_BUDGET_DB", "/data/relay-budget.sqlite")
        self.approval_file = e.get("RELAY_APPROVAL_FILE", "")
        self.billing_file = e.get("RELAY_BILLING_FILE", "")
        self.monthly_cap = int(e.get("RELAY_MONTHLY_CAP_MICRO_USD", "90000000"))
        self.reservation = int(e.get("RELAY_CALL_RESERVATION_MICRO_USD", "100000"))
        if min(self.max_tokens, self.timeout_s, self.concurrency, self.daily_cap, self.monthly_cap, self.reservation) <= 0:
            raise SystemExit("relay limits must be positive")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):  # noqa: D401
        return None


class Relay:
    def __init__(self, cfg: Config, clock=time.time):
        self.cfg, self.clock = cfg, clock
        self.sem = threading.BoundedSemaphore(cfg.concurrency)
        self.lock = threading.Lock()
        self.day, self.count = self._today(), 0
        self.opener = urllib.request.build_opener(_NoRedirect)
        if not cfg.test_only and cfg.database_url:
            with self._pg() as db:
                row = db.execute("SELECT version FROM bhoomi_beta.schema_migrations WHERE version=1").fetchone()
                if not row: raise RuntimeError("Apply beta migrations before relay startup")
        elif not cfg.test_only:
            Path(cfg.budget_db).parent.mkdir(parents=True, exist_ok=True)
            with closing(sqlite3.connect(cfg.budget_db)) as db, db:
                db.execute("CREATE TABLE IF NOT EXISTS budget (month TEXT PRIMARY KEY, reserved INTEGER NOT NULL, calls INTEGER NOT NULL)")
                db.execute("CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, calls INTEGER NOT NULL)")
                db.execute("CREATE TABLE IF NOT EXISTS control (key TEXT PRIMARY KEY, value TEXT)")

    def reserve_cloud_call(self) -> bool:
        if self.cfg.test_only:
            return True
        try:
            approval = json.loads(Path(self.cfg.approval_file).read_text())
            billing = json.loads(Path(self.cfg.billing_file).read_text())
            now = self.clock()
            if (approval.get("approved") is not True or not approval.get("approved_by")
                    or approval.get("endpoint") != self.cfg.upstream or approval.get("served_model") != self.cfg.model
                    or not approval.get("data_bundle_sha256") or not approval.get("model", {}).get("adapter_sha256")):
                return False
            # Operator/provider monitor supplies short-lived, private billing evidence. Missing/stale evidence stops dispatch.
            if (not isinstance(billing.get("observed_at"), (int, float)) or not 0 <= now - billing["observed_at"] <= 300
                    or billing.get("endpoint") != self.cfg.upstream or billing.get("month") != self._today()[:7]
                    or billing.get("shutdown_verified") is not True or billing.get("auto_pay_disabled") is not True
                    or not isinstance(billing.get("spent_micro_usd"), int) or billing["spent_micro_usd"] < 0):
                return False
            if self.cfg.database_url:
                return self._reserve_pg(billing)
            with closing(sqlite3.connect(self.cfg.budget_db)) as db, db:
                db.execute("BEGIN IMMEDIATE")
                paused = db.execute("SELECT value FROM control WHERE key='paused'").fetchone()
                if paused and paused[0] == "true": return False
                month, day = self._today()[:7], self._today()
                row = db.execute("SELECT reserved FROM budget WHERE month=?", (month,)).fetchone()
                daily = db.execute("SELECT calls FROM daily WHERE day=?", (day,)).fetchone()
                reserved = row[0] if row else 0
                if (daily and daily[0] >= self.cfg.daily_cap) or reserved + billing["spent_micro_usd"] + self.cfg.reservation > self.cfg.monthly_cap:
                    return False
                # No refunds: unknown work remains charged after timeouts and restarts. Intentionally conservative.
                db.execute("INSERT INTO budget VALUES (?,?,1) ON CONFLICT(month) DO UPDATE SET reserved=reserved+excluded.reserved,calls=calls+1", (month, self.cfg.reservation))
                db.execute("INSERT INTO daily VALUES (?,1) ON CONFLICT(day) DO UPDATE SET calls=calls+1", (day,))
                return True
        except Exception:
            return False

    def _pg(self):
        import psycopg
        return psycopg.connect(self.cfg.database_url, connect_timeout=5,
                               options="-c search_path=bhoomi_beta,pg_catalog -c statement_timeout=10000 -c lock_timeout=5000")

    def _reserve_pg(self, billing):
        with self._pg() as db:
            db.execute("SELECT pg_advisory_xact_lock(726402316)")
            if db.execute("SELECT 1 FROM settings WHERE key IN ('paused','relay_paused') AND value='true'").fetchone():
                return False
            day = self._today()
            month_start = calendar.timegm(time.strptime(day[:7] + "-01", "%Y-%m-%d")) * 1000
            day_start = calendar.timegm(time.strptime(day, "%Y-%m-%d")) * 1000
            reserved, daily = db.execute("SELECT COALESCE(SUM(reservation_micro_usd),0), COUNT(*) FILTER(WHERE ts >= %s) FROM relay_spending WHERE ts >= %s", (day_start,month_start)).fetchone()
            if daily >= self.cfg.daily_cap or reserved + billing["spent_micro_usd"] + self.cfg.reservation > self.cfg.monthly_cap:
                return False
            db.execute("INSERT INTO relay_spending(ts,reservation_micro_usd,request_id) VALUES(%s,%s,%s)",
                       (self.clock()*1000,self.cfg.reservation,uuid.uuid4().hex))
            return True

    def pause(self):
        if not self.cfg.test_only and self.cfg.database_url:
            with self._pg() as db:
                db.execute("SELECT pg_advisory_xact_lock(726402316)")
                db.execute("INSERT INTO settings VALUES('relay_paused','true') ON CONFLICT(key) DO UPDATE SET value='true'")
        elif not self.cfg.test_only:
            with closing(sqlite3.connect(self.cfg.budget_db)) as db, db:
                db.execute("INSERT INTO control VALUES ('paused','true') ON CONFLICT(key) DO UPDATE SET value='true'")

    def _today(self) -> str:
        return time.strftime("%Y-%m-%d", time.gmtime(self.clock()))

    def _take_daily(self) -> bool:
        with self.lock:
            if self._today() != self.day:
                self.day, self.count = self._today(), 0
            if self.count >= self.cfg.daily_cap:
                return False
            self.count += 1
            return True

    def forward(self, method: str, path: str, body: bytes) -> tuple[int, bytes]:
        if (method, path) == ("POST", "/v1/chat/completions"):
            try:
                req = json.loads(body.decode("utf-8"))
                assert isinstance(req, dict) and isinstance(req.get("messages"), list)
            except Exception:  # noqa: BLE001
                return 400, b'{"error":"bad request"}'
            req["model"] = self.cfg.model
            req["stream"] = False
            try:
                requested = int(req.get("max_tokens") or self.cfg.max_tokens)
                if requested <= 0: raise ValueError()
                req["max_tokens"] = min(requested, self.cfg.max_tokens)
            except (ValueError, TypeError):
                return 400, b'{"error":"bad token limit"}'
            data, url = json.dumps(req).encode("utf-8"), self.cfg.upstream + "/chat/completions"
        elif (method, path) == ("GET", "/v1/models"):
            data, url = None, self.cfg.upstream + "/models"
        else:
            return 404, b'{"error":"not found"}'
        if not self._take_daily():
            return 429, b'{"error":"daily relay cap reached"}'
        if not self.sem.acquire(blocking=False):
            return 429, b'{"error":"busy"}'
        try:
            if not self.reserve_cloud_call():
                return 503, b'{"error":"cloud dispatch is not approved or budget evidence is unavailable"}'
            r = urllib.request.Request(url, data=data, method=method, headers={
                "Content-Type": "application/json", "Authorization": f"Bearer {self.cfg.key}"})
            try:
                with self.opener.open(r, timeout=self.cfg.timeout_s) as resp:  # noqa: S310 - url pinned by Config
                    return resp.status, resp.read(4 * 1024 * 1024)
            except urllib.error.HTTPError as e:
                if e.code >= 500: self.pause()
                return (e.code if e.code in (400, 401, 404, 429, 500, 503) else 502), b'{"error":"upstream error"}'
            except Exception:  # noqa: BLE001
                self.pause()
                return 502, b'{"error":"upstream unreachable"}'
        finally:
            self.sem.release()


def make_server(cfg: Config, relay: Relay | None = None) -> ThreadingHTTPServer:
    relay = relay or Relay(cfg)

    class H(BaseHTTPRequestHandler):
        server_version = "relay"
        sys_version = ""

        def log_message(self, *a):  # no request bodies or keys in logs
            pass

        def _send(self, code: int, body: bytes):
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _do(self, method: str):
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                return self._send(413, b'{"error":"too large"}')
            body = self.rfile.read(n) if n else b""
            code, out = relay.forward(method, self.path.split("?")[0], body)
            self._send(code, out)

        def do_GET(self):
            self._do("GET")

        def do_POST(self):
            self._do("POST")

    srv = ThreadingHTTPServer(("127.0.0.1", cfg.port), H)    # loopback only, never configurable
    srv.daemon_threads = True
    return srv


if __name__ == "__main__":
    c = Config()
    s = make_server(c)
    print(f"relay on 127.0.0.1:{c.port} -> {urlparse(c.upstream).netloc}{urlparse(c.upstream).path.split('/openai')[0][:12]}…", file=sys.stderr)
    s.serve_forever()
