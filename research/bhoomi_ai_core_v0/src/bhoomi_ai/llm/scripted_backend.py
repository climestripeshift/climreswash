"""TEST-ONLY backend that replays prepared model responses.

It exists so orchestration, validation and verification logic can be unit
tested deterministically (including malformed tool calls and hallucinated
answers). It is never used by the server or the evaluation harness.
"""
from __future__ import annotations

from .base import LLMBackend, LLMResponse, ToolCall


class ScriptedBackend(LLMBackend):
    name = "scripted-test"

    def __init__(self, script):
        """script: list of LLMResponse, or callable(messages, tools) -> LLMResponse."""
        self.script = script
        self.calls: list[dict] = []
        self._i = 0

    def chat(self, messages, tools=None, **options) -> LLMResponse:
        self.calls.append({"messages": [dict(m) for m in messages], "tools": tools})
        if callable(self.script):
            return self.script(messages, tools)
        if self._i >= len(self.script):
            return LLMResponse(content="(script exhausted)")
        r = self.script[self._i]
        self._i += 1
        return r

    def model_info(self) -> dict:
        return {"backend": self.name, "model": "scripted", "digest": "n/a"}


def call(name, **arguments) -> LLMResponse:
    return LLMResponse(tool_calls=[ToolCall(name=name, arguments=arguments)])


def say(text) -> LLMResponse:
    return LLMResponse(content=text)
