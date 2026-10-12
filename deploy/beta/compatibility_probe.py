"""Checkpoint-160 compatibility probe. Default is local artifact preflight; --run needs explicit approval.

Real model calls go ONLY through the existing loopback relay, which retains its approval/billing gates.
Scientific tool records are synthetic. No frozen benchmark, real dataset or training feedback is read.
"""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path
import sys
import tempfile
import time

REPO = Path(__file__).resolve().parents[2]
CORE = REPO / "research/bhoomi_ai_core_v0"
sys.path.insert(0, str(CORE / "src"))
from bhoomi_ai.agent.orchestrator import Agent
from bhoomi_ai.agent.session import SessionManager
from bhoomi_ai.config import load_config
from bhoomi_ai.data_access import DataStore
from bhoomi_ai.llm.base import LLMBackend, LLMResponse
from bhoomi_ai.llm.factory import make_backend
from bhoomi_ai.llm.deadline import deadline
from bhoomi_ai.tools import Registry

MODEL_ID = "adapter-B-full2ep-experimental-machine-verified"
SERVED = "bhoomi-llm-v1-ckpt160"
SYNTHETIC_RECORDS = [
    {"h3_id": "synthetic-kota", "district_name": "Kota", "state": "Rajasthan", "population": 100, "hex_risk": 2.5},
    {"h3_id": "synthetic-jaipur", "district_name": "Jaipur", "state": "Rajasthan", "population": 100, "hex_risk": 7.5}]
FIXTURE_SHA = hashlib.sha256(json.dumps({"hex": SYNTHETIC_RECORDS, "hist": {}}, sort_keys=True).encode()).hexdigest()
ADAPTER = REPO / "research/bhoomi_llm_v1/adapters/Bhoomi-LLM-v1-experimental-machine-verified-full2ep/runs/full_2ep/adapter"


def require(condition):
    if not condition:
        raise ValueError("Compatibility approval, identity or artifact requirement failed")


def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
    return h.hexdigest()


def preflight():
    reg = json.loads((REPO / "research/bhoomi_llm_v1/registry/models.json").read_text())
    model = next(x for x in reg["models"] if x["id"] == MODEL_ID)
    require(model["status"].startswith("experimental") and model["deployable"] is False)
    config = json.loads((ADAPTER / "adapter_config.json").read_text())
    require(config["base_model_name_or_path"] == "Qwen/Qwen3-4B-Instruct-2507" and config["r"] == 16)
    require(digest(ADAPTER / "adapter_model.safetensors") == model["adapter_sha256"])
    template_sha = digest(ADAPTER / "chat_template.jinja")
    runtime = json.loads((REPO / "research/bhoomi_llm_v1/runtime_experimental/RUNTIME.json").read_text())
    require(template_sha == runtime["runtime"]["chat_template_sha256"])
    return {"registry_id": MODEL_ID, "base_revision": model["base_revision"], "adapter_sha256": model["adapter_sha256"],
            "template_sha256": template_sha, "synthetic_fixture_sha256": FIXTURE_SHA, "rank": 16, "targets": sorted(config["target_modules"]), "cloud_test_executed": False}


def synthetic_config(directory):
    os.environ["BHOOMI_DEPLOYMENT_PROFILE"] = "cloud_beta"
    cfg = load_config()
    cfg["doc_sources"] = []  # no original documentation excerpts may reach the test worker
    cfg["paths"].update(hex_props=directory / "hex.json", hist_climate=directory / "hist.json", district_cache=directory / "cache.json")
    cfg["agent"] = {**cfg["agent"], "max_tool_steps": 3, "max_repairs": 0}
    (directory / "hex.json").write_text(json.dumps(SYNTHETIC_RECORDS))
    (directory / "hist.json").write_text("{}")
    return cfg


class CorruptDraft(LLMBackend):
    """Fault injection: real tool selection, then deliberately invalid prose to exercise scientific fallback."""
    def __init__(self, real): self.real = real
    def model_info(self): return self.real.model_info()
    def chat(self, messages, tools=None, **options):
        if any(m["role"] == "tool" for m in messages):
            return LLMResponse(content="Jaipur has an overall screening index of 99.99 [F1].")
        return self.real.chat(messages, tools, **options)


def evaluate(backend, cfg):
    store = DataStore(cfg)
    rows = []
    for fault in [False, True]:
        agent = Agent(CorruptDraft(backend) if fault else backend, Registry(profile="cloud_beta"), store, cfg)
        result = agent.run_turn(SessionManager().create(), "What is the overall screening index of Kota, Rajasthan?")
        calls = [c for step in result.trace for c in step["calls"]]
        selected = [c for c in calls if c["name"] == "district_hazard_profile" and c.get("status") == "ok"]
        correct_place = bool(selected) and all(c["arguments"].get("district", "").lower() == "kota" and c["arguments"].get("state", "Rajasthan").lower() == "rajasthan" for c in selected)
        wrong_result = any(r.get("entities", {}).get("district") not in (None, "Kota") for r in result.results)
        native = bool(selected) and all(c.get("source") == "native" for c in selected)
        passed = correct_place and native and not wrong_result and "2.50" in result.answer and "99.99" not in result.answer
        passed = passed and (result.fallback_used if fault else result.status == "verified" and result.verification.get("passed") is True)
        rows.append({"case": "forced_scientific_fallback" if fault else "real_tool_selection_and_verified_geography", "passed": bool(passed),
                     "status": result.status, "fallback_used": result.fallback_used, "calls": calls, "answer": result.answer,
                     "verifier": result.verification, "synthetic_data": True})
    return rows


def main():
    p = argparse.ArgumentParser(); p.add_argument("--run", action="store_true"); p.add_argument("--report", default="/tmp/bhoomi-compatibility-report.json")
    args = p.parse_args(); report = preflight()
    if args.run:
        approval = json.loads(Path(os.environ["COMPAT_TEST_APPROVAL_FILE"]).read_text())
        receipt = json.loads(Path(os.environ["COMPAT_WORKER_RECEIPT_FILE"]).read_text())
        require(approval.get("approved") is True and approval.get("scope") == "checkpoint-160-compatibility" and approval.get("approved_by"))
        require(isinstance(approval.get("expires_at"), (int, float)) and time.time() < approval["expires_at"])
        require(0 < approval.get("budget_usd", 0) <= 5)
        for key in ["base_revision", "adapter_sha256", "template_sha256"]: require(receipt.get(key) == report[key])
        expected_image = json.loads((REPO / "deploy/beta/runpod_endpoint.example.json").read_text())["worker_image"].split("@", 1)[1]
        require(receipt.get("operator_verified") is True and receipt.get("image_digest") == expected_image and receipt.get("vllm_version"))
        require(os.environ.get("BHOOMI_LLM_MODEL") == SERVED)
        require(os.environ.get("BHOOMI_LLM_MODEL_ID") == MODEL_ID)
        # factory still refuses production and requires explicit experimental mode + non-deployable registry entry
        (CORE / "data").mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="compat-synthetic-", dir=CORE / "data") as temp:
            cfg = synthetic_config(Path(temp)); backend = make_backend(cfg)
            info = backend.model_info()
            metadata = backend._request("/models")
            served = next(row for row in metadata["data"] if row["id"] == SERVED)
            require(served.get("parent") == "Qwen/Qwen3-4B-Instruct-2507")
            report["served_model"] = {"id": served["id"], "parent": served["parent"]}
            require(SERVED in info.get("served_models", []) and info.get("registry_id") == MODEL_ID and info.get("deployable") is False)
            scope = deadline.set(time.time() + 90)
            try: report["cases"] = evaluate(backend, cfg)
            finally: deadline.reset(scope)
        report.update(cloud_test_executed=True, worker_receipt=receipt, passed=all(x["passed"] for x in report["cases"]))
    Path(args.report).write_text(json.dumps(report, indent=2))
    print(json.dumps({"cloud_test_executed": report["cloud_test_executed"], "passed": report.get("passed"), "report": args.report}))
    return 0 if not args.run or report["passed"] else 1


if __name__ == "__main__": sys.exit(main())
