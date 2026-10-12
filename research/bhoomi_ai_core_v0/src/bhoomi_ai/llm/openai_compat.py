"""OpenAI-compatible chat backend (vLLM, llama.cpp server, LM Studio, Ollama's /v1 ...).

Used to serve a fine-tuned Bhoomi-LLM adapter. Loopback only unless remote use is switched on explicitly: the agent must
never send user questions or tool results to a third-party endpoint by accident.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request

from .base import LLMBackend, LLMError, LLMResponse, ToolCall
from .ollama_backend import parse_content_tool_calls

LOOPBACK = {"127.0.0.1", "localhost", "::1"}


class OpenAICompatBackend(LLMBackend):
    name = "openai_compat"

    def __init__(self, model: str, base_url: str = "http://127.0.0.1:8000/v1", api_key: str = "EMPTY",
                 temperature: float = 0.0, max_tokens: int = 400, timeout_s: int = 240, allow_remote: bool = False):
        u = urllib.parse.urlparse(base_url)
        if u.scheme not in ("http", "https") or not u.hostname:
            raise LLMError("invalid base_url")
        if u.hostname not in LOOPBACK and not allow_remote:
            raise LLMError("the model server must be on localhost (set allow_remote only for a server you operate)")
        self.model, self.base, self.key = model, base_url.rstrip("/"), api_key
        self.temperature, self.max_tokens, self.timeout = temperature, max_tokens, timeout_s

    def _request(self, path, payload=None):
        from .deadline import remaining_timeout
        timeout = remaining_timeout(self.timeout)
        req = urllib.request.Request(self.base + path, data=(json.dumps(payload).encode() if payload is not None else None),
                                     headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.key}"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (loopback by default)
                return json.load(r)
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as e:
            raise LLMError(f"openai-compatible request failed: {e}") from e

    @staticmethod
    def to_openai_messages(messages: list[dict]) -> list[dict]:
        """Agent messages -> OpenAI format: tool_call ids, JSON-string arguments, tool_call_id on tool messages."""
        out, pending, n = [], [], 0
        for m in messages:
            if m["role"] == "assistant" and m.get("tool_calls"):
                calls = []
                for tc in m["tool_calls"]:
                    n += 1
                    cid = f"call_{n}"
                    pending.append(cid)
                    a = tc["function"].get("arguments", {})
                    calls.append({"id": cid, "type": "function",
                                  "function": {"name": tc["function"]["name"], "arguments": a if isinstance(a, str) else json.dumps(a)}})
                out.append({"role": "assistant", "content": m.get("content") or "", "tool_calls": calls})
            elif m["role"] == "tool":
                out.append({"role": "tool", "content": m["content"], "tool_call_id": pending.pop(0) if pending else f"call_{n}"})
            else:
                out.append({"role": m["role"], "content": m.get("content") or ""})
        return out

    def chat(self, messages, tools=None, **options) -> LLMResponse:
        payload = {"model": self.model, "messages": self.to_openai_messages(messages), "temperature": self.temperature,
                   "max_tokens": options.get("max_tokens", self.max_tokens)}
        if tools:
            payload["tools"] = tools
        t = time.time()
        r = self._request("/chat/completions", payload)
        try:
            msg = r["choices"][0]["message"]
        except (KeyError, IndexError, TypeError) as e:
            raise LLMError(f"unexpected response shape: {str(r)[:200]}") from e
        calls = []
        for tc in msg.get("tool_calls") or []:
            fn = tc.get("function", {})
            args = fn.get("arguments", {})
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    pass                      # left as a raw string: reported as malformed upstream
            if fn.get("name"):
                calls.append(ToolCall(name=fn["name"], arguments=args, source="native"))
        content = msg.get("content") or ""
        if not calls and content and tools:
            known = {t_.get("function", {}).get("name", "").lower() for t_ in tools}
            calls = parse_content_tool_calls(content, known)
        u = r.get("usage", {})
        return LLMResponse(content=content, tool_calls=calls, prompt_tokens=u.get("prompt_tokens", 0),
                           completion_tokens=u.get("completion_tokens", 0), latency_s=time.time() - t)

    def model_info(self) -> dict:
        info = {"backend": self.name, "model": self.model, "base_url": self.base}
        try:
            data = self._request("/models").get("data", [])
            info["served_models"] = [d.get("id") for d in data][:10]
        except LLMError:
            info["served_models"] = "unreachable"
        return info
