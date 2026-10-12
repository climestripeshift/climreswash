import tempfile
import unittest
from pathlib import Path

import compatibility_probe as P
from bhoomi_ai.llm.scripted_backend import ScriptedBackend, call, say


class CompatibilityTests(unittest.TestCase):
    def test_real_tools_verifier_and_fault_injection_with_test_only_model(self):
        (P.CORE / "data").mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="compat-unit-", dir=P.CORE / "data") as temp:
            cfg = P.synthetic_config(Path(temp))
            backend = ScriptedBackend([call("district_hazard_profile", district="Kota", state="Rajasthan"),
                                       say("Kota's overall screening index is 2.50 (index, 0-10 scale) [F1]."),
                                       call("district_hazard_profile", district="Kota", state="Rajasthan")])
            rows = P.evaluate(backend, cfg)
            self.assertTrue(all(row["passed"] for row in rows), rows)

    def test_wrong_geography_cannot_pass_probe(self):
        with tempfile.TemporaryDirectory(prefix="compat-unit-", dir=P.CORE / "data") as temp:
            cfg = P.synthetic_config(Path(temp))
            backend = ScriptedBackend([call("district_hazard_profile", district="Jaipur", state="Rajasthan"),
                                       say("Jaipur's overall screening index is 7.50 [F1]."),
                                       call("district_hazard_profile", district="Jaipur", state="Rajasthan")])
            self.assertFalse(any(row["passed"] for row in P.evaluate(backend, cfg)))
