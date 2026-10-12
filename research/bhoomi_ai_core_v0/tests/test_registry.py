import json
import tempfile
import unittest
from pathlib import Path

import support
from bhoomi_ai.feedback import DatasetRegistry, FeedbackStore, RegistryError, validate_example


class RegistryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.d = Path(self.tmp.name)
        (self.d / "src").mkdir()
        (self.d / "src" / "a.py").write_text("x = 1\n")
        self.test_f, self.dev_f, self.rub = self.d / "test.jsonl", self.d / "dev.jsonl", self.d / "judge.py"
        self.test_f.write_text('{"q": "Will Barmer flood?"}\n')
        self.dev_f.write_text('{"q": "What is the flood index of Kota?"}\n')
        self.rub.write_text("# rubric\n")
        self.reg = DatasetRegistry(self.d / "registry.json")

    def test_freeze_and_verify(self):
        self.reg.register("dev", "development", self.dev_f, ["What is the flood index of Kota?"])
        self.reg.register("test", "test_untouched", self.test_f, ["Will Barmer flood?"], rubric_files=[self.rub],
                          code_root=self.d / "src", freeze=True)
        self.assertTrue(self.reg.verify("test", self.d / "src")["frozen"])

    def test_dataset_change_detected(self):
        self.reg.register("test", "test_untouched", self.test_f, ["Will Barmer flood?"], rubric_files=[self.rub], freeze=True)
        self.test_f.write_text('{"q": "edited after viewing results"}\n')
        with self.assertRaises(RegistryError):
            self.reg.verify("test")

    def test_rubric_change_detected(self):
        self.reg.register("test", "test_untouched", self.test_f, ["Will Barmer flood?"], rubric_files=[self.rub], freeze=True)
        self.rub.write_text("# loosened\n")
        with self.assertRaises(RegistryError):
            self.reg.verify("test")

    def test_code_change_detected(self):
        self.reg.register("test", "test_untouched", self.test_f, ["Will Barmer flood?"], code_root=self.d / "src", freeze=True)
        (self.d / "src" / "a.py").write_text("x = 2\n")
        with self.assertRaises(RegistryError):
            self.reg.verify("test", self.d / "src")

    def test_frozen_dataset_cannot_be_reregistered(self):
        self.reg.register("test", "test_untouched", self.test_f, ["Will Barmer flood?"], freeze=True)
        with self.assertRaises(RegistryError):
            self.reg.register("test", "test_untouched", self.test_f, ["another"])

    def test_same_question_cannot_sit_in_two_splits(self):
        self.reg.register("dev", "development", self.dev_f, ["Will Barmer flood?"])
        with self.assertRaises(RegistryError):
            self.reg.register("test", "test_untouched", self.test_f, ["will  barmer FLOOD?"])

    def test_training_leakage_rejected(self):
        self.reg.register("test", "test_untouched", self.test_f, ["Will Barmer flood?"], freeze=True)
        with self.assertRaises(RegistryError):
            self.reg.assert_no_leakage(["Will Barmer flood?"])
        self.reg.assert_no_leakage(["Something else entirely"])


class ExportAgainstRegistry(unittest.TestCase):
    def test_test_set_question_is_never_exported_for_training(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            tf = d / "t.jsonl"
            tf.write_text("x\n")
            reg = DatasetRegistry(d / "r.json")
            reg.register("test", "test_untouched", tf, ["Jodhpur hazards?"], freeze=True)
            fb = FeedbackStore(d / "fb.sqlite")
            turn = {"session_id": "s", "request": "Jodhpur hazards?", "status": "verified", "answer": "ok 4.76",
                    "model": {"model": "m"}, "trace": [], "results": [], "verification": {}, "latency_s": 1,
                    "prompt_tokens": 1, "completion_tokens": 1}
            iid = fb.log_interaction(turn, "0.2.0")
            fb.add_review(iid, "Dr A", "correct", authorize_training=True, authorized_by="PI")
            m = fb.export_training_jsonl(d / "o.jsonl", "SYS", registry=reg)
            self.assertEqual((m["written"], m["skipped"]["leakage"]), (0, 1))

    def test_exported_example_validates_against_schema(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            fb = FeedbackStore(d / "fb.sqlite")
            turn = {"session_id": "s", "request": "A fresh question", "status": "verified", "answer": "answer 1.0",
                    "model": {"model": "m", "digest": "x"},
                    "trace": [{"step": 0, "calls": [{"name": "wash_context", "arguments": {"district": "Kota"}, "status": "ok"}]}],
                    "results": [], "verification": {}, "latency_s": 1, "prompt_tokens": 1, "completion_tokens": 1}
            iid = fb.log_interaction(turn, "0.2.0", "psha")
            fb.add_review(iid, "Dr A", "correct", authorize_training=True, authorized_by="PI")
            fb.export_training_jsonl(d / "o.jsonl", "SYS", tool_specs=[{"a": 1}])
            ex = json.loads((d / "o.jsonl").read_text().splitlines()[0])
            self.assertEqual(validate_example(ex), [])
            self.assertEqual(ex["target"]["tool_calls"][0]["name"], "wash_context")
            self.assertEqual(ex["provenance"]["system_prompt_sha"], "psha")
            ex["messages"][-1]["content"] = "<tool_call>{}</tool_call>"
            self.assertTrue(validate_example(ex))


if __name__ == "__main__":
    unittest.main()
