"""Evaluation-only backend for models that are NOT approved for deployment (registry status "experimental_*", deployable false).

This is deliberately a SEPARATE path from the production registry gate in factory._check_registry (which still refuses
everything that is not status "accepted"). It never promotes a model: the registry is read, not modified, and every
turn served through it carries `experimental: true`, `deployable: false`, `evaluation_only: true` in its model info,
which is stored with the interaction and shown in the UI.
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import LLMError
from .openai_compat import LOOPBACK, OpenAICompatBackend  # noqa: F401


class ExperimentalBackend(OpenAICompatBackend):
    name = "openai_compat_experimental"

    def __init__(self, *args, registry_entry: dict, **kw):
        super().__init__(*args, **kw)
        self.entry = registry_entry

    def model_info(self) -> dict:
        info = super().model_info()
        e = self.entry
        info.update({
            "experimental": True, "evaluation_only": True, "deployable": False,
            "label": e.get("label") or e.get("id"), "registry_id": e.get("id"), "registry_status": e.get("status"),
            "base_revision": e.get("base_revision"), "adapter_sha256": e.get("adapter_sha256"),
            "approval": e.get("approval"),
        })
        return info


def load_experimental_entry(env) -> dict:
    """Return the registry entry iff it is explicitly experimental and not deployable; otherwise raise LLMError."""
    if env.get("NODE_ENV") == "production" or env.get("BHOOMI_AI_ENV") == "production":
        raise LLMError("experimental models can never be served in production")
    mid, reg = env.get("BHOOMI_LLM_MODEL_ID"), env.get("BHOOMI_LLM_REGISTRY")
    if not (mid and reg):
        raise LLMError("BHOOMI_LLM_EXPERIMENTAL=1 requires BHOOMI_LLM_MODEL_ID and BHOOMI_LLM_REGISTRY")
    try:
        models = json.loads(Path(reg).read_text())["models"]
    except (OSError, KeyError, json.JSONDecodeError) as e:
        raise LLMError(f"cannot read model registry: {e}") from e
    entry = next((m for m in models if m.get("id") == mid), None)
    if entry is None:
        raise LLMError(f"model id {mid!r} is not in the registry")
    status = str(entry.get("status", ""))
    if not status.startswith("experimental"):
        raise LLMError(f"model {mid!r} has status {status!r}; the experimental path only serves status 'experimental_*' "
                       f"(accepted models use the normal registry gate)")
    if entry.get("deployable") is not False:
        raise LLMError(f"model {mid!r} must be explicitly marked deployable=false to use the experimental path")
    return entry
