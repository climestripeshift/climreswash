"""Answer-relevance check: does the final response address what was asked?

Compares the request frame (metric, geography, period, question type) with the tool
evidence and the answer text. It is independent of numerical verification: an answer
can be fully traceable yet answer a different question (wrong tool, wrong place,
wrong indicator). Rules are conservative; an unparsed question yields no constraint.
"""
from __future__ import annotations

import re

from ..data_access import norm
from .argguard import METRIC_FIELD
from .frame import Frame
from .verifier import Violation

HAZARD_KEYS = {m: f for m, f in METRIC_FIELD.items()}
FACT_FOR = {
    "season_rain": {"jjas_total_mm", "jjas_mean_mm"}, "dry_spell": {"dry_spell_max_days"},
    "jul_aug_share": {"julaug_share_pct"}, "onset": {"onset_proxy_status", "onset_proxy_date"},
    "era5_rain": {"rainfall_mean_mm"}, "rain_trend": {"rainfall_trend_mm_decade"}, "temperature": {"temp_mean_c", "temp_trend_c_decade"},
    "warming": {"temp_trend_c_decade"}, "variability": {"rainfall_cv", "jjas_cv"},
    "wash_water": {"wash_water_pct"}, "wash_sanitation": {"wash_sanitation_pct"}, "wash_stunting": {"wash_stunting_pct"},
    "wash_diarrhoea": {"wash_diarrhoea_pct"}, "wash_anaemia": {"wash_anaemia_pct"}, "wash_tap": {"jjm_fhtc_pct"},
    "month_rain": {"rain_month_total_mm", "rain_month_max_1d_mm"},
}
TOOL_FOR = {  # suggested tool per metric, used in repair messages
    "season_rain": "monsoon_indicators", "dry_spell": "monsoon_indicators", "jul_aug_share": "monsoon_indicators",
    "onset": "monsoon_indicators", "month_rain": "rainfall_features", "reported_floods": "reported_flood_months",
    "era5_rain": "historical_climate", "rain_trend": "historical_climate", "temperature": "historical_climate", "warming": "historical_climate",
    "variability": "historical_climate", "forecast": "forecast_summary", "population": "district_hazard_profile",
    "wash_water": "wash_context", "wash_sanitation": "wash_context", "wash_stunting": "wash_context",
    "wash_diarrhoea": "wash_context", "wash_anaemia": "wash_context", "wash_tap": "wash_context",
}
LABEL = {"season_rain": "June-September rainfall", "dry_spell": "longest dry spell", "jul_aug_share": "July-August share",
         "onset": "monsoon onset proxy", "month_rain": "monthly rainfall", "reported_floods": "reported flood months",
         "era5_rain": "long-term rainfall", "rain_trend": "rainfall trend", "temperature": "temperature", "warming": "warming trend",
         "variability": "rainfall variability", "forecast": "forecast", "population": "population",
         "flood_index": "flood screening index", "flood_any": "flood information", "heat": "heat index",
         "wetbulb": "humid-heat index", "drought": "drought index", "cyclone": "cyclone index",
         "overall": "overall hazard index", "coldwave": "cold-wave index", "fire": "fire index",
         "pollution": "pollution index", "landslide": "landslide index", "sealevel": "sea-level index",
         "flashflood": "flash-flood index", "wash_water": "drinking-water access", "wash_sanitation": "sanitation access",
         "wash_stunting": "stunting", "wash_diarrhoea": "diarrhoea prevalence", "wash_anaemia": "anaemia", "wash_tap": "tap connections"}


# tools whose result is about ONE district (used for the dependent multi-step coherence rule)
DISTRICT_TOOLS = {"wash_context", "district_hazard_profile", "historical_climate", "monsoon_indicators", "rainfall_features",
                  "reported_flood_months", "forecast_summary"}

UNAVAILABLE = re.compile(r"\b(not available|unavailable|no data|not provided|not reported|is missing|are missing|cannot be provided)\b", re.I)


class Evidence:
    def __init__(self, results):
        rs = [r for r in results if r.status in ("ok", "stale")]
        self.tools = {r.tool for r in rs}
        self.fact_keys = {f.key for r in rs for f in r.facts}
        self.districts = {norm(r.entities["district"]) for r in rs if r.entities.get("district")}
        for r in results:
            for c in r.data.get("candidates", []) or []:
                self.districts.add(norm(c["district"]))
            for row in r.data.get("rows", []) or []:
                self.districts.add(norm(row["district"]))
        self.states = {r.entities["state"] for r in rs if r.entities.get("state")}
        self.rank_metrics = {r.data.get("metric") for r in rs if r.tool == "rank_districts"}
        self.rank_states = {r.entities.get("state") for r in rs if r.tool == "rank_districts" and r.entities.get("state")}
        self.years = {r.entities.get("year") for r in rs if r.entities.get("year")}
        self.has_unsupported = any(r.status in ("unsupported", "not_found", "ambiguous", "error") for r in results)

    def satisfies(self, metric: str, frame: Frame) -> bool:
        if metric in HAZARD_KEYS:
            f = HAZARD_KEYS[metric]
            ok = f in self.fact_keys or f in self.rank_metrics
            if metric == "flood_any":
                ok = ok or "reported_flood_months" in self.tools or ("forecast" in frame.metrics and "forecast_summary" in self.tools)
            if metric == "overall":
                ok = ok or "hex_risk" in self.fact_keys
            if metric == "population":
                ok = ok or "population" in self.fact_keys or "population" in self.rank_metrics
            return ok
        if metric == "reported_floods":
            return "reported_flood_months" in self.tools
        if metric == "forecast":
            return "forecast_summary" in self.tools
        if metric in FACT_FOR:
            return bool(FACT_FOR[metric] & self.fact_keys)
        return True


def _rounded_variants(v):
    return {round(v, k) for k in range(0, 4)}


def numbers_in(text: str):
    return [float(m.replace(",", "")) for m in re.findall(r"(?<![\w.])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)", text or "")]


def check(frame: Frame, results, answer: str, user_text: str) -> list[Violation]:
    v: list[Violation] = []
    results = [r for r in results if r.status != "control"]
    if not results:
        return v
    ev = Evidence(results)
    metrics = list(frame.metrics)
    # documentation / navigation / capability questions and results that already state a limitation
    # (ambiguous, out of coverage, not found) are handled by the verifier and the limitation text
    if ev.has_unsupported or frame.qtypes & {"definition", "navigation", "capabilities"} or ev.tools == {"method_notes"}:
        return v
    # ---- requested metric present in the evidence
    missing = [m for m in metrics if not ev.satisfies(m, frame)]
    # an honest statement that a requested value is not available in the data is not a relevance failure
    if missing and UNAVAILABLE.search(answer or ""):
        missing = []
    # a generic or compound reading is satisfied if at least one concrete reading is
    concrete = [m for m in metrics if ev.satisfies(m, frame)]
    if missing and not (set(missing) <= {"flood_any", "temperature", "variability"} and concrete):
        miss = [m for m in missing if m not in ("flood_any",) or not concrete]
        if miss:
            tools = sorted({TOOL_FOR.get(m, "") for m in miss} - {""})
            v.append(Violation("relevance_metric_missing",
                               "the question asks for " + ", ".join(LABEL.get(m, m) for m in miss)
                               + " but no tool result provides it"
                               + (f"; call {', '.join(tools)}" if tools else "")))
    # ---- geography
    if frame.unique_districts and "ranking" not in frame.qtypes or len(frame.unique_districts) >= 2:
        for name, key in frame.unique_districts:
            if norm(name) not in ev.districts and not any(norm(name) in d or d in norm(name) for d in ev.districts):
                if ev.districts or not ev.has_unsupported:
                    v.append(Violation("relevance_district_missing",
                                       f"the question names {name} but no tool result covers it"))
    for s in frame.states:
        if s not in ev.states and s not in ev.rank_states:
            if frame.unique_districts and ev.districts:      # "Kota, Rajasthan": district coverage suffices
                continue
            v.append(Violation("relevance_state_missing", f"the question names {s} but no tool result covers it"))
    # ---- question type
    if "ranking" in frame.qtypes and re.search(r"\bdistricts?\b", user_text or "", re.I) and not frame.unique_districts \
            and "rank_districts" not in ev.tools and metrics:
        v.append(Violation("relevance_ranking_missing",
                           "the question asks for a ranking of districts; call rank_districts with the metric (and state)"))
    if "comparison" in frame.qtypes and len(frame.unique_districts) >= 2:
        covered = [n for n, _ in frame.unique_districts if norm(n) in ev.districts]
        if len(covered) < 2 and ev.districts:
            v.append(Violation("relevance_comparison_incomplete", "the comparison needs results for each named district"))
    # ---- dependent multi-step coherence (v0.2.3): "which district ranks highest ... and ITS <indicator>" must use the ranked
    # district(s). Each figure can be individually grounded and still describe a different district than the one asked about.
    rank = [r for r in results if r.tool == "rank_districts" and r.status == "ok" and r.data.get("rows")]
    if len(rank) == 1 and "ranking" in frame.qtypes and not frame.unique_districts:
        rows, k = rank[0].data["rows"], max(1, frame.top_n or 1)
        allowed = {norm(x["district"]) for x in rows[:k]}
        wrong = [r for r in results if r.tool in DISTRICT_TOOLS and r.status in ("ok", "stale")
                 and r.entities.get("district") and norm(r.entities["district"]) not in allowed]
        if wrong:
            top = ", ".join(x["district"] for x in rows[:k])
            v.append(Violation("relevance_dependent_entity_mismatch",
                               f"the ranking's {'top district' if k == 1 else f'top {k} districts'} is {top}, but a follow-up result is "
                               f"for {wrong[0].entities['district']}; call the second tool for the ranked district"))
    # ---- the answer states what was asked
    if answer:
        nums = numbers_in(answer)
        satisfied_numeric = []
        for r in results:
            for f in r.facts:
                if f.numeric() is None:
                    continue
                if any(f.key in FACT_FOR.get(m, ()) or f.key == HAZARD_KEYS.get(m) for m in metrics):
                    satisfied_numeric.append(f)
            if r.tool == "rank_districts" and r.data.get("metric") in {HAZARD_KEYS.get(m) for m in metrics}:
                satisfied_numeric += [f for f in r.facts if f.numeric() is not None]
        if satisfied_numeric and not any(any(abs(n - x) < 1e-9 for x in _rounded_variants(abs(f.numeric())))
                                         for f in satisfied_numeric for n in nums):
            v.append(Violation("relevance_answer_omits_figure",
                               "the answer does not state the requested figure (" + ", ".join(
                                   sorted({f.label for f in satisfied_numeric})[:3]) + ")"))
        a_norm = norm(answer)
        named = [n for n, _ in frame.unique_districts]
        if named and ev.districts and not any(norm(n) in a_norm for n in named):
            v.append(Violation("relevance_answer_omits_place", f"the answer never names {', '.join(named[:3])}"))
    return v
