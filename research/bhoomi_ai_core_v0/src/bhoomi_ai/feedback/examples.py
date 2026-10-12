"""Versioned training-example format: `bhoomi.training_example.v1`.

One JSON object per line. An example is created only from a REVIEWED interaction whose
reviewer authorized training use; it records everything needed to reproduce, audit or
retire it (model, prompt hash, tool-schema hash, verifier version, licence flags,
reviewer, authorizer, lineage). Nothing here trains a model.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
import uuid

SCHEMA_VERSION = "bhoomi.training_example.v1"
REQUIRED = ("schema_version", "example_id", "interaction_id", "created_at", "split", "request", "messages",
            "target", "provenance", "review", "licence")


def tool_schema_sha(specs: list) -> str:
    return hashlib.sha256(json.dumps(specs, sort_keys=True).encode()).hexdigest()[:16]


def build_example(interaction: dict, review: dict, system_prompt: str, tool_specs: list, results: list,
                  calls: list, answer: str, licence_flags: list, verifier_version: str,
                  parent_example_id: str | None = None) -> dict:
    msgs = [{"role": "system", "content": system_prompt}, {"role": "user", "content": interaction["request"]}]
    if calls:
        msgs.append({"role": "assistant", "content": "",
                     "tool_calls": [{"function": {"name": c["name"], "arguments": c["arguments"]}} for c in calls]})
        for r in results:
            msgs.append({"role": "tool", "content": json.dumps(
                {"tool": r["tool"], "status": r["status"], "summary": r["summary"],
                 "facts": [{"id": f["id"], "label": f["key"], "value": f["display"]} for f in r["facts"]]})})
    msgs.append({"role": "assistant", "content": answer})
    return {
        "schema_version": SCHEMA_VERSION,
        "example_id": uuid.uuid4().hex,
        "parent_example_id": parent_example_id,
        "interaction_id": interaction["id"],
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "split": "training",
        "request": interaction["request"],
        "messages": msgs,
        "target": {"tool_calls": [{"name": c["name"], "arguments": c["arguments"]} for c in calls], "final_answer": answer,
                   "answer_source": "reviewer_correction" if review.get("corrected_answer") else "verified_model_answer"},
        "provenance": {"model": json.loads(interaction.get("model_json") or "{}"),
                       "system_prompt_sha": interaction.get("system_prompt_sha"),
                       "tool_schema_sha": tool_schema_sha(tool_specs), "verifier_version": verifier_version,
                       "app_version": interaction.get("app_version")},
        "review": {"reviewer": review["reviewer"], "verdict": review["verdict"], "authorized_by": review["authorized_by"],
                   "reviewed_at": review["ts"], "notes": review.get("notes") or ""},
        "licence": {"flags": licence_flags, "internal_research_only": bool(licence_flags)},
    }


def validate_example(ex: dict) -> list[str]:
    errs = [f"missing field {k}" for k in REQUIRED if k not in ex]
    if ex.get("schema_version") != SCHEMA_VERSION:
        errs.append(f"schema_version must be {SCHEMA_VERSION}")
    if ex.get("split") != "training":
        errs.append("split must be 'training'")
    rv = ex.get("review") or {}
    if not rv.get("reviewer"):
        errs.append("review.reviewer required")
    if not rv.get("authorized_by"):
        errs.append("review.authorized_by required")
    if rv.get("verdict") not in ("correct", "partially_correct", "incorrect"):
        errs.append("review.verdict must be correct|partially_correct|incorrect for a training example")
    msgs = ex.get("messages") or []
    if not msgs or msgs[-1].get("role") != "assistant" or not msgs[-1].get("content"):
        errs.append("last message must be a non-empty assistant answer")
    if re.search(r"<\s*tool_call\s*>", json.dumps(msgs)):
        errs.append("tool-call markup found in message text")
    return errs
