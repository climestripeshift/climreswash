#!/usr/bin/env python3
"""Provider billing / shutdown evidence monitor for the beta relay.

The relay refuses to dispatch unless RELAY_BILLING_FILE holds evidence that is at most 300 s old (see runpod_relay.reserve_cloud_call).
Nothing on an ephemeral Autoscale replica produces that file by itself; this process does. It is read-only against the provider
(GET only) except for one explicit, opt-in action: stopping the single approved Pod when a spending or uptime ceiling is breached.

Evidence written (atomically, mode 0600), all derived from provider reads, never from the relay or the model:
  endpoint           must equal RELAY_UPSTREAM exactly (the relay compares)
  month              UTC YYYY-MM the spend refers to
  observed_at        epoch seconds of the provider reads
  spent_micro_usd    month-to-date provider-billed spend for THIS endpoint/Pod (MONITOR_ACCOUNT_WIDE=1: whole account)
  shutdown_verified  serverless: workersMin == 0 and workersMax <= MONITOR_MAX_WORKERS (scale-to-zero, bounded)
                     pod:        Pod readable, desiredStatus RUNNING/EXITED, uptime <= MONITOR_POD_MAX_UPTIME_S
  auto_pay_disabled  NOT readable from the REST API: the operator attests it with MONITOR_AUTOPAY_DISABLED=1 after checking the
                     Runpod console. The attestation is recorded as such ("auto_pay_attested_by_operator").

If any provider read fails the file is NOT rewritten, so the relay's 300 s staleness rule stops dispatch (fail closed).
Standard library only. Credentials: RUNPOD_MONITOR_API_KEY (a restricted/read-only key is recommended); a serverless deployment may
fall back to RUNPOD_API_KEY. A Pod deployment must supply the account key explicitly (its relay key is a different vLLM secret).
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from runpod_relay import classify_upstream  # noqa: E402

API_BASE = "https://rest.runpod.io/v1"
USER_AGENT = "Bhoomi-Beta-Monitor/1.0"        # the API edge rejects the default urllib agent


class MonitorError(RuntimeError):
    pass


class MonitorConfig:
    def __init__(self, env=None, api_base: str = API_BASE, allow_test_base: bool = False):
        e = os.environ if env is None else env
        self.upstream = (e.get("RELAY_UPSTREAM") or "").rstrip("/")
        self.kind = classify_upstream(self.upstream)
        if self.kind is None:
            raise SystemExit("RELAY_UPSTREAM must be a pinned Runpod serverless or Pod proxy URL")
        if self.kind == "serverless":
            self.resource_id = re.match(r"^https://api\.runpod\.ai/v2/([A-Za-z0-9]+)/openai/v1$", self.upstream).group(1)
            self.key = e.get("RUNPOD_MONITOR_API_KEY") or e.get("RUNPOD_API_KEY") or ""
        else:
            self.resource_id = re.match(r"^https://([a-z0-9]+)-[0-9]+\.proxy\.runpod\.net/v1$", self.upstream).group(1)
            self.key = e.get("RUNPOD_MONITOR_API_KEY") or ""
        if not self.key:
            raise SystemExit("RUNPOD_MONITOR_API_KEY is required" + (" (or RUNPOD_API_KEY)" if self.kind == "serverless" else ""))
        if api_base != API_BASE and not allow_test_base:
            raise SystemExit("custom provider API base is for tests only")
        self.api_base = api_base.rstrip("/")
        out = e.get("MONITOR_OUT") or e.get("RELAY_BILLING_FILE") or ""
        if not out:                                  # Path("") is truthy ('.'): check the string
            raise SystemExit("MONITOR_OUT or RELAY_BILLING_FILE is required")
        self.out = Path(out)
        self.interval_s = max(15.0, min(float(e.get("MONITOR_INTERVAL_S", "60")), 240.0))
        self.max_workers = int(e.get("MONITOR_MAX_WORKERS", "1"))
        self.pod_max_uptime_s = int(e.get("MONITOR_POD_MAX_UPTIME_S", str(8 * 3600)))
        self.stop_pod_on_breach = e.get("MONITOR_STOP_POD_ON_BREACH") == "1"
        self.account_wide = e.get("MONITOR_ACCOUNT_WIDE") == "1"
        self.autopay_attested = e.get("MONITOR_AUTOPAY_DISABLED") == "1"
        self.monthly_cap_micro = int(e.get("RELAY_MONTHLY_CAP_MICRO_USD", "90000000"))
        self.timeout_s = 15.0


class Monitor:
    def __init__(self, cfg: MonitorConfig, clock=time.time, opener=None):
        self.cfg, self.clock = cfg, clock
        self.opener = opener or urllib.request.build_opener()
        self.stopped_pod = False

    # ---- provider reads ---------------------------------------------------------------------------------------------
    def _get(self, path: str, params: dict | None = None):
        url = self.cfg.api_base + path + ("?" + urllib.parse.urlencode(params) if params else "")
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {self.cfg.key}", "User-Agent": USER_AGENT,
                                                   "Accept": "application/json"})
        try:
            with self.opener.open(req, timeout=self.cfg.timeout_s) as r:   # noqa: S310 - base is pinned by MonitorConfig
                return json.loads(r.read(2 * 1024 * 1024))
        except (urllib.error.URLError, OSError, ValueError, TimeoutError) as e:
            raise MonitorError(f"provider read failed: {type(e).__name__}") from e

    def _post(self, path: str):
        req = urllib.request.Request(self.cfg.api_base + path, data=b"", method="POST",
                                     headers={"Authorization": f"Bearer {self.cfg.key}", "User-Agent": USER_AGENT})
        try:
            with self.opener.open(req, timeout=self.cfg.timeout_s) as r:   # noqa: S310
                r.read(1024)
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            raise MonitorError(f"provider action failed: {type(e).__name__}") from e

    def _month_spend_micro(self) -> int:
        now = datetime.fromtimestamp(self.clock(), timezone.utc)
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        window = {"bucketSize": "month", "startTime": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                  "endTime": datetime.fromtimestamp(self.clock() + 3600, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
        reads = []
        if self.cfg.account_wide:
            reads = [("/billing/endpoints", window), ("/billing/pods", window)]
        elif self.cfg.kind == "serverless":
            reads = [("/billing/endpoints", {**window, "endpointId": self.cfg.resource_id})]
        else:
            reads = [("/billing/pods", {**window, "podId": self.cfg.resource_id})]
        total = 0.0
        for path, params in reads:
            rows = self._get(path, params)
            if not isinstance(rows, list):
                raise MonitorError("unexpected billing response shape")
            for row in rows:
                amount = row.get("amount") if isinstance(row, dict) else None
                if not isinstance(amount, (int, float)) or amount < 0:
                    raise MonitorError("invalid billing amount")
                total += float(amount)
        return int(round(total * 1_000_000))

    def _shutdown_state(self, spent_micro: int) -> bool:
        if self.cfg.kind == "serverless":
            ep = self._get(f"/endpoints/{self.cfg.resource_id}")
            return (isinstance(ep, dict) and ep.get("workersMin") == 0
                    and isinstance(ep.get("workersMax"), int) and 0 < ep["workersMax"] <= self.cfg.max_workers)
        pod = self._get(f"/pods/{self.cfg.resource_id}")
        if not isinstance(pod, dict) or pod.get("desiredStatus") not in ("RUNNING", "EXITED"):
            return False
        breach = spent_micro >= self.cfg.monthly_cap_micro
        started = pod.get("lastStartedAt")
        if pod["desiredStatus"] == "RUNNING" and isinstance(started, str):
            try:
                began = datetime.fromisoformat(started.replace("Z", "+00:00")).timestamp()
                breach = breach or (self.clock() - began) > self.cfg.pod_max_uptime_s
            except ValueError:
                breach = True
        if breach and pod["desiredStatus"] == "RUNNING" and self.cfg.stop_pod_on_breach:
            self._post(f"/pods/{self.cfg.resource_id}/stop")      # the only mutation this process can perform
            self.stopped_pod = True
        return not breach

    # ---- one observation --------------------------------------------------------------------------------------------
    def observe(self) -> dict:
        spent = self._month_spend_micro()
        shutdown = self._shutdown_state(spent)
        now = self.clock()
        return {"endpoint": self.cfg.upstream, "month": time.strftime("%Y-%m", time.gmtime(now)), "observed_at": now,
                "spent_micro_usd": spent, "shutdown_verified": bool(shutdown),
                "auto_pay_disabled": bool(self.cfg.autopay_attested), "auto_pay_attested_by_operator": bool(self.cfg.autopay_attested),
                "upstream_kind": self.cfg.kind, "source": "provider-rest-v1"}

    def write(self, evidence: dict) -> None:
        out = self.cfg.out
        out.parent.mkdir(parents=True, exist_ok=True)
        tmp = out.with_name(out.name + f".{os.getpid()}.tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(evidence, f)
        os.replace(tmp, out)

    def run_once(self) -> bool:
        try:
            self.write(self.observe())
            return True
        except MonitorError as e:
            print(f"[billing-monitor] {e}", file=sys.stderr, flush=True)   # no URLs, keys or bodies
            return False

    def run_forever(self) -> None:
        while True:
            self.run_once()
            time.sleep(self.cfg.interval_s)


def main(argv=None) -> int:
    once = "--once" in (argv if argv is not None else sys.argv[1:])
    monitor = Monitor(MonitorConfig())
    if once:
        ok = monitor.run_once()
        print(json.dumps({"ok": ok, "out": str(monitor.cfg.out), "kind": monitor.cfg.kind}))
        return 0 if ok else 1
    monitor.run_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
