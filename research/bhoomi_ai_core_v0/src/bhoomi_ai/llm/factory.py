"""Backend selection from configuration and environment.

Default (no environment variables): the original local Ollama model from config/agent.json  -> this IS the rollback path.

  BHOOMI_LLM_BACKEND        ollama | openai_compat                   (default: ollama)
  BHOOMI_LLM_MODEL          model or adapter name to request          (default: config model name)
  BHOOMI_LLM_BASE_URL       OpenAI-compatible base URL                (default: http://127.0.0.1:8000/v1)
  BHOOMI_LLM_ALLOW_REMOTE   1 to allow a non-loopback endpoint        (default: 0)
  BHOOMI_LLM_MODEL_ID + BHOOMI_LLM_REGISTRY
                            registry id and path of models.json; the model must have status "accepted" or loading is refused
  BHOOMI_LLM_EXPERIMENTAL   1 = evaluation-only path for a registry entry with status "experimental_*" and deployable=false
                            (loopback only, never in production, labelled experimental in every response). It does NOT relax the
                            "accepted" gate above and never changes the registry.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from .base import LLMBackend, LLMError
from .ollama_backend import OllamaBackend
from .experimental import ExperimentalBackend, load_experimental_entry
from .openai_compat import OpenAICompatBackend


def _check_registry(env) -> dict | None:
    mid, reg = env.get("BHOOMI_LLM_MODEL_ID"), env.get("BHOOMI_LLM_REGISTRY")
    if not mid and not reg:
        return None
    if not (mid and reg):
        raise LLMError("BHOOMI_LLM_MODEL_ID and BHOOMI_LLM_REGISTRY must be set together")
    try:
        models = json.loads(Path(reg).read_text())["models"]
    except (OSError, KeyError, json.JSONDecodeError) as e:
        raise LLMError(f"cannot read model registry: {e}") from e
    entry = next((m for m in models if m.get("id") == mid), None)
    if entry is None:
        raise LLMError(f"model id {mid!r} is not in the registry")
    if entry.get("status") != "accepted":
        raise LLMError(f"model {mid!r} has status {entry.get('status')!r}; only 'accepted' models may be deployed")
    return entry


def make_backend(cfg: dict, env=None) -> LLMBackend:
    env = os.environ if env is None else env
    kind = (env.get("BHOOMI_LLM_BACKEND") or "ollama").lower()
    m = cfg["model"]
    if env.get("BHOOMI_LLM_EXPERIMENTAL") == "1":
        if kind != "openai_compat":
            raise LLMError("BHOOMI_LLM_EXPERIMENTAL=1 requires BHOOMI_LLM_BACKEND=openai_compat")
        entry = load_experimental_entry(env)
        model = env.get("BHOOMI_LLM_MODEL") or entry.get("served_name")
        if not model:
            raise LLMError("BHOOMI_LLM_MODEL is required for the experimental backend")
        return ExperimentalBackend(model, env.get("BHOOMI_LLM_BASE_URL", "http://127.0.0.1:8081/v1"),
                                   temperature=m["temperature"], max_tokens=m["num_predict"], timeout_s=m["timeout_s"],
                                   allow_remote=False, registry_entry=entry)    # remote endpoints are never allowed here
    if kind == "ollama":
        return OllamaBackend(env.get("BHOOMI_LLM_MODEL") or m["name"], m["host"], m["port"], m["temperature"], m["num_ctx"],
                             m["num_predict"], m["keep_alive"], m["timeout_s"])
    if kind == "openai_compat":
        entry = _check_registry(env)
        model = env.get("BHOOMI_LLM_MODEL") or (entry or {}).get("served_name")
        if not model:
            raise LLMError("BHOOMI_LLM_MODEL is required for the openai_compat backend")
        return OpenAICompatBackend(model, env.get("BHOOMI_LLM_BASE_URL", "http://127.0.0.1:8000/v1"),
                                   temperature=m["temperature"], max_tokens=m["num_predict"], timeout_s=m["timeout_s"],
                                   allow_remote=env.get("BHOOMI_LLM_ALLOW_REMOTE") == "1")
    raise LLMError(f"unknown BHOOMI_LLM_BACKEND {kind!r}")
