import json
import tempfile
import unittest
from pathlib import Path

import build_cloud_bundle as B


def tiny(root: Path):
    (root / "client/public/data").mkdir(parents=True, exist_ok=True)
    (root / "client/public/data/india_hex_props.json").write_text(json.dumps([{"h3_id": "x", "flood_risk": 1.0, "state": "A"}]))
    (root / "METHODOLOGY.md").write_text("Hazard indices are screening indices.")
    files = [{"path": p.relative_to(root).as_posix(), "bytes": p.stat().st_size, "sha256": B.sha256(p)} for p in B.files_of(root)]
    (root / "MANIFEST.json").write_text(json.dumps({"files": files}))


class Checker(unittest.TestCase):
    def setUp(self):
        self.d = Path(tempfile.mkdtemp())
        tiny(self.d)

    def findings(self):
        return B.check(self.d)

    def add(self, rel, text="x"):
        p = self.d / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
        m = json.loads((self.d / "MANIFEST.json").read_text())
        m["files"].append({"path": rel, "bytes": len(text), "sha256": B.sha256(p)})
        (self.d / "MANIFEST.json").write_text(json.dumps(m))

    def test_clean(self):
        self.assertEqual(self.findings(), [])

    def test_restricted_and_private_paths_are_caught(self):
        for rel in ("research/bhoomi_flood_v0/outputs/district_month_labels.csv", "client/public/data/forecast_risk.json",
                    "data/feedback.sqlite", "adapters/x/adapter_model.safetensors", "runtime/lora.gguf", ".env", "data/test_v3.jsonl"):
            self.add(rel)
            self.assertTrue(any("forbidden path" in f and Path(rel).name in f for f in self.findings()), rel)

    def test_secrets_and_local_paths_in_content_are_caught(self):
        self.add("deploy/a.env", "RUNPOD_API_KEY=abcdefghijklmnop1234")
        self.add("server/x.ts", "const p = '/Users/someone/private/file.csv'")
        out = " ".join(self.findings())
        self.assertIn("inline secret value", out)
        self.assertIn("absolute local path", out)

    def test_documents_naming_restricted_sources_are_caught(self):
        self.add("METHODOLOGY2.md", "Labels derive from the IFI-Impacts database.")
        self.assertTrue(any("restricted source" in f for f in self.findings()))

    def test_tampering_and_restricted_hex_fields_are_caught(self):
        (self.d / "METHODOLOGY.md").write_text("changed")
        self.assertTrue(any("hash differs" in f for f in self.findings()))
        tiny(self.d)
        (self.d / "client/public/data/india_hex_props.json").write_text(json.dumps([{"h3_id": "x", "monsoon_cv": 1}]))
        self.assertTrue(any("restricted-looking fields" in f for f in self.findings()))

    def test_restricted_fields_in_later_records_are_caught(self):
        (self.d / "client/public/data/india_hex_props.json").write_text(json.dumps([{"h3_id": "safe"}, {"h3_id": "bad", "monsoon_cv": 1}]))
        self.assertTrue(any("restricted-looking fields" in f for f in self.findings()))


if __name__ == "__main__":
    unittest.main()
