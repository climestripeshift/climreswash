"""Shared test fixtures. Real data files are used; the model is scripted."""
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from bhoomi_ai.agent.memory import MemoryGuard  # noqa: E402
from bhoomi_ai.agent.orchestrator import Agent  # noqa: E402
from bhoomi_ai.agent.session import SessionManager  # noqa: E402
from bhoomi_ai.agent.verifier import Verifier  # noqa: E402
from bhoomi_ai.config import load_config  # noqa: E402
from bhoomi_ai.data_access import DataStore  # noqa: E402
from bhoomi_ai.tools import Registry, ToolContext  # noqa: E402

_CACHE = {}


def env():
    if "e" not in _CACHE:
        cfg = load_config()
        store = DataStore(cfg)
        store.cache()
        _CACHE["e"] = (cfg, store, Registry(), Verifier(store))
    return _CACHE["e"]


CLOCK_EXPIRED = datetime(2026, 10, 10, 9, 0, tzinfo=timezone.utc)   # forecast valid 2026-09-09..15 -> expired
CLOCK_CURRENT = datetime(2026, 9, 10, 9, 0, tzinfo=timezone.utc)    # one day after issue -> current
CLOCK_STALE = datetime(2026, 9, 12, 9, 0, tzinfo=timezone.utc)      # 3 days after issue, still in window -> stale


def ctx(now=CLOCK_EXPIRED):
    cfg, store, _, _ = env()
    return ToolContext(store, cfg, now)


def agent(backend, now=CLOCK_EXPIRED, free_mb=4000.0, max_repairs=None):
    cfg, store, reg, ver = env()
    if max_repairs is not None:
        cfg = {**cfg, "agent": {**cfg["agent"], "max_repairs": max_repairs}}
    guard = MemoryGuard(cfg["limits"]["memory_hard_stop_mb"], cfg["limits"]["memory_warn_mb"], reader=lambda: free_mb)
    return Agent(backend, reg, store, cfg, ver, clock=lambda: now, guard=guard)


def session():
    return SessionManager().create()


def numbered(results):
    n = 0
    for r in results:
        for f in r.facts:
            n += 1
            f.id = f"F{n}"
    return results
