"""Feedback and expert-review store (SQLite, local file, stdlib only).

Principles
  * Nothing is trained on automatically. Logged conversations are NOT training
    examples. A record becomes exportable only after a named reviewer marks it
    correct (or supplies a corrected answer) AND authorizes training use.
  * Every interaction records the model version, request, tool calls, tool
    outputs, verification report and final answer so reviews are auditable.
  * Exports tag records that carry licence-restricted derived data and exclude
    them unless the caller explicitly accepts internal-research-only use.
"""
from __future__ import annotations

import contextlib
import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY, ts REAL NOT NULL, session_id TEXT, app_version TEXT,
  model_json TEXT, request TEXT, status TEXT, answer TEXT, draft TEXT,
  tool_calls_json TEXT, results_json TEXT, verification_json TEXT, system_prompt_sha TEXT,
  latency_s REAL, tokens_json TEXT, review_state TEXT NOT NULL DEFAULT 'unreviewed');
CREATE TABLE IF NOT EXISTS user_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT, interaction_id TEXT NOT NULL, ts REAL NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('up','down')), comment TEXT);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT, interaction_id TEXT NOT NULL, ts REAL NOT NULL,
  reviewer TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('correct','partially_correct','incorrect','unsafe')),
  corrected_answer TEXT, corrected_tool_calls_json TEXT, notes TEXT,
  training_use_authorized INTEGER NOT NULL DEFAULT 0, authorized_by TEXT);
CREATE TABLE IF NOT EXISTS eval_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL, model_json TEXT, suite TEXT, metrics_json TEXT);
"""
RESTRICTED_MARKERS = {"CHIRPS": "CHIRPS-derived", "flood_labels": "IFI-flood-derived", "flood_features": "CHIRPS-derived",
                      "lgd": "LGD-derived", "district_month": "IFI-flood-derived", "monsoon_v0": "CHIRPS-derived"}


class ExportError(RuntimeError):
    pass


class FeedbackStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        with self._conn() as c:
            c.executescript(SCHEMA)
            have = {r[1] for r in c.execute("PRAGMA table_info(interactions)")}
            for col in ("deployment", "user_hash"):           # added in v0.2.4 for the hosted research beta
                if col not in have:
                    c.execute(f"ALTER TABLE interactions ADD COLUMN {col} TEXT")

    @contextlib.contextmanager
    def _conn(self):
        c = sqlite3.connect(self.path, timeout=10)
        c.row_factory = sqlite3.Row
        try:
            with c:                      # commit / rollback
                yield c
        finally:
            c.close()

    # ---- logging ---------------------------------------------------------------
    def log_interaction(self, turn: dict, app_version: str, system_prompt_sha: str = "",
                        deployment: str | None = None, user_hash: str | None = None) -> str:
        iid = uuid.uuid4().hex
        calls = [{"step": s.get("step"), **c} for s in turn.get("trace", []) for c in s.get("calls", [])]
        with self._lock, self._conn() as c:
            c.execute("INSERT INTO interactions (id, ts, session_id, app_version, model_json, request, status, answer, draft, "
                      "tool_calls_json, results_json, verification_json, system_prompt_sha, latency_s, tokens_json, review_state, "
                      "deployment, user_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'unreviewed',?,?)",
                      (iid, time.time(), turn.get("session_id"), app_version, json.dumps(turn.get("model", {})),
                       turn.get("request", ""), turn.get("status"), turn.get("answer", ""), turn.get("model_draft", ""),
                       json.dumps(calls, default=str), json.dumps(turn.get("results", []), default=str),
                       json.dumps(turn.get("verification", {}), default=str), system_prompt_sha,
                       turn.get("latency_s"), json.dumps([turn.get("prompt_tokens"), turn.get("completion_tokens")]),
                       deployment, user_hash))
        return iid

    def add_user_feedback(self, interaction_id: str, rating: str, comment: str = ""):
        if rating not in ("up", "down"):
            raise ValueError("rating must be 'up' or 'down'")
        with self._lock, self._conn() as c:
            if not c.execute("SELECT 1 FROM interactions WHERE id=?", (interaction_id,)).fetchone():
                raise KeyError("unknown interaction")
            c.execute("INSERT INTO user_feedback(interaction_id,ts,rating,comment) VALUES (?,?,?,?)",
                      (interaction_id, time.time(), rating, (comment or "")[:1000]))

    def add_review(self, interaction_id: str, reviewer: str, verdict: str, corrected_answer: str | None = None,
                   corrected_tool_calls: list | None = None, notes: str = "", authorize_training: bool = False,
                   authorized_by: str = ""):
        if not reviewer or not reviewer.strip():
            raise ValueError("a named reviewer is required")
        if authorize_training and not authorized_by.strip():
            raise ValueError("training use needs the name of the person who authorizes it")
        with self._lock, self._conn() as c:
            if not c.execute("SELECT 1 FROM interactions WHERE id=?", (interaction_id,)).fetchone():
                raise KeyError("unknown interaction")
            c.execute("INSERT INTO reviews(interaction_id,ts,reviewer,verdict,corrected_answer,corrected_tool_calls_json,"
                      "notes,training_use_authorized,authorized_by) VALUES (?,?,?,?,?,?,?,?,?)",
                      (interaction_id, time.time(), reviewer.strip(), verdict, corrected_answer,
                       json.dumps(corrected_tool_calls) if corrected_tool_calls is not None else None, notes,
                       1 if authorize_training else 0, authorized_by.strip() if authorize_training else None))
            c.execute("UPDATE interactions SET review_state=? WHERE id=?", ("reviewed", interaction_id))

    def log_eval_run(self, model: dict, suite: str, metrics: dict):
        with self._lock, self._conn() as c:
            c.execute("INSERT INTO eval_runs(ts,model_json,suite,metrics_json) VALUES (?,?,?,?)",
                      (time.time(), json.dumps(model), suite, json.dumps(metrics)))

    # ---- queries --------------------------------------------------------------
    def get(self, interaction_id: str) -> dict | None:
        with self._conn() as c:
            r = c.execute("SELECT * FROM interactions WHERE id=?", (interaction_id,)).fetchone()
            if not r:
                return None
            d = dict(r)
            d["reviews"] = [dict(x) for x in c.execute("SELECT * FROM reviews WHERE interaction_id=? ORDER BY id", (interaction_id,))]
            d["user_feedback"] = [dict(x) for x in c.execute("SELECT * FROM user_feedback WHERE interaction_id=?", (interaction_id,))]
            return d

    def list(self, review_state: str | None = None, limit: int = 50) -> list[dict]:
        with self._conn() as c:
            q, a = "SELECT id, ts, status, request, review_state FROM interactions", []
            if review_state:
                q += " WHERE review_state=?"
                a.append(review_state)
            return [dict(r) for r in c.execute(q + " ORDER BY ts DESC LIMIT ?", a + [limit])]

    def stats(self) -> dict:
        with self._conn() as c:
            n = c.execute("SELECT COUNT(*) FROM interactions").fetchone()[0]
            rev = c.execute("SELECT COUNT(DISTINCT interaction_id) FROM reviews").fetchone()[0]
            auth = c.execute("SELECT COUNT(DISTINCT interaction_id) FROM reviews WHERE training_use_authorized=1").fetchone()[0]
            return {"interactions": n, "reviewed": rev, "training_authorized": auth}

    # ---- export ---------------------------------------------------------------
    @staticmethod
    def _licence_flags(results: list[dict]) -> list[str]:
        flags = set()
        for r in results:
            for p in r.get("provenance", []):
                f = str(p.get("file", ""))
                for marker, flag in RESTRICTED_MARKERS.items():
                    if marker.lower() in f.lower():
                        flags.add(flag)
            if r.get("semantics", {}).get("data_class") in ("satellite_gauge_estimate", "reported_event_records"):
                flags.add("CHIRPS-derived" if r["semantics"]["data_class"] == "satellite_gauge_estimate" else "IFI-flood-derived")
        return sorted(flags)

    def export_training_jsonl(self, out_path, system_prompt: str, allow_restricted_internal: bool = False,
                              registry=None, tool_specs: list | None = None, verifier_version: str = "0.2",
                              include_experimental_model: bool = False, include_beta_users: bool = False) -> dict:
        """Write reviewed + authorized examples (schema bhoomi.training_example.v1). Returns a manifest."""
        from .examples import build_example, validate_example
        out_path = Path(out_path)
        rows, skipped = [], {"not_authorized": 0, "not_correct": 0, "restricted": 0, "no_answer": 0, "leakage": 0,
                             "invalid": 0, "experimental_model": 0, "beta_user": 0}
        with self._conn() as c:
            ids = [r[0] for r in c.execute("SELECT DISTINCT interaction_id FROM reviews")]
        for iid in ids:
            rec = self.get(iid)
            try:
                served = json.loads(rec.get("model_json") or "{}")
            except json.JSONDecodeError:
                served = {}
            if rec.get("deployment") == "cloud_beta" and not include_beta_users:
                skipped["beta_user"] += 1             # hosted-beta users' chats need the gateway-side consent + review pipeline
                continue
            if served.get("experimental") and not include_experimental_model:
                skipped["experimental_model"] += 1     # exploratory chats with a non-approved model never become training data
                continue
            rev = [r for r in rec["reviews"]][-1]       # latest review is authoritative
            if not rev["training_use_authorized"]:
                skipped["not_authorized"] += 1
                continue
            if rev["verdict"] not in ("correct", "partially_correct", "incorrect"):
                skipped["not_correct"] += 1
                continue
            if rev["verdict"] in ("partially_correct", "incorrect") and not rev["corrected_answer"]:
                skipped["not_correct"] += 1           # needs a reviewer-written correction to be usable
                continue
            answer = rev["corrected_answer"] or rec["answer"]
            if not answer:
                skipped["no_answer"] += 1
                continue
            if registry is not None and registry.split_of(rec["request"]) in ("development", "test_untouched"):
                skipped["leakage"] += 1               # never train on a development or test question
                continue
            results = json.loads(rec["results_json"] or "[]")
            flags = self._licence_flags(results)
            if flags and not allow_restricted_internal:
                skipped["restricted"] += 1
                continue
            calls = json.loads(rev["corrected_tool_calls_json"]) if rev["corrected_tool_calls_json"] \
                else [{"name": c["name"], "arguments": c.get("completed_args") and {**c["arguments"], **c["completed_args"]}
                       or c["arguments"]} for c in json.loads(rec["tool_calls_json"] or "[]")
                      if not c.get("validation_errors") and not c.get("skipped") and isinstance(c.get("arguments"), dict)]
            ex = build_example(rec, rev, system_prompt, tool_specs or [], results, calls, answer, flags, verifier_version)
            if validate_example(ex):
                skipped["invalid"] += 1
                continue
            rows.append(ex)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as fh:
            for r in rows:
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")
        return {"written": len(rows), "path": str(out_path), "skipped": skipped, "schema": "bhoomi.training_example.v1",
                "allow_restricted_internal": allow_restricted_internal}
