"""Gate for any future weight update (LoRA). v0.1 never trains; this only states the rules.

A fine-tuning run is permitted only when ALL hold:
  1. examples come from FeedbackStore.export_training_jsonl (reviewed + authorized);
  2. a held-out evaluation suite (evals/prompts_v1.jsonl or later) exists and the candidate
     does not regress tool-selection, argument, numerical or refusal correctness;
  3. the candidate passes the full test suite with the verifier unchanged;
  4. a named owner approves promotion; the previous adapter stays available for rollback.
"""
from __future__ import annotations


class ContinualLearningGate:
    def __init__(self):
        self.enabled = False   # hard-off in v0.1

    def check(self, *_a, **_k) -> dict:
        return {"allowed": False, "reason": "No fine-tuning or automatic weight updates in v0.1."}
