"""Local sessions and bounded, authenticated gateway-owned portable snapshots."""
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
    prior_context: dict = field(default_factory=dict)
    prior_turn_count: int = 0

    def context(self) -> dict:
        """Most recent resolved entities, built from tool results only (never from model prose)."""
        ctx: dict = dict(self.prior_context)
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

    def portable(self, history_turns: int = 3) -> dict:
        return {"id": self.id, "turn_count": self.prior_turn_count + len(self.turns), "context": self.context(),
                "turns": [{"user": t.user, "answer": TAGS.sub("", t.answer)[:500], "entities": t.entities, "status": t.status}
                          for t in self.turns[-history_turns:]]}

    @staticmethod
    def restore(value: dict, max_turns: int = 40) -> "Session":
        def entities(v):
            if not isinstance(v, dict) or set(v) - {"district", "state", "year", "month"}: raise ValueError("invalid context")
            for x in v.values():
                if isinstance(x, bool) or not isinstance(x, (str, int)) or (isinstance(x, str) and len(x) > 160): raise ValueError("invalid entity")
            return v
        if not isinstance(value, dict) or set(value) != {"id", "turn_count", "context", "turns"}: raise ValueError("invalid session")
        if not re.fullmatch(r"[0-9a-f]{24}", value.get("id", "")): raise ValueError("invalid id")
        count, turns = value["turn_count"], value["turns"]
        if type(count) is not int or not 0 <= count < max_turns or not isinstance(turns, list) or len(turns) > 3 or len(turns) > count: raise ValueError("turn limit")
        s = Session(value["id"], time.time(), time.time(), prior_context=entities(value["context"]), prior_turn_count=count-len(turns))
        for t in turns:
            if not isinstance(t, dict) or set(t) != {"user", "answer", "entities", "status"}: raise ValueError("invalid turn")
            if not isinstance(t["user"], str) or len(t["user"]) > 1500 or not isinstance(t["answer"], str) or len(t["answer"]) > 500 or not isinstance(t["status"], str) or len(t["status"]) > 80: raise ValueError("invalid history")
            s.turns.append(Turn(t["user"], t["answer"], entities(t["entities"]), t["status"]))
        return s


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
