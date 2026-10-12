import json
import tempfile
import unittest
from pathlib import Path

from runpod_relay import Config, Relay


class SpendControls(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.now = 1791763200  # fixed October 2026 clock; no cloud access
        self.endpoint = "https://api.runpod.ai/v2/abcdef123/openai/v1"
        self.cfg = Config({"RELAY_UPSTREAM": self.endpoint, "RELAY_MODEL": "bhoomi-v1", "RUNPOD_API_KEY": "mock-test-key",
                           "RELAY_BUDGET_DB": str(self.root / "budget.sqlite"), "RELAY_APPROVAL_FILE": str(self.root / "approval.json"),
                           "RELAY_BILLING_FILE": str(self.root / "billing.json"), "RELAY_MONTHLY_CAP_MICRO_USD": "200000",
                           "RELAY_CALL_RESERVATION_MICRO_USD": "100000"})
        self.relay = Relay(self.cfg, clock=lambda: self.now)

    def approve(self):
        (self.root / "approval.json").write_text(json.dumps({"approved": True, "approved_by": "test-owner", "endpoint": self.endpoint,
                                                             "served_model": "bhoomi-v1", "data_bundle_sha256": "test-sha", "model": {"adapter_sha256": "test-sha"}}))
        self.billing = {"endpoint": self.endpoint, "month": self.relay._today()[:7], "observed_at": self.now,
                        "spent_micro_usd": 0, "shutdown_verified": True, "auto_pay_disabled": True}
        self.write_billing()

    def write_billing(self):
        (self.root / "billing.json").write_text(json.dumps(self.billing))

    def test_missing_approval_missing_stale_wrong_endpoint_and_negative_billing_are_denied(self):
        self.assertFalse(self.relay.reserve_cloud_call())
        self.approve()
        for changes in ({"observed_at": self.now - 301}, {"endpoint": "other"}, {"spent_micro_usd": -1}, {"auto_pay_disabled": False}):
            old = self.billing.copy(); self.billing.update(changes); self.write_billing()
            self.assertFalse(self.relay.reserve_cloud_call())
            self.billing = old

    def test_reservations_and_pause_survive_restart(self):
        self.approve()
        self.assertTrue(self.relay.reserve_cloud_call())
        other = Relay(self.cfg, clock=lambda: self.now)
        self.assertTrue(other.reserve_cloud_call())
        self.assertFalse(other.reserve_cloud_call())
        self.relay.pause()
        self.assertFalse(Relay(self.cfg, clock=lambda: self.now).reserve_cloud_call())

    def test_unapproved_dispatch_does_not_call_provider(self):
        class NoNetwork:
            def open(self, *args, **kwargs):
                raise AssertionError("network must not be reached")
        self.relay.opener = NoNetwork()
        code, _ = self.relay.forward("POST", "/v1/chat/completions", b'{"messages":[]}')
        self.assertEqual(code, 503)


if __name__ == "__main__":
    unittest.main()
