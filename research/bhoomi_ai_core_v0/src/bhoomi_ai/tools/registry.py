"""Tool registry: specs for the model, validated execution, per-turn fact IDs."""
from __future__ import annotations

import json
import os
from pathlib import Path

from .base import Tool, ToolContext, ToolResult, validate_args
from .impl import ALL_TOOLS

CONTROL = {"ask_clarification", "declare_unsupported"}
CLOUD_PROFILE = "cloud_beta"
PERMITTED_CLASSES = {"allowed", "allowed_with_attribution"}
_LICENCE_FILE = Path(__file__).resolve().parents[3] / "config" / "tool_licence.json"


def tool_licence_classes() -> dict:
    return json.loads(_LICENCE_FILE.read_text(encoding="utf-8"))["tools"]


class UnavailableTool(Tool):
    """Inert stand-in used in the cloud_beta profile for tools whose data may not leave the owner's machine.

    It keeps the real tool's name, description, parameter schema and semantics, so the model sees exactly the tool list it was
    trained and evaluated with, but run() never touches any data: it reports "unsupported" with an explicit limitation.
    """

    def __init__(self, real: Tool):
        self.name, self.description = real.name, real.description
        self.parameters, self.semantics = real.parameters, dict(real.semantics)

    def run(self, args: dict, ctx: ToolContext) -> ToolResult:
        return ToolResult(
            self.name, "unsupported",
            f"{self.name} is not available in the hosted research beta: its underlying dataset is not licensed for this deployment.",
            semantics={"data_class": "unavailable_in_deployment", "temporal_class": "static", "spatial": "n/a"},
            limitations=["This data source is not part of the hosted research beta; no value was retrieved or estimated."])


class Registry:
    def __init__(self, tools: list[Tool] | None = None, profile: str | None = None):
        self.profile = profile if profile is not None else os.environ.get("BHOOMI_DEPLOYMENT_PROFILE")
        base = tools or [cls() for cls in ALL_TOOLS]
        if self.profile == CLOUD_PROFILE:
            classes = tool_licence_classes()
            # fail closed: a tool that is not classified is treated as restricted
            base = [t if classes.get(t.name) in PERMITTED_CLASSES else UnavailableTool(t) for t in base]
        self.tools = {t.name: t for t in base}

    def specs(self) -> list[dict]:
        return [t.spec() for t in self.tools.values()]

    def names(self) -> list[str]:
        return list(self.tools)

    def validate(self, name: str, args) -> tuple[dict, list[str]]:
        if name not in self.tools:
            return {}, [f"unknown tool '{name}'; available: {', '.join(self.tools)}"]
        return validate_args(self.tools[name].parameters, args)

    def execute(self, name: str, args: dict, ctx: ToolContext) -> ToolResult:
        """Run a tool with already validated arguments. Never raises to the caller."""
        try:
            return self.tools[name].run(args, ctx)
        except Exception as exc:  # a tool bug must not become a model-written answer
            return ToolResult(name, "error", f"Tool failed: {type(exc).__name__}",
                              limitations=["The tool raised an internal error; no value is available."],
                              data={"exception": f"{type(exc).__name__}: {exc}"})
