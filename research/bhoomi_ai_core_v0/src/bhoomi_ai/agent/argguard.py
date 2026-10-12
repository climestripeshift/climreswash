"""Argument grounding: filters the user stated must not be silently dropped.

The MODEL still chooses the tool and fills the arguments. This guard compares the
validated arguments with constraints the user explicitly wrote (state, year/window,
month, top-N, order, ranking metric) and either
  * completes a MISSING filter from the question (recorded and shown to the user), or
  * reports a CONFLICT (an argument that contradicts the question) back to the model once.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..data_access import norm
from .frame import Frame

METRIC_FIELD = {"flood_index": "flood_risk", "flood_any": "flood_risk", "flashflood": "flashflood_risk", "heat": "heat_risk",
                "wetbulb": "wetbulb_risk", "drought": "drought_risk", "cyclone": "cyclone_risk", "coldwave": "coldwave_risk",
                "landslide": "landslide_risk", "sealevel": "sealevel_risk", "fire": "fire_risk", "pollution": "pollution_risk",
                "overall": "hex_risk", "population": "population"}
DISTRICT_TOOLS = {"district_hazard_profile", "forecast_summary", "historical_climate", "wash_context", "monsoon_indicators",
                  "rainfall_features", "reported_flood_months", "map_link"}
SINCE = re.compile(r"\b(since|after|from|starting)\b", re.I)


@dataclass
class GuardResult:
    args: dict
    completed: dict = field(default_factory=dict)   # arg -> value added from the question
    notes: list = field(default_factory=list)
    conflicts: list = field(default_factory=list)


def window_from_frame(frame: Frame, text: str):
    ys = frame.years
    if not ys:
        return None
    if len(ys) == 1:
        return (ys[0], 2023) if SINCE.search(text or "") else (ys[0], ys[0])
    return (ys[0], ys[-1])


def check_arguments(tool: str, args: dict, frame: Frame, text: str, store) -> GuardResult:
    out = GuardResult(dict(args))
    a = out.args

    def complete(key, value, why):
        a[key] = value
        out.completed[key] = value
        out.notes.append(f"{key}={value} was added from your question ({why})")

    if tool == "rank_districts":
        if len(frame.states) == 1 and not a.get("state"):
            complete("state", frame.states[0], "you named this state")
        fields = {METRIC_FIELD[m] for m in frame.metrics if m in METRIC_FIELD}
        if len(fields) == 1:
            want = next(iter(fields))
            if a.get("metric") != want and not ("overall" in frame.metrics and a.get("metric") == "hex_risk"):
                complete("metric", want, "the question names this indicator")
        if frame.order and a.get("order") != frame.order and (a.get("order") or frame.order == "asc"):
            complete("order", frame.order, "ranking direction in the question")
        if frame.top_n and a.get("top_n") != min(frame.top_n, 10):
            complete("top_n", min(frame.top_n, 10), "count in the question")
        return out

    if tool in DISTRICT_TOOLS:
        # state: only for tools that accept it, and only when the user named exactly one state
        if len(frame.states) == 1 and tool in ("district_hazard_profile", "forecast_summary", "historical_climate",
                                                "wash_context", "map_link") and not a.get("state") and a.get("district"):
            r = store.resolve(a["district"], None)
            if r["status"] == "ambiguous":
                complete("state", frame.states[0], "the district name exists in several states")
        # district must be one the user named (or the conversation's current district)
        named = {norm(s) for s, _ in frame.districts}
        ctxd = frame.ctx_district
        if named and a.get("district"):
            ad = norm(a["district"])
            ok = any(ad == n or ad in n or n in ad for n in named) or (ctxd and norm(ctxd) == ad)
            if not ok:
                out.conflicts.append(f"district='{a['district']}' but the question names "
                                     + ", ".join(sorted({s for s, _ in frame.districts})))
        # period filters
        if tool == "reported_flood_months":
            w = window_from_frame(frame, text)
            if w and (a.get("year_from"), a.get("year_to")) != w:
                if a.get("year_from") is None and a.get("year_to") is None or (a.get("year_from"), a.get("year_to")) != w:
                    if "year_from" in a or "year_to" in a:
                        out.notes.append(f"year range corrected to {w[0]}-{w[1]} (question)")
                    else:
                        out.notes.append(f"year range {w[0]}-{w[1]} was added from your question")
                    a["year_from"], a["year_to"] = w
                    out.completed.update({"year_from": w[0], "year_to": w[1]})
        elif tool in ("monsoon_indicators", "rainfall_features"):
            if a.get("year") is None:
                if len(frame.years) == 1:
                    complete("year", frame.years[0], "the year you asked about")
                elif frame.uses_context_year:
                    complete("year", frame.ctx_year, "'that year' refers to the previous answer")
            elif len(frame.years) == 1 and a["year"] != frame.years[0]:
                out.conflicts.append(f"year={a['year']} but the question asks about {frame.years[0]}")
            if tool == "rainfall_features" and a.get("month") is None and len(frame.months) == 1:
                complete("month", frame.months[0], "the month you asked about")
    return out
