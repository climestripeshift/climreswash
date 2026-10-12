"""Evaluation / training dataset registry.

Keeps three kinds of data strictly apart:
  training        reviewed + authorized interaction examples (may be used to fine-tune LATER)
  development     prompt sets used to build or tune the agent (their scores are optimistic)
  test_untouched  frozen benchmark: never used for tuning or training; hash-locked

A frozen dataset records the SHA-256 of its file, of its scoring rubric/judge, and of the
agent source tree at freeze time. `verify()` fails if any changed. `assert_no_leakage()`
rejects any training question that also appears in a development or test set.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path

SPLITS = ("training", "development", "test_untouched")


def sha256_file(p) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def tree_sha256(roots, patterns=("*.py", "*.json")) -> str:
    """Deterministic hash of one or more source trees (relative paths + contents)."""
    roots = [Path(r) for r in (roots if isinstance(roots, (list, tuple)) else [roots])]
    h = hashlib.sha256()
    for root in roots:
        for p in sorted(x for pat in patterns for x in root.rglob(pat) if "__pycache__" not in x.parts):
            h.update((root.name + "/" + str(p.relative_to(root))).encode())
            h.update(sha256_file(p).encode())
    return h.hexdigest()


def norm_question(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def question_hash(text: str) -> str:
    return hashlib.sha256(norm_question(text).encode()).hexdigest()[:16]


class RegistryError(RuntimeError):
    pass


class DatasetRegistry:
    def __init__(self, path):
        self.path = Path(path)
        self.data = json.loads(self.path.read_text()) if self.path.exists() else {"schema": "bhoomi.dataset_registry.v1",
                                                                                   "datasets": {}}

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, indent=2, sort_keys=True))

    # ---- registration
    def register(self, dataset_id: str, split: str, file: Path, questions: list[str], note: str = "",
                 rubric_files: list | None = None, code_root=None, freeze: bool = False):
        if split not in SPLITS:
            raise RegistryError(f"split must be one of {SPLITS}")
        old = self.data["datasets"].get(dataset_id)
        if old and old.get("frozen"):
            raise RegistryError(f"{dataset_id} is frozen and cannot be re-registered")
        entry = {"split": split, "file": str(file), "sha256": sha256_file(file), "n_questions": len(questions),
                 "question_hashes": sorted({question_hash(q) for q in questions}), "note": note,
                 "registered_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "frozen": False}
        if rubric_files:
            entry["rubric_sha256"] = {str(p): sha256_file(p) for p in rubric_files}
        if freeze:
            entry["frozen"] = True
            entry["frozen_at"] = entry["registered_at"]
            if code_root:
                entry["code_tree_sha256_at_freeze"] = tree_sha256(code_root)
        self.data["datasets"][dataset_id] = entry
        self.assert_disjoint_splits()
        self.save()
        return entry

    def get(self, dataset_id: str) -> dict:
        if dataset_id not in self.data["datasets"]:
            raise RegistryError(f"unknown dataset {dataset_id}")
        return self.data["datasets"][dataset_id]

    # ---- integrity
    def verify(self, dataset_id: str, code_root=None, require_code_unchanged: bool = True) -> dict:
        e = self.get(dataset_id)
        problems = []
        if sha256_file(e["file"]) != e["sha256"]:
            problems.append("dataset file changed since registration")
        for p, h in (e.get("rubric_sha256") or {}).items():
            if sha256_file(p) != h:
                problems.append(f"rubric/judge changed: {p}")
        if require_code_unchanged and code_root and "code_tree_sha256_at_freeze" in e:
            if tree_sha256(code_root) != e["code_tree_sha256_at_freeze"]:
                problems.append("agent source tree changed since the benchmark was frozen")
        if problems:
            raise RegistryError("; ".join(problems))
        return e

    def assert_disjoint_splits(self):
        by_split: dict[str, set] = {s: set() for s in SPLITS}
        owner: dict[str, str] = {}
        for did, e in self.data["datasets"].items():
            for h in e["question_hashes"]:
                if h in owner and self.data["datasets"][owner[h]]["split"] != e["split"]:
                    raise RegistryError(f"question appears in both {owner[h]} ({self.data['datasets'][owner[h]]['split']}) "
                                        f"and {did} ({e['split']})")
                owner[h] = did
                by_split[e["split"]].add(h)

    def split_of(self, question: str) -> str | None:
        h = question_hash(question)
        for e in self.data["datasets"].values():
            if h in e["question_hashes"]:
                return e["split"]
        return None

    def assert_no_leakage(self, training_questions: list[str]):
        bad = [q for q in training_questions if self.split_of(q) in ("development", "test_untouched")]
        if bad:
            raise RegistryError(f"{len(bad)} training question(s) also appear in a development/test set, e.g. {bad[0]!r}")
