"""Conversation sessions with hard limits. State is in memory only."""
from __future__ import annotations

import re
import secrets
import time
from dataclasses import dataclass, field

TAGS = re.compile(r"\s*\[\s*F\d+(?:\s*[,;]\s*F\d+)*\s*\]")


@dataclass
class Turn:
    user: str
    answer: str
    entities: dict
    status: str


@dataclass
class Session:
    id: str
    created: float
    last_active: float
    turns: list[Turn] = field(default_factory=list)

    def context(self) -> dict:
        """Most recent resolved entities, built from tool results only (never from model prose)."""
        ctx: dict = {}
        for t in self.turns:
            ctx.update({k: v for k, v in t.entities.items() if v})
        return ctx

    def history_messages(self, n: int, max_chars: int = 500) -> list[dict]:
        msgs = []
        for t in self.turns[-n:]:
            msgs.append({"role": "user", "content": t.user})
            a = TAGS.sub("", t.answer)
            msgs.append({"role": "assistant", "content": a[:max_chars]})
        return msgs


class SessionLimitError(RuntimeError):
    pass


class SessionManager:
    def __init__(self, max_sessions=20, max_turns=40, idle_s=3600, clock=time.time):
        self.max_sessions, self.max_turns, self.idle_s, self.clock = max_sessions, max_turns, idle_s, clock
        self._s: dict[str, Session] = {}

    def _expire(self):
        now = self.clock()
        for sid in [k for k, v in self._s.items() if now - v.last_active > self.idle_s]:
            del self._s[sid]

    def create(self) -> Session:
        self._expire()
        if len(self._s) >= self.max_sessions:
            raise SessionLimitError("too many active sessions")
        s = Session(secrets.token_hex(12), self.clock(), self.clock())
        self._s[s.id] = s
        return s

    def get(self, sid: str | None) -> Session | None:
        self._expire()
        return self._s.get(sid) if sid else None

    def begin_turn(self, sid: str | None) -> Session:
        s = self.get(sid) or self.create()
        if len(s.turns) >= self.max_turns:
            raise SessionLimitError("session turn limit reached; start a new session")
        s.last_active = self.clock()
        return s

    def count(self) -> int:
        self._expire()
        return len(self._s)
