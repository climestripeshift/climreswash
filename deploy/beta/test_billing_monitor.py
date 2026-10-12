"""Billing/shutdown evidence monitor against a loopback fake provider. No network, credentials or cloud resources."""
import io
import json
import os
import stat
import tempfile
import threading
import time
import unittest
from contextlib import redirect_stderr
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import billing_monitor as M
import runpod_relay as R

NOW = 1791763200  # fixed October 2026 clock
SERVERLESS = "https://api.runpod.ai/v2/abcdef123/openai/v1"
POD = "https://zdww5ekt7i887w-8000.proxy.runpod.net/v1"


class Provider(BaseHTTPRequestHandler):
    state: dict = {}
    seen: list = []

    def log_message(self, *a):
        pass

    def _send(self, code, obj):
        out = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Length", str(len(out))); self.end_headers(); self.wfile.write(out)

    def do_GET(self):
        u = urlparse(self.path)
        Provider.seen.append(("GET", u.path, parse_qs(u.query), self.headers.get("Authorization"), self.headers.get("User-Agent")))
        s = Provider.state
        if s.get("fail"):
            return self._send(500, {"error": "boom"})
        if u.path == "/billing/endpoints":
            return self._send(200, s.get("endpoint_billing", []))
        if u.path == "/billing/pods":
            return self._send(200, s.get("pod_billing", []))
        if u.path.startswith("/endpoints/"):
            return self._send(200, s.get("endpoint", {"workersMin": 0, "workersMax": 1}))
        if u.path.startswith("/pods/"):
            return self._send(200, s.get("pod", {"desiredStatus": "RUNNING", "lastStartedAt": "2026-10-12T22:00:00Z"}))
        self._send(404, {})

    def do_POST(self):
        Provider.seen.append(("POST", self.path, None, self.headers.get("Authorization"), self.headers.get("User-Agent")))
        self._send(200, {})


class MonitorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), Provider)
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); cls.srv.server_close()

    def setUp(self):
        Provider.state, Provider.seen = {}, []
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out = Path(self.tmp.name) / "run" / "billing.json"

    def monitor(self, upstream=SERVERLESS, clock=lambda: NOW, **env):
        e = {"RELAY_UPSTREAM": upstream, "RUNPOD_MONITOR_API_KEY": "monitor-key-secret", "MONITOR_OUT": str(self.out),
             "MONITOR_AUTOPAY_DISABLED": "1", "RELAY_MONTHLY_CAP_MICRO_USD": "5000000"}
        e.update(env)
        return M.Monitor(M.MonitorConfig(e, api_base=self.base, allow_test_base=True), clock=clock)

    def evidence(self):
        return json.loads(self.out.read_text())

    # ---- serverless ------------------------------------------------------------------------------------------------
    def test_serverless_evidence_is_exactly_what_the_relay_requires(self):
        Provider.state["endpoint_billing"] = [{"amount": 0.25}, {"amount": 0.125}]
        m = self.monitor()
        self.assertTrue(m.run_once())
        ev = self.evidence()
        self.assertEqual(ev["endpoint"], SERVERLESS)
        self.assertEqual(ev["spent_micro_usd"], 375000)
        self.assertEqual(ev["month"], "2026-10")
        self.assertTrue(ev["shutdown_verified"] and ev["auto_pay_disabled"])
        self.assertEqual(stat.S_IMODE(self.out.stat().st_mode), 0o600)
        # the relay accepts this evidence (same fields, same endpoint) and nothing else is needed
        approval = Path(self.tmp.name) / "approval.json"
        approval.write_text(json.dumps({"approved": True, "approved_by": "owner", "endpoint": SERVERLESS, "served_model": "bhoomi-v1",
                                        "data_bundle_sha256": "x", "model": {"adapter_sha256": "x"}}))
        cfg = R.Config({"RELAY_UPSTREAM": SERVERLESS, "RELAY_MODEL": "bhoomi-v1", "RUNPOD_API_KEY": "k",
                        "RELAY_BUDGET_DB": str(Path(self.tmp.name) / "b.sqlite"), "RELAY_APPROVAL_FILE": str(approval),
                        "RELAY_BILLING_FILE": str(self.out)})
        self.assertTrue(R.Relay(cfg, clock=lambda: NOW).reserve_cloud_call())
        self.assertFalse(R.Relay(R.Config({"RELAY_UPSTREAM": SERVERLESS, "RELAY_MODEL": "bhoomi-v1", "RUNPOD_API_KEY": "k",
                                           "RELAY_BUDGET_DB": str(Path(self.tmp.name) / "c.sqlite"), "RELAY_APPROVAL_FILE": str(approval),
                                           "RELAY_BILLING_FILE": str(self.out)}), clock=lambda: NOW + 301).reserve_cloud_call())

    def test_reads_are_scoped_to_the_endpoint_and_month_and_carry_only_the_monitor_key(self):
        self.monitor().run_once()
        gets = [x for x in Provider.seen if x[0] == "GET"]
        billing = next(x for x in gets if x[1] == "/billing/endpoints")
        self.assertEqual(billing[2]["endpointId"], ["abcdef123"])
        self.assertTrue(billing[2]["startTime"][0].startswith("2026-10-01T00:00:00"))
        for g in gets:
            self.assertEqual(g[3], "Bearer monitor-key-secret")
            self.assertEqual(g[4], M.USER_AGENT)
        self.assertFalse([x for x in Provider.seen if x[0] == "POST"])

    def test_scale_to_zero_is_required(self):
        for ep in ({"workersMin": 1, "workersMax": 1}, {"workersMin": 0, "workersMax": 3}, {"workersMin": 0, "workersMax": 0}, {}):
            Provider.state["endpoint"] = ep
            self.monitor().run_once()
            self.assertFalse(self.evidence()["shutdown_verified"], ep)

    def test_autopay_is_only_ever_an_operator_attestation(self):
        self.monitor(MONITOR_AUTOPAY_DISABLED="0").run_once()
        ev = self.evidence()
        self.assertFalse(ev["auto_pay_disabled"] or ev["auto_pay_attested_by_operator"])

    def test_provider_failure_leaves_stale_evidence_so_the_relay_stops(self):
        m = self.monitor()
        self.assertTrue(m.run_once())
        before = self.out.read_text()
        Provider.state["fail"] = True
        err = io.StringIO()
        with redirect_stderr(err):
            self.assertFalse(self.monitor(clock=lambda: NOW + 120).run_once())
        self.assertEqual(self.out.read_text(), before)                  # not refreshed => 300 s later the relay denies
        self.assertNotIn("monitor-key-secret", err.getvalue())
        self.assertNotIn("127.0.0.1", err.getvalue())

    def test_invalid_billing_rows_are_not_trusted(self):
        for rows in ([{"amount": -1}], [{"amount": "1"}], {"amount": 1}, [{}]):
            Provider.state["endpoint_billing"] = rows
            with redirect_stderr(io.StringIO()):
                self.assertFalse(self.monitor().run_once(), rows)
        self.assertFalse(self.out.exists())

    def test_account_wide_mode_sums_endpoint_and_pod_billing(self):
        Provider.state.update(endpoint_billing=[{"amount": 1.0}], pod_billing=[{"amount": 0.5}])
        self.monitor(MONITOR_ACCOUNT_WIDE="1").run_once()
        self.assertEqual(self.evidence()["spent_micro_usd"], 1_500_000)

    # ---- pod ---------------------------------------------------------------------------------------------------------
    def test_pod_uptime_breach_stops_only_the_approved_pod_when_enabled(self):
        Provider.state["pod"] = {"desiredStatus": "RUNNING", "lastStartedAt": "2026-10-11T00:00:00Z"}   # > 8 h before NOW
        self.monitor(POD, MONITOR_STOP_POD_ON_BREACH="1").run_once()
        posts = [x for x in Provider.seen if x[0] == "POST"]
        self.assertEqual([p[1] for p in posts], ["/pods/zdww5ekt7i887w/stop"])
        self.assertFalse(self.evidence()["shutdown_verified"])

    def test_pod_breach_without_the_opt_in_never_mutates(self):
        Provider.state["pod"] = {"desiredStatus": "RUNNING", "lastStartedAt": "2026-10-11T00:00:00Z"}
        self.monitor(POD).run_once()
        self.assertFalse([x for x in Provider.seen if x[0] == "POST"])
        self.assertFalse(self.evidence()["shutdown_verified"])

    def test_pod_spend_breach_stops_pod_and_healthy_pod_is_untouched(self):
        Provider.state.update(pod={"desiredStatus": "RUNNING", "lastStartedAt": "2026-10-12T21:00:00Z"}, pod_billing=[{"amount": 6.0}])
        self.monitor(POD, MONITOR_STOP_POD_ON_BREACH="1").run_once()
        self.assertEqual(len([x for x in Provider.seen if x[0] == "POST"]), 1)
        Provider.seen.clear()
        Provider.state.update(pod_billing=[{"amount": 0.2}])
        self.monitor(POD, MONITOR_STOP_POD_ON_BREACH="1").run_once()
        self.assertFalse([x for x in Provider.seen if x[0] == "POST"])
        self.assertTrue(self.evidence()["shutdown_verified"])

    def test_unknown_pod_state_is_not_verified(self):
        Provider.state["pod"] = {"desiredStatus": "TERMINATED"}
        self.monitor(POD).run_once()
        self.assertFalse(self.evidence()["shutdown_verified"])

    # ---- configuration -----------------------------------------------------------------------------------------------
    def test_configuration_is_strict(self):
        base = {"MONITOR_OUT": str(self.out)}
        with self.assertRaises(SystemExit):
            M.MonitorConfig({**base, "RELAY_UPSTREAM": "https://evil.example/v1", "RUNPOD_MONITOR_API_KEY": "k"})
        with self.assertRaises(SystemExit):        # a Pod deployment never falls back to RUNPOD_API_KEY
            M.MonitorConfig({**base, "RELAY_UPSTREAM": POD, "RUNPOD_API_KEY": "k"})
        M.MonitorConfig({**base, "RELAY_UPSTREAM": SERVERLESS, "RUNPOD_API_KEY": "k"})   # serverless may fall back
        with self.assertRaises(SystemExit):        # provider base URL is not configurable outside tests
            M.MonitorConfig({**base, "RELAY_UPSTREAM": SERVERLESS, "RUNPOD_API_KEY": "k"}, api_base="https://evil.example/v1")
        with self.assertRaises(SystemExit):
            M.MonitorConfig({"RELAY_UPSTREAM": SERVERLESS, "RUNPOD_API_KEY": "k"})       # no output path
        self.assertEqual(M.MonitorConfig({**base, "RELAY_UPSTREAM": SERVERLESS, "RUNPOD_API_KEY": "k", "MONITOR_INTERVAL_S": "1"}).interval_s, 15.0)


if __name__ == "__main__":
    unittest.main()
