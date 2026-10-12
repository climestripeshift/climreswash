"""Ollama backend (localhost only) with native tool calling and a fallback parser.

Tool-call strategy, in order:
  1. native `message.tool_calls` from the model's chat template (preferred);
  2. a JSON object or list in `content` ({"name":..., "arguments":{...}});
  3. `<tool_call>{...}</tool_call>` tags in `content`.
Malformed arguments are passed through as a raw string so the orchestrator can
return a validation error to the model instead of guessing.
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request

from .base import LLMBackend, LLMError, LLMResponse, ToolCall

_TAG = re.compile(r"<tool_call>\s*(.*?)\s*</tool_call>", re.S)


def _norm_call(obj, source) -> ToolCall | None:
    if not isinstance(obj, dict):
        return None
    fn = obj.get("function") if isinstance(obj.get("function"), dict) else obj
    name = fn.get("name")
    if not isinstance(name, str):
        return None
    args = fn.get("arguments", fn.get("parameters", {}))
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except json.JSONDecodeError:
            pass  # leave as raw string: reported as malformed upstream
    return ToolCall(name=name, arguments=args, source=source)


_NAMED = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*[:(]?\s*(\{.*\})\s*\)?\s*$", re.S)


def parse_content_tool_calls(content: str, known: set | None = None) -> list[ToolCall]:
    """`known` (lower-case tool names) enables the `name {json}` form; unknown names are never executed."""
    calls: list[ToolCall] = []
    for m in _TAG.finditer(content or ""):
        body, dec, pos, found = m.group(1), json.JSONDecoder(), 0, []
        while pos < len(body):                      # a tag may hold several objects: {...} {...}
            while pos < len(body) and body[pos] in " \t\r\n,[":
                pos += 1
            if pos >= len(body) or body[pos] == "]":
                break
            try:
                obj, pos = dec.raw_decode(body, pos)
            except json.JSONDecodeError:
                found = None
                break
            found.append(obj)
        if found:
            for obj in found:
                c = _norm_call(obj, "content_tag")
                if c:
                    calls.append(c)
        else:
            calls.append(ToolCall(name="", arguments=body, source="content_tag"))
    if calls:
        return calls
    text = (content or "").strip()
    if known:
        m = _NAMED.match(text)
        if m and m.group(1).lower() in known:
            try:
                return [ToolCall(name=m.group(1).lower(), arguments=json.loads(m.group(2)), source="content_named")]
            except json.JSONDecodeError:
                return [ToolCall(name=m.group(1).lower(), arguments=m.group(2), source="content_named")]
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", text).strip()
    if text.startswith("{") or text.startswith("["):
        try:
            obj = json.loads(text)
        except json.JSONDecodeError:
            return []
        for o in (obj if isinstance(obj, list) else [obj]):
            c = _norm_call(o, "content_json")
            if c:
                calls.append(c)
    return calls


class OllamaBackend(LLMBackend):
    name = "ollama"

    def __init__(self, model: str = "qwen2.5:3b", host: str = "127.0.0.1", port: int = 11434,
                 temperature: float = 0.0, num_ctx: int = 4096, num_predict: int = 400,
                 keep_alive: str = "10m", timeout_s: int = 240):
        if host not in ("127.0.0.1", "localhost", "::1"):
            raise LLMError("the model server must be on localhost")
        self.model, self.base = model, f"http://{host}:{port}"
        self.opts = {"temperature": temperature, "num_ctx": num_ctx, "num_predict": num_predict}
        self.keep_alive, self.timeout = keep_alive, timeout_s

    def _post(self, path, payload):
        req = urllib.request.Request(self.base + path, data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:  # noqa: S310 (localhost)
                return json.load(r)
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as e:
            raise LLMError(f"ollama request failed: {e}") from e

    def chat(self, messages, tools=None, **options) -> LLMResponse:
        payload = {"model": self.model, "messages": messages, "stream": False,
                   "keep_alive": self.keep_alive, "options": {**self.opts, **options}}
        if tools:
            payload["tools"] = tools
        t = time.time()
        r = self._post("/api/chat", payload)
        m = r.get("message", {})
        calls = []
        for tc in m.get("tool_calls") or []:
            c = _norm_call(tc, "native")
            if c:
                calls.append(c)
        content = m.get("content", "") or ""
        if not calls and content and tools:
            known = {t.get("function", {}).get("name", "").lower() for t in tools}
            calls = parse_content_tool_calls(content, known)
        return LLMResponse(content=content, tool_calls=calls, prompt_tokens=r.get("prompt_eval_count", 0),
                           completion_tokens=r.get("eval_count", 0), latency_s=time.time() - t)

    def model_info(self) -> dict:
        info = {"backend": self.name, "model": self.model, "options": self.opts}
        try:
            req = urllib.request.Request(self.base + "/api/tags")
            with urllib.request.urlopen(req, timeout=10) as r:  # noqa: S310
                for m in json.load(r).get("models", []):
                    if m.get("name") == self.model:
                        info["digest"] = m.get("digest", "")[:16]
                        info["size_bytes"] = m.get("size")
        except Exception:  # noqa: BLE001 - informational only
            info["digest"] = "unknown"
        return info
