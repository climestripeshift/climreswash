"""Per-turn deadline shared by Core threads and their model calls; no global model gate changes."""
from contextvars import ContextVar
import time

deadline = ContextVar("bhoomi_turn_deadline", default=None)


def remaining_timeout(default):
    end = deadline.get()
    if end is None:
        return default
    left = end - time.time()
    if left <= 0:
        from .base import LLMError
        raise LLMError("turn deadline exceeded")
    return min(default, left)
