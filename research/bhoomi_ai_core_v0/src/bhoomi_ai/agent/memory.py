"""Memory-pressure guard for the 8 GB MacBook (macOS `vm_stat`).

"Available" is free + inactive + speculative pages. Below the hard limit the
agent refuses to start a model call (a clear error, not a swap storm); below the
warn level the turn proceeds and the condition is recorded.
"""
from __future__ import annotations

import re
import subprocess


def read_available_mb() -> float | None:
    try:
        out = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=5).stdout
    except Exception:  # noqa: BLE001 - non-macOS or sandbox
        return None
    m = re.search(r"page size of (\d+) bytes", out)
    page = int(m.group(1)) if m else 16384
    pages = 0
    for label in ("Pages free", "Pages inactive", "Pages speculative"):
        mm = re.search(label + r":\s+(\d+)", out)
        if mm:
            pages += int(mm.group(1))
    return pages * page / (1024 * 1024)


def process_rss_mb(pid: int) -> float | None:
    try:
        out = subprocess.run(["ps", "-o", "rss=", "-p", str(pid)], capture_output=True, text=True, timeout=5).stdout
        return int(out.strip()) / 1024.0
    except Exception:  # noqa: BLE001
        return None


class MemoryGuard:
    def __init__(self, hard_stop_mb: float = 250, warn_mb: float = 600, reader=read_available_mb):
        self.hard, self.warn, self.reader = hard_stop_mb, warn_mb, reader

    def check(self) -> dict:
        mb = self.reader()
        if mb is None:
            return {"level": "unknown", "available_mb": None}
        level = "stop" if mb < self.hard else "warn" if mb < self.warn else "ok"
        return {"level": level, "available_mb": round(mb, 1)}
