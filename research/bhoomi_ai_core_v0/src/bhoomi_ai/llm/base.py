"""Model-independent backend interface.

The agent talks only to LLMBackend.chat(); replacing qwen2.5:3b (Ollama) with a
Qwen3 model served through MLX is a new subclass, not an agent rewrite.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolCall:
    name: str
    arguments: Any            # dict, or a raw string if the model emitted malformed JSON
    source: str = "native"    # native | content_json | content_tag


@dataclass
class LLMResponse:
    content: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    prompt_tokens: int = 0
    completion_tokens: int = 0
    latency_s: float = 0.0
    error: str = ""


class LLMError(RuntimeError):
    pass


class LLMBackend:
    name = "base"

    def chat(self, messages: list[dict], tools: list[dict] | None = None, **options) -> LLMResponse:
        raise NotImplementedError

    def model_info(self) -> dict:
        return {"backend": self.name}
