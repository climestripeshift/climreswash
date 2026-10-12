"""Slot for a future trained Bhoomi-Predict model.

A predictor is just another read-only Tool. To be registered it must declare
`semantics["is_probability"] = True` only if its outputs are calibrated, and its
ToolResult must carry validation provenance (model id, training window, test
metrics). The verifier's "probability" and "projection" classes are keyed off
those declarations, so probability or future-risk language stays blocked until a
tool legitimately supplies it. No predictor exists in v0.1.
"""
from __future__ import annotations

from typing import Protocol

from ..tools.base import ToolContext, ToolResult


class PredictorUnavailable(RuntimeError):
    pass


class PredictorTool(Protocol):
    name: str
    description: str
    parameters: dict
    semantics: dict            # must include data_class ("probability" | "projection"), is_probability, validation_ref

    def spec(self) -> dict: ...
    def run(self, args: dict, ctx: ToolContext) -> ToolResult: ...
