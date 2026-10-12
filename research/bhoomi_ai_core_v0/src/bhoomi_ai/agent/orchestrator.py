"""Tool-using agent loop.

The MODEL chooses tools, arguments, refusals and clarifications. Code does four
things only: validate arguments against schemas, execute read-only tools, verify
the model's prose against the tool evidence, and fall back to verified tool
results (with limitations) when verification fails. No response is routed or
scripted by keywords.
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

from ..llm.base import LLMBackend, LLMError
from ..tools import CONTROL, Registry, ToolContext, ToolResult
from . import prompts
from . import relevance
from .argguard import check_arguments
from .frame import parse_request
from .memory import MemoryGuard
from .render import DATA_CLASS_LABEL, evidence_block, fallback_answer
from .session import Session, Turn
from .verifier import FACT_TAG, RESOLUTION, VerificationReport, Verifier, Violation

# "what share of its households have improved sanitation" asks for a district-level survey indicator; "which households ..." asks
# for a listing at household level (never exempt)
_HH_INDICATOR = re.compile(r"\b(?:share|percent\w*|proportion|fraction|how\s+many|number\s+of)\b[^.?]{0,40}\bhouseholds?\b"
                           r"|\bhouseholds?\s+(?:have|has|with|having|using|that|who)\b", re.I)
_HH_LISTING = re.compile(r"\b(?:which|list|name|show|identify|find)\s+(?:the\s+|all\s+)?households?\b", re.I)

SCOPE_NOTE = ("Bhoomi AI Core v0.1 can report screening indices, forecasts, reported flood records, rainfall indicators, "
              "reanalysis climate summaries and WASH survey values for districts, with their limitations. It does not give "
              "future probabilities or predictions, explain causes, or resolve villages or facilities.")


@dataclass
class TurnResult:
    session_id: str
    status: str            # verified | direct | clarification | unsupported | fallback | no_evidence | invalid | resource_limit | model_error | tool_failure
    answer: str = ""
    evidence: str = ""
    facts: list = field(default_factory=list)
    results: list = field(default_factory=list)
    trace: list = field(default_factory=list)
    verification: dict = field(default_factory=dict)
    model_draft: str = ""
    repaired: bool = False
    fallback_used: bool = False
    links: list = field(default_factory=list)
    latency_s: float = 0.0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    memory: dict = field(default_factory=dict)
    notes: list = field(default_factory=list)
    frame: dict = field(default_factory=dict)
    model: dict = field(default_factory=dict)
    request: str = ""
    error: str = ""

    def to_dict(self) -> dict:
        return self.__dict__.copy()

    def full_text(self) -> str:
        return self.answer + (("\n\n" + self.evidence) if self.evidence else "")


def _tool_message(r: ToolResult, shown_limit: int, budget: dict) -> str:
    lines = [f"RESULT {r.tool} status={r.status}", r.summary]
    sem = r.semantics
    if sem.get("data_class"):
        lines.append("Kind: " + DATA_CLASS_LABEL.get(sem["data_class"], sem["data_class"]))
    if sem.get("coverage") and sem.get("coverage") != "India":
        lines.append("Coverage: " + sem["coverage"])
    shown = 0
    for f in r.facts:
        if budget["facts"] >= shown_limit:
            break
        lines.append(f"{f.id} | {f.label} | {f.display()}")
        budget["facts"] += 1
        shown += 1
    if shown < len(r.facts):
        lines.append(f"({len(r.facts) - shown} more facts omitted)")
    if r.data.get("candidates"):
        lines.append("Candidates: " + "; ".join(f"{c['district']} ({c['state']})" for c in r.data["candidates"]))
    for lim in r.limitations[:3]:
        lines.append("Limit: " + lim[:200])
    return "\n".join(lines)


class Agent:
    def __init__(self, backend: LLMBackend, registry: Registry, store, cfg: dict, verifier: Verifier | None = None,
                 clock=None, guard: MemoryGuard | None = None):
        self.backend, self.registry, self.store, self.cfg = backend, registry, store, cfg
        self.verifier = verifier or Verifier(store)
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        a = cfg["agent"]
        self.max_steps, self.max_calls = a["max_tool_steps"], a["max_calls_per_step"]
        self.max_repairs, self.max_arg_retries = a["max_repairs"], a["max_tool_arg_retries"]
        self.history_turns, self.max_chars = a["history_turns"], a["max_user_chars"]
        self.max_facts = a["max_facts_in_prompt"]
        lim = cfg["limits"]
        self.guard = guard or MemoryGuard(lim["memory_hard_stop_mb"], lim["memory_warn_mb"])

    # ------------------------------------------------------------------ helpers
    def _context_line(self, session: Session) -> str:
        c = session.context()
        bits = [f"{k}={c[k]}" for k in ("district", "state", "year", "month") if c.get(k)]
        return ("Earlier in this conversation the resolved place/period was: " + ", ".join(bits) + ". "
                "Use it only to fill in omitted details; fetch values again with tools.") if bits else ""

    def _named_unique_district(self, text: str, session: Session):
        """A district the user (or the session) already named that resolves to exactly one place, else None."""
        from ..data_access import norm
        g = self.store.gazetteer()["by_norm"]
        words = [w for w in text.replace(",", " ").replace("?", " ").replace(".", " ").split() if w]
        for n in (3, 2, 1):
            for i in range(len(words) - n + 1):
                gram = " ".join(words[i:i + n])
                if n == 1 and len(gram) < 4:
                    continue
                keys = g.get(norm(gram))
                if keys and len(keys) == 1:
                    return gram
        return session.context().get("district")

    def _assign_ids(self, r: ToolResult, counter: list):
        for f in r.facts:
            counter[0] += 1
            f.id = f"F{counter[0]}"

    def _verify(self, text, results, user_text, context_text, refusal=False, frame=None) -> VerificationReport:
        rep = self.verifier.verify(text, results, user_text, context_text, refusal=refusal)
        if frame is not None and not refusal:
            for viol in relevance.check(frame, results, text, user_text):
                rep.violations.append(viol)
                rep.passed = False
        from .verifier import NUMBER, DATE
        # a cited numeric fact whose value is stated nowhere in the answer (the model gave the id but not the figure)
        by_id = {f.id: f for r in results for f in r.facts}
        stated = [float(m.group(1).replace(",", "") + (m.group(2) or ""))
                  for m in NUMBER.finditer(DATE.sub(" ", FACT_TAG.sub(" ", text)))]
        if not refusal:
            for i in dict.fromkeys(i for m in FACT_TAG.finditer(text) for i in re.split(r"\s*[,;]\s*", m.group(1))):
                f = by_id.get(i)
                if f is not None and f.numeric() is not None and not any(
                        any(abs(round(abs(f.numeric()), k) - x) < 1e-9 for k in range(0, 4)) for x in stated):
                    rep.violations.append(Violation("figure_missing", f"cites {i} without stating its figure"))
                    rep.passed = False
                    break
        evidence_numeric = any(f.numeric() is not None for r in results for f in r.facts)
        if not refusal and evidence_numeric and not FACT_TAG.search(text):
            rep.warnings.append("no [F#] citations in the answer; the evidence block lists the facts")
        return rep

    # ------------------------------------------------------------------ turn
    def run_turn(self, session: Session, user_text: str) -> TurnResult:
        t0 = time.time()
        out = TurnResult(session_id=session.id, status="invalid", request=user_text or "")
        out.model = self.backend.model_info()
        text = (user_text or "").strip()
        if not text:
            out.answer = "Please type a question."
            return out
        if len(text) > self.max_chars:
            out.answer = f"The question is too long ({len(text)} characters; limit {self.max_chars})."
            return out
        mem = self.guard.check()
        out.memory = mem
        if mem["level"] == "stop":
            out.status = "resource_limit"
            out.answer = (f"Only {mem['available_mb']} MB of memory is available, below the safety limit. "
                          "Close other applications and try again; no model call was made.")
            return out

        now = self.clock()
        ctx = ToolContext(self.store, self.cfg, now)
        context_line = self._context_line(session)
        system = prompts.SYSTEM.format(today=now.date().isoformat()) + (("\n" + context_line) if context_line else "")
        messages = [{"role": "system", "content": system}] + session.history_messages(self.history_turns) \
            + [{"role": "user", "content": text}]
        specs = self.registry.specs()
        results: list[ToolResult] = []
        control: ToolResult | None = None
        counter, budget = [0], {"facts": 0}
        seen: dict[str, ToolResult] = {}
        arg_errors = repairs = 0
        clar_rejected = False
        guard_conflicts = 0
        frame = parse_request(text, self.store, session.context())
        arg_notes: list[str] = []
        out.frame = {"metrics": frame.metrics, "districts": [s for s, _ in frame.districts], "states": frame.states,
                     "years": frame.years, "months": frame.months, "qtypes": sorted(frame.qtypes)}
        nudged = False
        draft = ""
        verification: VerificationReport | None = None
        failure = ""

        try:
            for step in range(self.max_steps):
                last = step == self.max_steps - 1
                resp = self.backend.chat(messages, tools=None if (last and results) else specs)
                out.prompt_tokens += resp.prompt_tokens
                out.completion_tokens += resp.completion_tokens
                rec = {"step": step, "latency_s": round(resp.latency_s, 2), "tokens": [resp.prompt_tokens, resp.completion_tokens],
                       "calls": [], "content_chars": len(resp.content or "")}
                out.trace.append(rec)

                if resp.tool_calls:
                    echo = [{"function": {"name": c.name, "arguments": c.arguments if isinstance(c.arguments, dict) else {}}}
                            for c in resp.tool_calls[: self.max_calls]]
                    messages.append({"role": "assistant", "content": resp.content or "", "tool_calls": echo})
                    has_data = any(c.name in self.registry.tools and c.name not in CONTROL
                                   for c in resp.tool_calls[: self.max_calls])
                    for i, c in enumerate(resp.tool_calls):
                        call = {"name": c.name, "arguments": c.arguments, "source": c.source}
                        rec["calls"].append(call)
                        if i >= self.max_calls:
                            call["skipped"] = "too many calls in one step"
                            continue
                        if c.name == "ask_clarification" and has_data:
                            call["skipped"] = "clarification ignored: data tools were called in the same step"
                            continue
                        if c.name == "ask_clarification" and not clar_rejected:
                            named = self._named_unique_district(text, session) or (frame.states[0] if len(frame.states) == 1 else None)
                            if named:
                                clar_rejected = True
                                call["skipped"] = f"clarification rejected: the user already named {named}"
                                messages.append({"role": "tool", "content":
                                                 f"The user already named '{named}'. Do not ask them to restate it. Call the "
                                                 "appropriate tool now, or declare_unsupported if no tool can answer."})
                                continue
                        args, errs = self.registry.validate(c.name, c.arguments)
                        if errs:
                            call["validation_errors"] = errs
                            arg_errors += 1
                            messages.append({"role": "tool", "content": "ERROR invalid tool call: " + "; ".join(errs)
                                             + ". Fix the arguments and call again, or choose another tool."})
                            if arg_errors > self.max_arg_retries:
                                failure = "The model could not produce a valid tool call."
                                raise _Stop()
                            continue
                        if c.name not in CONTROL:
                            g = check_arguments(c.name, args, frame, text, self.store)
                            if g.conflicts and guard_conflicts < 1:
                                guard_conflicts += 1
                                call["guard_conflict"] = g.conflicts
                                messages.append({"role": "tool", "content": "Argument check failed: " + "; ".join(g.conflicts)
                                                 + ". Call the tool again with arguments that match the question."})
                                continue
                            if g.completed:
                                args2, errs2 = self.registry.validate(c.name, g.args)
                                if not errs2:
                                    args = args2
                                    call["completed_args"] = g.completed
                                    arg_notes.extend(n for n in g.notes if n not in arg_notes)
                        key = c.name + json.dumps(args, sort_keys=True)
                        if key in seen:
                            call["duplicate"] = True
                            messages.append({"role": "tool", "content": "Same call already made; use the earlier result."})
                            continue
                        r = self.registry.execute(c.name, args, ctx)
                        call["status"] = r.status
                        seen[key] = r
                        if c.name in CONTROL:
                            control = r
                            raise _Stop()
                        self._assign_ids(r, counter)
                        results.append(r)
                        if r.data.get("url"):
                            out.links.append(r.data["url"])
                        messages.append({"role": "tool", "content": _tool_message(r, self.max_facts, budget)})
                    continue

                # no tool call: the content is a draft answer
                draft = (resp.content or "").strip()
                if not draft:
                    failure = "The model returned an empty answer."
                    break
                verification = self._verify(draft, results, text, context_line, frame=frame)
                if verification.passed:
                    break
                if repairs >= self.max_repairs:
                    break
                repairs += 1
                out.repaired = True
                problems = "\n".join(f"- {v.rule}: {v.detail}" for v in verification.violations[:6])
                messages.append({"role": "assistant", "content": draft})
                if results:
                    messages.append({"role": "user", "content": prompts.REPAIR.format(problems=problems)})
                else:
                    messages.append({"role": "user", "content": prompts.NO_TOOL_NUDGE + "\n" + problems})
                    nudged = True
                rec["rejected"] = [v.rule for v in verification.violations]
                continue
            else:
                failure = failure or "Step limit reached without a final answer."
        except _Stop:
            pass
        except LLMError as exc:
            out.status = "model_error"
            out.error = str(exc)
            failure = f"The local model is unavailable: {exc}"

        # ---- assemble the final answer ------------------------------------------------
        out.results = [r.to_log() for r in results]
        out.notes = arg_notes
        out.facts = [f for r in out.results for f in r["facts"]]
        out.model_draft = draft
        if out.status == "model_error":
            out.answer = failure
            out.evidence = evidence_block(results)
            self._finish(out, session, results, t0, text)
            return out

        if control is not None:
            self._finish_control(out, control, results, text, context_line, frame)
        elif verification is not None and verification.passed and draft:
            out.answer = draft
            out.status = "verified" if results else "direct"
            out.verification = verification.to_dict()
            out.evidence = evidence_block(results)
        elif results:
            out.status = "fallback"
            out.fallback_used = True
            if verification is not None:
                out.verification = verification.to_dict()
            amb = next((r for r in results if r.status == "ambiguous"), None)
            note = "The drafted explanation could not be verified against the tool results, so only the verified results are shown."
            if failure and not draft:
                note = failure + " Verified tool results so far:"
            lead = self._limitation_lead(verification.violations if verification else [], frame, results, text)
            out.answer = fallback_answer(results, note, lead)
            if amb:
                out.answer += "\nWhich one do you mean? Please name the state."
            out.evidence = evidence_block(results)
        else:
            out.status = "tool_failure" if failure.startswith("The model could not") else "no_evidence"
            if verification is not None:
                out.verification = verification.to_dict()
            lead = self._limitation_lead(verification.violations if verification else [], frame, results, text)
            out.answer = ((failure + " ") if failure else "") + (("Limitation: " + lead + " ") if lead else "") + (
                "I could not ground an answer in tool results, so I am not giving one. " + SCOPE_NOTE)
        self._finish(out, session, results, t0, text)
        return out

    # ------------------------------------------------------------------ pieces
    NEAREST = {
        "forecast_summary": "the stored week-long forecast screening index for a district",
        "district_hazard_profile": "the current hazard screening profile of a district",
        "rank_districts": "a ranking of districts by a hazard screening index or population",
        "monsoon_indicators": "historical June-September rainfall indicators for a Rajasthan district (2000-2023)",
        "rainfall_features": "historical monthly rainfall for a Rajasthan district (2000-2023)",
        "reported_flood_months": "historical reported flood months for a Rajasthan district (2000-2023)",
        "historical_climate": "long-term ERA5 climate context for a district",
        "wash_context": "district WASH and health survey values",
        "method_notes": "how an indicator is defined",
    }

    @classmethod
    def _refusal_text(cls, frame, reason: str, near: str) -> str:
        """Explicit limitation statement. The model decided to decline; the wording is deterministic and honest."""
        parts = []
        if "village" in frame.qtypes:
            parts.append("village-, household-, ward- or facility-level results are not available; Bhoomi AI reports "
                         "district-level screening only")
        if "prediction" in frame.qtypes:
            parts.append("predictions and future probabilities are not available; Bhoomi AI reports historical records, "
                         "current screening indices and the stored week-long forecast")
        if "causal" in frame.qtypes:
            parts.append("causal attribution is not available; the tools describe what the data show, not why")
        if frame.out_of_range_years:
            parts.append("rainfall and flood records cover 2000-2023 only (the stored forecast covers its own 7-day window)")
        if not parts:
            parts.append("this analysis cannot be produced from the available tools")
        text = "I can't answer this as asked: " + "; ".join(parts) + "."
        label = cls.NEAREST.get((near or "").strip())
        if label:
            text += " What I can provide instead: " + label + "."
        elif near and re.fullmatch(r"[A-Za-z ,;:'()\-.]{8,160}", near) and "_" not in near:
            text += " What I can provide instead: " + near.rstrip(".") + "."
        return text

    @staticmethod
    def _limitation_lead(violations, frame, results, user_text: str = "") -> str:
        """A deterministic, explicit statement of what could not be provided."""
        rules = {v.rule for v in violations}
        parts = []
        village = "village" in frame.qtypes
        if village and user_text:
            # "share of its households have improved sanitation" is a district-level survey indicator, not a household-level
            # request; the verifier applies the same exemption when a survey result is present
            words = [m.group(0).lower() for m in RESOLUTION.finditer(user_text)]
            indicator_phrase = _HH_INDICATOR.search(user_text) and not _HH_LISTING.search(user_text)
            if indicator_phrase and any(r.semantics.get("data_class") == "survey" for r in results):
                words = [w for w in words if w not in ("household", "households")]
            village = bool(words)
        if village or "requested_resolution_unaddressed" in rules:
            parts.append("village-, household- or facility-level results are not available; Bhoomi AI reports "
                         "district-level screening only")
        if "requested_future_unaddressed" in rules or ("prediction" in frame.qtypes and not results):
            parts.append("predictions and future probabilities are not available; only historical records, current "
                         "screening indices and the stored forecast can be reported")
        if "causal" in frame.qtypes:
            parts.append("causal attribution is not available")
        if frame.out_of_range_years:
            parts.append("rainfall and flood records cover 2000-2023 only")
        for v in violations:
            if v.rule == "relevance_ranking_missing":
                parts.append("the ranking of districts you asked for could not be produced, so the results below do not "
                             "answer that question")
            elif v.rule in ("relevance_answer_omits_figure", "relevance_answer_omits_place"):
                parts.append("the drafted answer did not state the requested figure for the requested place; "
                             "the verified results below are shown instead")
            elif v.rule == "relevance_metric_missing":
                parts.append(v.detail.split("; call")[0])
            elif v.rule in ("relevance_district_missing", "relevance_state_missing", "relevance_comparison_incomplete"):
                parts.append(v.detail)
            elif v.rule == "relevance_dependent_entity_mismatch":
                parts.append(v.detail.split("; call")[0] + ", so the results below do not answer the question as asked")
            elif v.rule in ("period_not_applied", "scope_not_applied"):
                parts.append(v.detail.split("; call")[0])
        seen, out = set(), []
        for p in parts:
            if p not in seen:
                seen.add(p)
                out.append(p)
        return ("; ".join(out) + ".") if out else ""

    def _finish_control(self, out: TurnResult, control: ToolResult, results, user_text, context_line, frame=None):
        if control.tool == "ask_clarification":
            q = control.data.get("question", "")
            rep = self._verify(q, results, user_text, context_line, refusal=True)
            out.verification = rep.to_dict()
            out.status = "clarification"
            out.answer = q if rep.passed else "Could you say which district, state or period you mean?"
        else:
            reason = control.data.get("reason", "")
            near = control.data.get("nearest_supported", "")
            text = reason + ((" " + near) if near else "")
            rep = self._verify(text, results, user_text, context_line, refusal=True)
            out.verification = rep.to_dict()
            out.status = "unsupported"
            near_ok = near if (near and self._verify(near, results, user_text, context_line, refusal=True).passed) else ""
            out.answer = self._refusal_text(frame, reason, near_ok)
            if not rep.passed:
                out.fallback_used = True        # the model's own wording was rejected by the verifier
        out.evidence = evidence_block(results)

    # Deterministic limitation statements cite data-coverage figures (record years, forecast window). Those figures are
    # configuration facts, not tool outputs, so a statement that cites them must carry them as explicit evidence;
    # otherwise any "numbers must come from evidence" check sees them as ungrounded (v0.2.2).
    _COV_PATTERNS = (re.compile(r"\bcover (\d{4})-(\d{4})\b"), re.compile(r"\((\d{4})-(\d{4})\)"),
                     re.compile(r"\bcovers its own (\d+)-day window\b"))

    def _ground_coverage(self, out: TurnResult) -> None:
        ans = out.answer or ""
        if not ans:
            return
        cov = self.store.coverage()
        y = (str(cov["records_year_from"]), str(cov["records_year_to"]))
        cited_years = any(m.groups() == y for p in self._COV_PATTERNS[:2] for m in p.finditer(ans))
        cited_days = any(m.group(1) == str(cov["forecast_days"]) for m in self._COV_PATTERNS[2].finditer(ans))
        if not (cited_years or cited_days):
            return
        parts = []
        if cited_years:
            parts.append(f"rainfall, monsoon and reported-flood records cover {y[0]}-{y[1]}")
        if cited_days:
            parts.append(f"the stored forecast covers its own {cov['forecast_days']}-day window")
        summary = "Data coverage: " + "; ".join(parts) + "."
        out.results = list(out.results) + [{
            "tool": "coverage_statement", "status": "ok", "summary": summary, "facts": [],
            "entities": {}, "semantics": {"data_class": "documentation", "temporal_class": "static", "spatial": "n/a",
                                          "coverage": f"{y[0]}-{y[1]}"},
            "provenance": [{"file": "config/agent.json", "role": "coverage constants (system statement, not a tool output)",
                            "period": f"{y[0]}-{y[1]}"}],
            "limitations": [], "data": {}}]

    def _finish(self, out: TurnResult, session: Session, results, t0: float, text: str):
        self._ground_coverage(out)
        ents: dict = {}
        for r in results:
            if r.status in ("ok", "stale"):
                ents.update({k: v for k, v in r.entities.items() if k in ("district", "state", "year", "month") and v})
        out.latency_s = round(time.time() - t0, 2)
        session.turns.append(Turn(user=text, answer=out.answer, entities=ents, status=out.status))


class _Stop(Exception):
    pass
