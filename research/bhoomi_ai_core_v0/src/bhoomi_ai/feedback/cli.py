"""Reviewer CLI:  python -m bhoomi_ai.feedback.cli list|show|review|export|stats"""
from __future__ import annotations

import argparse
import json
import sys

from ..agent.prompts import SYSTEM
from ..config import ROOT, load_config
from ..tools import Registry as ToolRegistry
from .registry import DatasetRegistry, RegistryError
from .store import FeedbackStore


def main(argv=None):
    ap = argparse.ArgumentParser(prog="bhoomi_ai.feedback")
    sub = ap.add_subparsers(dest="cmd", required=True)
    l = sub.add_parser("list"); l.add_argument("--state", default="unreviewed")
    s = sub.add_parser("show"); s.add_argument("id")
    r = sub.add_parser("review"); r.add_argument("id"); r.add_argument("--reviewer", required=True)
    r.add_argument("--verdict", required=True, choices=["correct", "partially_correct", "incorrect", "unsafe"])
    r.add_argument("--corrected-answer"); r.add_argument("--notes", default="")
    r.add_argument("--authorize-training", action="store_true"); r.add_argument("--authorized-by", default="")
    e = sub.add_parser("export"); e.add_argument("out"); e.add_argument("--allow-restricted-internal", action="store_true")
    sub.add_parser("stats")
    dr = sub.add_parser("datasets")
    dr.add_argument("action", choices=["list", "verify"])
    dr.add_argument("--id")
    a = ap.parse_args(argv)
    cfg = load_config()
    st = FeedbackStore(cfg["paths"]["feedback_db"])
    if a.cmd == "list":
        for row in st.list(None if a.state == "all" else a.state):
            print(row["id"], row["status"], row["review_state"], "|", row["request"][:80])
    elif a.cmd == "show":
        print(json.dumps(st.get(a.id), indent=2, default=str))
    elif a.cmd == "review":
        st.add_review(a.id, a.reviewer, a.verdict, a.corrected_answer, None, a.notes, a.authorize_training, a.authorized_by)
        print("review recorded")
    elif a.cmd == "export":
        reg = DatasetRegistry(ROOT / "evals" / "registry.json")
        specs = ToolRegistry().specs()
        print(json.dumps(st.export_training_jsonl(a.out, SYSTEM.format(today="{today}"), a.allow_restricted_internal,
                                                  registry=reg, tool_specs=specs), indent=2))
    elif a.cmd == "stats":
        print(json.dumps(st.stats(), indent=2))
    elif a.cmd == "datasets":
        reg = DatasetRegistry(ROOT / "evals" / "registry.json")
        if a.action == "list":
            for k, v in reg.data["datasets"].items():
                print(f"{k:<18} {v['split']:<15} n={v['n_questions']:<4} {'frozen' if v.get('frozen') else '-':<7} {v.get('status', '')}")
        else:
            try:
                reg.verify(a.id, [ROOT / "src", ROOT / "config"], require_code_unchanged=False)
                print("dataset and rubric unchanged since registration")
            except RegistryError as exc:
                print("VERIFY FAILED:", exc)
                return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
