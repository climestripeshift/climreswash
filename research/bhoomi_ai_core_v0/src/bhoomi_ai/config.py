"""Configuration, path allowlist and file-access restriction.

Tools never accept file paths from the model or the user: they name a data
*key*, and only keys declared in config/agent.json resolve to files. Every
resolved path is re-checked to lie inside one of the allowed roots.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # research/bhoomi_ai_core_v0
RESEARCH = ROOT.parent
REPO = ROOT.parents[1]

ALLOWED_READ_ROOTS = tuple(p.resolve() for p in (
    REPO / "client" / "public" / "data",
    REPO / "reports",
    REPO / "METHODOLOGY.md",
    RESEARCH / "bhoomi_flood_v0" / "outputs",
    RESEARCH / "bhoomi_flood_v0" / "docs",
    RESEARCH / "bhoomi_monsoon_v0" / "outputs",
    RESEARCH / "bhoomi_monsoon_v0" / "docs",
    ROOT / "data",
))


# Directories of restricted-source (CHIRPS / IFI-Impacts / LGD derived) outputs and docs: unreadable in the cloud_beta profile.
CLOUD_DENIED_ROOTS = tuple(p.resolve() for p in (RESEARCH / "bhoomi_flood_v0", RESEARCH / "bhoomi_monsoon_v0"))
RESTRICTED_DOC_TERMS = re.compile(r"\b(IFI|IFI-Impacts|LGD|CHIRPS)\b", re.IGNORECASE)
DEFAULT_CLOUD_DOCS = ("../../METHODOLOGY.md",)
_active_profile = {"name": None}


class AccessError(PermissionError):
    pass


def _cloud() -> bool:
    return (_active_profile["name"] or os.environ.get("BHOOMI_DEPLOYMENT_PROFILE")) == "cloud_beta"


def _inside(p: Path, root: Path) -> bool:
    return p == root or root in p.parents


def check_readable(path) -> Path:
    p = Path(path).resolve()
    if not any(_inside(p, r) for r in ALLOWED_READ_ROOTS):
        raise AccessError(f"read outside the allowlist refused: {p}")
    if _cloud() and any(_inside(p, r) for r in CLOUD_DENIED_ROOTS):
        raise AccessError(f"read refused in the cloud_beta profile: {p.name}")
    return p


def load_config(path=None) -> dict:
    cfg_path = Path(path) if path else ROOT / "config" / "agent.json"
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    cfg["paths"] = {k: (ROOT / v).resolve() for k, v in cfg["paths"].items()}
    cfg["doc_sources"] = [(ROOT / v).resolve() for v in cfg["doc_sources"]]
    cfg["_root"] = ROOT
    cfg["deployment_profile"] = os.environ.get("BHOOMI_DEPLOYMENT_PROFILE") or cfg.get("deployment", {}).get("profile", "local_dev")
    _active_profile["name"] = cfg["deployment_profile"]
    cfg["doc_sources_excluded"] = []
    if cfg["deployment_profile"] == "cloud_beta":
        if os.environ.get("BHOOMI_CORE_DATA_DIR"):
            core_data = Path(os.environ["BHOOMI_CORE_DATA_DIR"]).resolve()
            if not _inside(core_data, ROOT / "data"):
                raise AccessError("Core data directory must remain inside its private data root")
            cfg["paths"]["feedback_db"] = core_data / "feedback.sqlite"
            cfg["paths"]["district_cache"] = core_data / "district_cache.json"
        cfg["limits"]["max_sessions"] = 60
        # Documentation passages are quoted to users by method_notes: serve only explicitly cleared documents that also name
        # no restricted source (CHIRPS / IFI-Impacts / LGD). Everything else is dropped and recorded here.
        cleared = {(ROOT / v).resolve() for v in cfg.get("cloud", {}).get("doc_sources_cleared", DEFAULT_CLOUD_DOCS)}
        keep = []
        for d in cfg["doc_sources"]:
            if d not in cleared:
                cfg["doc_sources_excluded"].append((d.name, "not on the cloud-cleared document list"))
            elif d.exists() and RESTRICTED_DOC_TERMS.search(d.read_text(encoding="utf-8")):
                cfg["doc_sources_excluded"].append((d.name, "names a restricted source"))
            else:
                keep.append(d)
        cfg["doc_sources"] = keep
    return cfg
