"""Experimental (evaluation-only) backend gate. The production 'accepted' gate must stay exactly as strict as before."""
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from support import ROOT  # noqa: F401  (puts src on sys.path)

from bhoomi_ai.config import load_config
from bhoomi_ai.llm import LLMError, make_backend
from bhoomi_ai.llm.experimental import ExperimentalBackend
from bhoomi_ai.llm.ollama_backend import OllamaBackend

CFG = load_config()


def registry(**entry):
    base = {"id": "exp-1", "kind": "lora_adapter", "status": "experimental_machine_verified", "deployable": False,
            "label": "Bhoomi-LLM-v1 (experimental)", "base_revision": "cdbee75f", "adapter_sha256": "46227026"}
    base.update(entry)
    d = Path(tempfile.mkdtemp()) / "models.json"
    d.write_text(json.dumps({"models": [base]}))
    return str(d)


def env(reg, **extra):
    e = {"BHOOMI_LLM_BACKEND": "openai_compat", "BHOOMI_LLM_EXPERIMENTAL": "1", "BHOOMI_LLM_MODEL_ID": "exp-1",
         "BHOOMI_LLM_REGISTRY": reg, "BHOOMI_LLM_MODEL": "bhoomi-llm-v1-ckpt160"}
    e.update(extra)
    return e


class ExperimentalGate(unittest.TestCase):
    def test_default_is_still_the_original_ollama_model(self):
        self.assertIsInstance(make_backend(CFG, {}), OllamaBackend)

    def test_experimental_entry_loads_and_is_labelled(self):
        be = make_backend(CFG, env(registry()))
        self.assertIsInstance(be, ExperimentalBackend)
        be._request = lambda path, payload=None: {"data": [{"id": "x"}]}      # no server needed
        info = be.model_info()
        self.assertTrue(info["experimental"])
        self.assertTrue(info["evaluation_only"])
        self.assertIs(info["deployable"], False)
        self.assertEqual(info["registry_id"], "exp-1")
        self.assertEqual(info["registry_status"], "experimental_machine_verified")

    def test_production_gate_still_refuses_the_same_entry(self):
        e = env(registry())
        del e["BHOOMI_LLM_EXPERIMENTAL"]
        with self.assertRaisesRegex(LLMError, "only 'accepted'"):
            make_backend(CFG, e)

    def test_flag_requires_the_openai_compat_backend(self):
        with self.assertRaises(LLMError):
            make_backend(CFG, env(registry(), BHOOMI_LLM_BACKEND="ollama"))

    def test_refused_unless_registry_entry_is_experimental_and_not_deployable(self):
        for bad in ({"status": "accepted"}, {"status": "baseline"}, {"deployable": True}, {"deployable": None}):
            with self.subTest(bad=bad), self.assertRaises(LLMError):
                make_backend(CFG, env(registry(**bad)))
        with self.assertRaises(LLMError):
            make_backend(CFG, env(registry(), BHOOMI_LLM_MODEL_ID="missing"))
        e = env(registry())
        del e["BHOOMI_LLM_REGISTRY"]
        with self.assertRaises(LLMError):
            make_backend(CFG, e)

    def test_never_in_production(self):
        for k in ("NODE_ENV", "BHOOMI_AI_ENV"):
            with self.subTest(k=k), self.assertRaisesRegex(LLMError, "production"):
                make_backend(CFG, env(registry(), **{k: "production"}))

    def test_remote_endpoints_are_refused_even_when_remote_is_allowed_elsewhere(self):
        with self.assertRaises(LLMError):
            make_backend(CFG, env(registry(), BHOOMI_LLM_BASE_URL="http://example.com/v1", BHOOMI_LLM_ALLOW_REMOTE="1"))

    def test_registry_file_is_never_modified(self):
        reg = registry()
        before = Path(reg).read_text()
        make_backend(CFG, env(reg))
        self.assertEqual(Path(reg).read_text(), before)


class ExportGuard(unittest.TestCase):
    def test_reviewed_chats_from_an_experimental_model_are_not_exported_by_default(self):
        from bhoomi_ai.feedback import FeedbackStore
        fs = FeedbackStore(Path(tempfile.mkdtemp()) / "fb.sqlite")
        turn = {"session_id": "a" * 24, "status": "verified", "answer": "x", "request": "What is the hazard of Kota?",
                "model": {"model": "m", "experimental": True}, "trace": [], "results": [], "verification": {}}
        iid = fs.log_interaction(turn, "0.1.0", "sha")
        fs.add_review(iid, "Reviewer A", "correct", authorize_training=True, authorized_by="Owner")
        out = Path(tempfile.mkdtemp()) / "o.jsonl"
        m = fs.export_training_jsonl(out, "sys", tool_specs=[])
        self.assertEqual(m["written"], 0)
        self.assertEqual(m["skipped"]["experimental_model"], 1)


if __name__ == "__main__":
    unittest.main()
