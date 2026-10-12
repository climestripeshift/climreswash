"""The 11 read-only analytical tools plus two control tools.

Each tool wraps an EXISTING dataset or research-module output; none recomputes a
scientific formula. Every result states unit, data class (observation record /
reanalysis / screening index / forecast / survey), temporal class, spatial
coverage, provenance (file + SHA-256) and limitations.
"""
from __future__ import annotations

import re
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

from ..data_access import FORECAST_HAZARD_NAMES, HAZARD_FIELDS, norm
from .base import Fact, Tool, ToolContext, ToolResult

HAZ_LABEL = {
    "flood_risk": "Pluvial flood", "heat_risk": "Dry heat", "cyclone_risk": "Cyclone",
    "drought_risk": "Drought (NDVI-proxy based)", "wetbulb_risk": "Humid heat (wet-bulb)",
    "landslide_risk": "Landslide", "coldwave_risk": "Cold wave", "flashflood_risk": "Flash flood",
    "sealevel_risk": "Sea level / coastal", "fire_risk": "Vegetation fire",
    "pollution_risk": "Air pollution", "hex_risk": "Overall (highest channel + cascades)",
}
SCREENING_LIMITS = [
    "Rule-based screening index on a 0-10 scale, not a calibrated probability and not a count of people or events.",
    "Population-weighted mean of H3 resolution-5 hex scores (~252 km2 each); it does not describe villages or facilities.",
    "The scoring engine has not been validated against independent impact records; some inputs are proxies (for example NDVI for drought).",
]
RAJ_COVERAGE = "Rajasthan only: the 33 historical (pre-2023) districts"


def _fail(tool, status, summary, **kw):
    return ToolResult(tool=tool, status=status, summary=summary, **kw)


def _district_or_result(ctx: ToolContext, tool: str, args: dict, semantics: dict, rajasthan_only=False):
    """Resolve district/state; return (key, None) or (None, ToolResult)."""
    r = ctx.store.resolve(args.get("district"), args.get("state"))
    cache = ctx.store.cache()["districts"]
    if r["status"] == "not_found_state":
        return None, _fail(tool, "not_found", f"State '{args.get('state')}' is not in the dataset.",
                           semantics=semantics, limitations=["Check the state name."])
    if r["status"] == "not_found":
        return None, _fail(tool, "not_found", f"District '{args.get('district')}' was not found.",
                           semantics=semantics, limitations=["No district with that name exists in the dataset."])
    if r["status"] == "ambiguous":
        cands = [{"district": cache[k]["district"], "state": cache[k]["state"]} for k in r["matches"]]
        return None, _fail(tool, "ambiguous",
                           "Several districts match; specify the state: "
                           + "; ".join(f"{c['district']} ({c['state']})" for c in cands),
                           data={"candidates": cands}, semantics=semantics,
                           limitations=["The same district name exists in more than one state."])
    key = r["matches"][0]
    d = cache[key]
    if rajasthan_only and d["state"] != "Rajasthan":
        return None, _fail(tool, "unsupported",
                           f"This capability covers {RAJ_COVERAGE}; {d['district']} is in {d['state']}.",
                           entities={"state": d["state"], "district": d["district"]}, semantics=semantics,
                           limitations=[f"Coverage: {RAJ_COVERAGE}."])
    return key, None


def _ent(d):
    return {"state": d["state"], "district": d["district"]}


# ---------------------------------------------------------------------------
class ResolvePlace(Tool):
    name = "resolve_place"
    description = ("Look up a district or state name in the gazetteer and return candidate matches. "
                   "Use it when a place name may be ambiguous (several states share some district names).")
    parameters = {"type": "object", "properties": {
        "query": {"type": "string", "description": "district or state name"},
        "state": {"type": "string", "description": "optional state to disambiguate"}},
        "required": ["query"], "additionalProperties": False}
    semantics = {"data_class": "gazetteer", "temporal_class": "static", "is_probability": False,
                 "spatial": "district names from the ClimResWASH hex grid (India, 35 states/UTs)"}

    def run(self, args, ctx):
        g = ctx.store.gazetteer()
        q, st = args["query"], args.get("state")
        if norm(q) in g["state_norm"] and not st:
            s = g["state_norm"][norm(q)]
            n = sum(1 for v in ctx.store.cache()["districts"].values() if v["state"] == s)
            return ToolResult(self.name, "ok", f"{s} is a state with {n} districts in the dataset.",
                              facts=[Fact("n_districts", f"Districts in {s}", n, "count")],
                              entities={"state": s}, semantics=self.semantics,
                              provenance=[ctx.store.provenance("hex_props", "gazetteer")])
        r = ctx.store.resolve(q, st)
        cache = ctx.store.cache()["districts"]
        if r["status"] in ("not_found", "not_found_state"):
            return _fail(self.name, "not_found", f"No place matching '{q}' was found.", semantics=self.semantics)
        cands = [{"district": cache[k]["district"], "state": cache[k]["state"]} for k in r["matches"]]
        status = "ok" if len(cands) == 1 else "ambiguous"
        return ToolResult(
            self.name, status,
            ("Match: " if status == "ok" else "Multiple matches: ")
            + "; ".join(f"{c['district']} ({c['state']})" for c in cands),
            facts=[Fact("n_matches", "Matching districts", len(cands), "count")],
            entities=(cands[0] if status == "ok" else {}), data={"candidates": cands, "fuzzy": r["fuzzy"]},
            semantics=self.semantics, provenance=[ctx.store.provenance("hex_props", "gazetteer")],
            limitations=(["Approximate (fuzzy) name match; confirm the place."] if r["fuzzy"] else []))


class DistrictHazardProfile(Tool):
    name = "district_hazard_profile"
    description = ("Current-release hazard SCREENING INDEX (0-10) for a district: population-weighted mean of hex scores for "
                   "flood, heat, drought, humid heat, cyclone, etc. Not a probability and not a forecast.")
    parameters = {"type": "object", "properties": {
        "district": {"type": "string"}, "state": {"type": "string"},
        "hazards": {"type": "array", "items": {"type": "string", "enum": list(HAZARD_FIELDS)},
                    "description": "optional subset; by default ALL hazard channels are returned"}},
        "required": ["district"], "additionalProperties": False}
    semantics = {"data_class": "screening_index", "temporal_class": "current_release", "is_probability": False,
                 "spatial": "district, population-weighted mean of H3 res-5 hexes (~252 km2)",
                 "coverage": "India", "origin": "rule-based model output"}

    def run(self, args, ctx):
        key, early = _district_or_result(ctx, self.name, args, self.semantics)
        if early:
            return early
        d = ctx.store.cache()["districts"][key]
        haz = {k: v for k, v in d["hazards"].items() if v is not None}
        wanted = args.get("hazards")
        if wanted:
            order = [h for h in wanted if h in haz]
        else:
            rest = sorted((k for k in haz if k != "hex_risk"), key=lambda k: (-haz[k], k))
            order = (["hex_risk"] if "hex_risk" in haz else []) + rest
        facts = [Fact(h, f"{HAZ_LABEL[h]} screening index", haz[h], "index_0_10", 2,
                      "0-10 rule-based screening index (population-weighted district mean)") for h in order]
        facts.append(Fact("population", "District population in the hex grid", d["population"], "people", 0))
        facts.append(Fact("n_hexes", "H3 hexes in district", d["n_hexes"], "count", 0))
        if d["dominant_hazard"]:
            facts.append(Fact("dominant_hazard", "Highest-scoring hazard channel", HAZ_LABEL[d["dominant_hazard"]]))
        lim = list(SCREENING_LIMITS)
        if d["population"] == 0:
            lim.append("District population is 0 in the grid; scores are unweighted means.")
        return ToolResult(self.name, "ok", f"Hazard screening profile for {d['district']}, {d['state']}.",
                          facts=facts, entities=_ent(d), semantics=self.semantics,
                          provenance=[ctx.store.provenance("hex_props", "hex scores", note="district aggregation cached")],
                          limitations=lim)


class RankDistricts(Tool):
    name = "rank_districts"
    description = ("Rank districts by a hazard screening index or population (descending by default), nationally or within one state.")
    parameters = {"type": "object", "properties": {
        "metric": {"type": "string", "enum": list(HAZARD_FIELDS) + ["population"]},
        "state": {"type": "string"}, "top_n": {"type": "integer", "minimum": 1, "maximum": 10},
        "order": {"type": "string", "enum": ["desc", "asc"]}},
        "required": ["metric"], "additionalProperties": False}
    semantics = {"data_class": "screening_index", "temporal_class": "current_release", "is_probability": False,
                 "spatial": "district, population-weighted mean of H3 res-5 hexes", "coverage": "India"}

    def run(self, args, ctx):
        cache = ctx.store.cache()["districts"]
        metric, top_n, order = args["metric"], args.get("top_n", 5), args.get("order", "desc")
        st = None
        if args.get("state"):
            g = ctx.store.gazetteer()
            st = g["state_norm"].get(norm(args["state"]))
            if st is None:
                return _fail(self.name, "not_found", f"State '{args['state']}' is not in the dataset.",
                             semantics=self.semantics)
        rows = []
        for v in cache.values():
            if st and v["state"] != st:
                continue
            val = v["population"] if metric == "population" else v["hazards"].get(metric)
            if val is not None:
                rows.append((val, v))
        rows.sort(key=lambda t: (t[0], t[1]["district"]), reverse=(order == "desc"))
        rows = rows[:top_n]
        unit = "people" if metric == "population" else "index_0_10"
        facts = []
        for i, (val, v) in enumerate(rows, 1):
            facts.append(Fact(f"rank{i}", f"#{i} {v['district']}, {v['state']}",
                              val, unit, 0 if metric == "population" else 2,
                              "" if metric == "population" else "0-10 screening index"))
        lim = list(SCREENING_LIMITS) if metric != "population" else [
            "Population is the grid's distributed Census-2011-based estimate, not a current census."]
        return ToolResult(self.name, "ok",
                          f"Top {len(rows)} districts by {HAZ_LABEL.get(metric, metric)}"
                          + (f" in {st}" if st else " in India") + f" ({order}).",
                          facts=facts, entities=({"state": st} if st else {}),
                          data={"metric": metric, "order": order,
                                "rows": [{"district": v["district"], "state": v["state"], "value": val}
                                         for val, v in rows]},
                          semantics=self.semantics,
                          provenance=[ctx.store.provenance("hex_props", "hex scores")], limitations=lim)


class ForecastSummary(Tool):
    name = "forecast_summary"
    description = ("Weather-forecast screening index (0-10) for a district for the 7 days in the stored forecast file, with its "
                   "issue time and validity. Reports whether the forecast is current or an expired archive.")
    parameters = {"type": "object", "properties": {"district": {"type": "string"}, "state": {"type": "string"}},
                  "required": ["district"], "additionalProperties": False}
    semantics = {"data_class": "weather_forecast_screening_index", "temporal_class": "forecast",
                 "is_probability": False, "spatial": "district, population-weighted mean of H3 res-5 hexes",
                 "coverage": "India", "origin": "forecast weather fed through the rule-based scoring"}

    def run(self, args, ctx):
        key, early = _district_or_result(ctx, self.name, args, self.semantics)
        if early:
            return early
        c = ctx.store.cache()
        d = c["districts"][key]
        meta = c["forecast_meta"]
        issued = datetime.fromisoformat(meta["generated_at"])
        if issued.tzinfo is None:
            issued = issued.replace(tzinfo=timezone.utc)
        now = ctx.now if ctx.now.tzinfo else ctx.now.replace(tzinfo=timezone.utc)
        valid_from, valid_to = meta["days"][0], meta["days"][-1]
        age_h = (now - issued).total_seconds() / 3600.0
        if now.date().isoformat() > valid_to:
            fstatus = "expired"
        elif age_h > ctx.cfg["forecast"]["stale_after_hours"]:
            fstatus = "stale"
        else:
            fstatus = "current"
        facts = [Fact("issued_at", "Forecast issued", meta["generated_at"]),
                 Fact("valid_from", "Valid from", valid_from), Fact("valid_to", "Valid to", valid_to),
                 Fact("forecast_status", "Forecast status relative to the current date", fstatus),
                 Fact("days_since_issue", "Age of the forecast", round(age_h / 24, 1), "days", 1)]
        for i, (day, val) in enumerate(zip(meta["days"], d["forecast_risk_by_day"]), 1):
            if val is not None:
                facts.append(Fact(f"risk_{day}", f"Forecast screening index for {day}", val, "index_0_10", 2,
                                  "0-10 weather-forecast screening index"))
        vals = [v for v in d["forecast_risk_by_day"] if v is not None]
        if vals:
            facts.append(Fact("peak_index", "Highest daily forecast index", max(vals), "index_0_10", 2))
        doms = [x for x in d["forecast_dominant_by_day"] if x]
        if doms:
            facts.append(Fact("dominant_forecast_hazard", "Most frequent dominant hazard in the forecast",
                              max(set(doms), key=doms.count)))
        lim = ["Forecast screening index (0-10), not a probability of an event.",
               "Weather inputs are sampled coarsely and copied to nearby hexes; it does not resolve villages."]
        if fstatus != "current":
            lim.insert(0, f"This forecast was issued {meta['generated_at'][:10]} and was valid {valid_from} to {valid_to}; "
                          f"it is an {'expired archive' if fstatus == 'expired' else 'aging forecast'}, "
                          "not current guidance.")
        return ToolResult(self.name, "ok" if fstatus == "current" else "stale",
                          f"Forecast for {d['district']}, {d['state']} (status: {fstatus}).",
                          facts=facts, entities=_ent(d), semantics={**self.semantics, "forecast_status": fstatus},
                          provenance=[ctx.store.provenance("forecast", "forecast file",
                                                           generated_at=meta["generated_at"])],
                          limitations=lim)


def _raj_key(ctx, args):
    name = args.get("district", "")
    r = ctx.store.resolve(name, "Rajasthan")
    if r["status"] != "ok":
        return None, r
    return r["matches"][0], r


class MonsoonIndicators(Tool):
    name = "monsoon_indicators"
    description = ("Whole-monsoon-season (June-September, JJAS) rainfall for a Rajasthan district and year, 2000-2023: seasonal total, "
                   "longest dry spell, concentration (PCI), July-August share, provisional onset proxy. Use this for 'monsoon', "
                   "'June-September' or 'seasonal' rainfall and dry spells. Needs only district and year. Rajasthan only.")
    parameters = {"type": "object", "properties": {
        "district": {"type": "string"}, "year": {"type": "integer", "minimum": 2000, "maximum": 2023}},
        "required": ["district"], "additionalProperties": False}
    semantics = {"data_class": "satellite_gauge_estimate", "temporal_class": "historical", "is_probability": False,
                 "spatial": "district area-weighted mean of CHIRPS 0.25 degree cells", "coverage": RAJ_COVERAGE,
                 "origin": "CHIRPS v2.0 satellite-gauge rainfall estimate (not station observation)"}

    def run(self, args, ctx):
        s = self.semantics
        r = ctx.store.resolve(args.get("district"), None)
        cache = ctx.store.cache()["districts"]
        if r["status"] == "not_found":
            return _fail(self.name, "not_found", f"District '{args.get('district')}' was not found.", semantics=s)
        raj = [k for k in r["matches"] if cache[k]["state"] == "Rajasthan"]
        if not raj:
            d0 = cache[r["matches"][0]]
            return _fail(self.name, "unsupported",
                         f"Monsoon indicators are available for {RAJ_COVERAGE}; {d0['district']} is in {d0['state']}.",
                         entities=_ent(d0), semantics=s, limitations=[f"Coverage: {RAJ_COVERAGE}."])
        d = cache[raj[0]]
        name = d["district"]
        desc = next((x for x in ctx.store.csv_rows("monsoon_desc") if x["district"] == name), None)
        facts, lim = [], [
            "CHIRPS is a satellite-gauge rainfall estimate on a 0.25 degree grid averaged over the district area; it is not a station observation.",
            "Only 24 years (2000-2023): variability statistics carry large sampling error.",
            "The onset proxy is a rainfall-only rule and is NOT the IMD monsoon-onset declaration.",
        ]
        year = args.get("year")
        if year is not None:
            row = next((x for x in ctx.store.csv_rows("monsoon_year")
                        if x["district"] == name and int(x["year"]) == year), None)
            if row is None or row["season_status"] != "complete":
                return _fail(self.name, "not_found", f"No complete JJAS record for {name} in {year}.",
                             entities=_ent(d), semantics=s, limitations=lim)

            def num(k):
                v = row.get(k, "")
                return float(v) if v not in ("", None) else None
            facts += [
                Fact("jjas_total_mm", f"JJAS rainfall total {year}", num("jjas_total_mm"), "mm", 1,
                     "Sum of daily district-mean rainfall, 1 Jun-30 Sep"),
                Fact("dry_spell_max_days", f"Longest dry spell in JJAS {year}", num("dry_spell_max_days"), "days", 0,
                     "Longest run of consecutive days with rainfall below 1.0 mm"),
                Fact("pci_jjas", f"Rainfall concentration index (JJAS monthly PCI) {year}", num("pci_jjas"), "", 1,
                     "Oliver PCI on four monthly totals: 25 = even, 100 = all rain in one month"),
                Fact("julaug_share_pct", f"July-August share of JJAS rainfall {year}", num("julaug_share_pct"), "percent", 1),
                Fact("onset_proxy_status", f"Provisional onset-proxy status {year}", row["onset_proxy_status"]),
            ]
            if row["onset_proxy_date"]:
                facts.append(Fact("onset_proxy_date", f"Provisional onset-proxy date {year}", row["onset_proxy_date"],
                                  "", None, "First 3-day window with >=20 mm followed by no 7-day dry spell in 20 days"))
            if row.get("ref_n_prior_years") not in ("", None):
                facts.append(Fact("jjas_total_pct_of_ref_mean", f"JJAS total {year} as % of the mean of prior years",
                                  num("jjas_total_pct_of_ref_mean"), "percent", 1,
                                  f"Reference: {row['ref_n_prior_years']} prior years only"))
                facts.append(Fact("jjas_total_z", f"JJAS total {year} z-score vs prior years", num("jjas_total_z"), "", 2))
            else:
                lim.append("No anomaly reference: fewer than 10 prior years are available before 2010.")
        if desc:
            facts += [
                Fact("jjas_mean_mm", "Mean JJAS rainfall 2000-2023", float(desc["jjas_mean_mm"]), "mm", 1),
                Fact("jjas_cv", "Interannual CV of JJAS rainfall 2000-2023 (descriptive)", float(desc["jjas_cv"]), "", 2,
                     "Sample SD / mean over 24 years"),
            ]
        return ToolResult(self.name, "ok", f"JJAS rainfall indicators for {name}, Rajasthan.",
                          facts=facts, entities={**_ent(d), **({"year": year} if year else {})}, semantics=s,
                          provenance=[ctx.store.provenance("monsoon_year", "district-year indicators", period="2000-2023"),
                                      ctx.store.provenance("monsoon_desc", "descriptive statistics", period="2000-2023")],
                          limitations=lim)


class RainfallFeatures(Tool):
    name = "rainfall_features"
    description = ("Rainfall for ONE named calendar month (June, July, August or September) in a Rajasthan district and year, 2000-2023: "
                   "monthly total, wettest 1-day and 3-day amounts, days >= 50 mm. Use only when the user asks about a specific month; "
                   "needs district, year and month. Rajasthan only.")
    parameters = {"type": "object", "properties": {
        "district": {"type": "string"}, "year": {"type": "integer", "minimum": 2000, "maximum": 2023},
        "month": {"type": "integer", "minimum": 6, "maximum": 9}},
        "required": ["district", "year", "month"], "additionalProperties": False}
    semantics = {"data_class": "satellite_gauge_estimate", "temporal_class": "historical", "is_probability": False,
                 "spatial": "district area-weighted mean of CHIRPS 0.25 degree cells", "coverage": RAJ_COVERAGE,
                 "origin": "CHIRPS v2.0 satellite-gauge rainfall estimate (not station observation)"}

    def run(self, args, ctx):
        s = self.semantics
        r = ctx.store.resolve(args.get("district"), None)
        cache = ctx.store.cache()["districts"]
        if r["status"] == "not_found":
            return _fail(self.name, "not_found", f"District '{args.get('district')}' was not found.", semantics=s)
        raj = [k for k in r["matches"] if cache[k]["state"] == "Rajasthan"]
        if not raj:
            d0 = cache[r["matches"][0]]
            return _fail(self.name, "unsupported",
                         f"Rainfall features are available for {RAJ_COVERAGE}; {d0['district']} is in {d0['state']}.",
                         entities=_ent(d0), semantics=s, limitations=[f"Coverage: {RAJ_COVERAGE}."])
        d = cache[raj[0]]
        y, m = args["year"], args["month"]
        lab = next((x for x in ctx.store.csv_rows("flood_labels")
                    if x["district_name"] == d["district"] and int(x["year"]) == y and int(x["month"]) == m), None)
        feat = None
        if lab:
            feat = next((x for x in ctx.store.csv_rows("flood_features")
                         if x["district_month_id"] == lab["district_month_id"]), None)
        if not feat or feat["chirps_status"] != "ok":
            return _fail(self.name, "not_found", f"No complete rainfall features for {d['district']} {y}-{m:02d}.",
                         entities=_ent(d), semantics=s)

        def n(k):
            return float(feat[k])
        facts = [
            Fact("rain_month_total_mm", f"Rainfall total {y}-{m:02d}", n("rain_month_total_mm"), "mm", 1),
            Fact("rain_month_max_1d_mm", f"Wettest single day {y}-{m:02d}", n("rain_month_max_1d_mm"), "mm", 1),
            Fact("rain_month_max_3d_mm", f"Wettest 3 consecutive days {y}-{m:02d}", n("rain_month_max_3d_mm"), "mm", 1),
            Fact("rain_month_days_ge_50mm", f"Days with at least 50 mm {y}-{m:02d}", n("rain_month_days_ge_50mm"), "days", 0),
            Fact("antecedent_30d_mm", f"Rainfall in the 30 days before {y}-{m:02d}", n("antecedent_30d_mm"), "mm", 1),
        ]
        return ToolResult(self.name, "ok", f"Monthly rainfall features for {d['district']}, Rajasthan, {y}-{m:02d}.",
                          facts=facts, entities={**_ent(d), "year": y, "month": m}, semantics=s,
                          provenance=[ctx.store.provenance("flood_features", "CHIRPS-derived features", period="2000-2023")],
                          limitations=["Satellite-gauge estimate at 0.25 degree averaged over the district; not a station observation.",
                                       "Month features describe rainfall within the month and are retrospective, not forecasts."])


class ReportedFloodMonths(Tool):
    name = "reported_flood_months"
    description = ("Which months a flood was REPORTED in a Rajasthan district, from the India Flood Inventory (June-September, 2000-2023). "
                   "Use for 'were floods reported', 'flood history', 'flood events' questions. Needs only district; year_from/year_to "
                   "optional. Absence of a record is not evidence that no flood occurred.")
    parameters = {"type": "object", "properties": {
        "district": {"type": "string"},
        "year_from": {"type": "integer", "minimum": 2000, "maximum": 2023},
        "year_to": {"type": "integer", "minimum": 2000, "maximum": 2023}},
        "required": ["district"], "additionalProperties": False}
    semantics = {"data_class": "reported_event_records", "temporal_class": "historical", "is_probability": False,
                 "spatial": "district (33 historical Rajasthan districts)", "coverage": RAJ_COVERAGE,
                 "origin": "IMD-compiled flood event reports (IFI v3); not measured inundation"}

    def run(self, args, ctx):
        s = self.semantics
        r = ctx.store.resolve(args.get("district"), None)
        cache = ctx.store.cache()["districts"]
        if r["status"] == "not_found":
            return _fail(self.name, "not_found", f"District '{args.get('district')}' was not found.", semantics=s)
        raj = [k for k in r["matches"] if cache[k]["state"] == "Rajasthan"]
        if not raj:
            d0 = cache[r["matches"][0]]
            return _fail(self.name, "unsupported",
                         f"Reported-flood records are available for {RAJ_COVERAGE}; {d0['district']} is in {d0['state']}.",
                         entities=_ent(d0), semantics=s, limitations=[f"Coverage: {RAJ_COVERAGE}."])
        d = cache[raj[0]]
        y0, y1 = args.get("year_from", 2000), args.get("year_to", 2023)
        if y0 > y1:
            return _fail(self.name, "error", "year_from is after year_to.", semantics=s)
        rows = [x for x in ctx.store.csv_rows("flood_labels")
                if x["district_name"] == d["district"] and y0 <= int(x["year"]) <= y1]
        pos = sorted((int(x["year"]), int(x["month"])) for x in rows if x["label_status"] == "reported_positive")
        excluded = sum(1 for x in rows if x["label_status"] == "excluded")
        months = ", ".join(f"{y}-{m:02d}" for y, m in pos) or "none"
        facts = [
            Fact("n_reported_months", f"Months with a reported flood event, {y0}-{y1}", len(pos), "count", 0,
                 "District-months (June-September) with at least one IFI record starting in the month"),
            Fact("n_months_assessed", "June-September months in the period", len(rows) - excluded, "count", 0),
            Fact("reported_months", "Months with a reported event", months),
        ]
        trust = {x["label_trust"] for x in rows if x["label_status"] == "reported_positive"}
        lim = ["Reported records only: a month without a record is NOT confirmed to have had no flood.",
               "Reporting changed markedly in 2021-2023, so counts across years are not comparable.",
               "District matching is provisional (verified against an unofficial LGD mirror only)."]
        if "provisional" in trust:
            lim.append("These positives carry label_trust = provisional.")
        return ToolResult(self.name, "ok", f"Reported flood months for {d['district']}, Rajasthan, {y0}-{y1}.",
                          facts=facts, entities={**_ent(d), "year_from": y0, "year_to": y1}, semantics=s,
                          data={"months": [f"{y}-{m:02d}" for y, m in pos]},
                          provenance=[ctx.store.provenance("flood_labels", "district-month labels",
                                                           source="IFI-Impacts v3 (IIT Delhi)")],
                          limitations=lim)


class HistoricalClimate(Tool):
    name = "historical_climate"
    description = ("Long-term climate context 1940-2024 from ERA5 REANALYSIS averaged over a district's hexes: mean annual rainfall, "
                   "rainfall trend, annual rainfall variability (CV), mean temperature and warming trend. Not station observations.")
    parameters = {"type": "object", "properties": {"district": {"type": "string"}, "state": {"type": "string"}},
                  "required": ["district"], "additionalProperties": False}
    semantics = {"data_class": "reanalysis", "temporal_class": "historical", "is_probability": False,
                 "spatial": "ERA5 ~0.25 degree cell nearest each hex centroid, averaged over the district's hexes",
                 "coverage": "India", "origin": "ERA5 monthly-mean reanalysis (Copernicus/ECMWF)"}

    def run(self, args, ctx):
        key, early = _district_or_result(ctx, self.name, args, self.semantics)
        if early:
            return early
        d = ctx.store.cache()["districts"][key]
        h = d["hist"]
        if h.get("rainfall_mean_mm") is None:
            return _fail(self.name, "not_found", f"No historical climate data for {d['district']}.",
                         entities=_ent(d), semantics=self.semantics)
        facts = [
            Fact("rainfall_mean_mm", "Mean annual rainfall 1940-2024 (ERA5)", h["rainfall_mean_mm"], "mm/yr", 0),
            Fact("rainfall_trend_mm_decade", "Linear rainfall trend 1940-2024", h["rainfall_trend_mm_decade"], "mm/decade", 1),
            Fact("rainfall_cv", "Year-to-year variability of ANNUAL rainfall (CV, 1940-2024)", h["rainfall_cv"], "", 2,
                 "Standard deviation / mean of calendar-year totals; not a monsoon-season measure"),
            Fact("temp_mean_c", "Mean annual temperature 1940-2024 (ERA5)", h["temp_mean_c"], "degC", 1),
            Fact("temp_trend_c_decade", "Linear temperature trend 1940-2024", h["temp_trend_c_decade"], "degC/decade", 2),
        ]
        return ToolResult(self.name, "ok", f"ERA5 historical climate summary for {d['district']}, {d['state']}.",
                          facts=facts, entities=_ent(d), semantics=self.semantics,
                          provenance=[ctx.store.provenance("hist_climate", "ERA5 per-hex summaries", period="1940-2024")],
                          limitations=[
                              "ERA5 is a reanalysis (model-based), not station observation; values before 1979 are less constrained.",
                              "About three neighbouring hexes share one ERA5 cell, so spatial detail is ~0.25 degree.",
                              "Trends are simple linear fits without significance testing.",
                              "The variability measure uses calendar-year totals, includes trend, and is higher in drier areas; "
                              "it is not June-September monsoon reliability."])


class WashContext(Tool):
    name = "wash_context"
    description = ("District-level WASH and health survey context: NFHS-5 (2019-21) water, sanitation, stunting, diarrhoea, anaemia and the "
                   "JJM household tap-connection percentage. Survey/administrative values, not hazard results.")
    parameters = {"type": "object", "properties": {"district": {"type": "string"}, "state": {"type": "string"}},
                  "required": ["district"], "additionalProperties": False}
    semantics = {"data_class": "survey", "temporal_class": "historical", "is_probability": False,
                 "spatial": "district (NFHS-5 district estimates)", "coverage": "India",
                 "origin": "NFHS-5 household survey (2019-21) and JJM IMIS snapshot"}

    def run(self, args, ctx):
        key, early = _district_or_result(ctx, self.name, args, self.semantics)
        if early:
            return early
        d = ctx.store.cache()["districts"][key]
        w = d["wash"]
        spec = [("wash_water_pct", "Households with improved drinking water (NFHS-5)"),
                ("wash_sanitation_pct", "Households with improved sanitation (NFHS-5)"),
                ("wash_stunting_pct", "Children under 5 stunted (NFHS-5)"),
                ("wash_diarrhoea_pct", "Children under 5 with diarrhoea in the previous 2 weeks (NFHS-5)"),
                ("wash_anaemia_pct", "Women with anaemia (NFHS-5)"),
                ("jjm_fhtc_pct", "Households with a functional tap connection (JJM snapshot)")]
        facts = []
        for k, label in spec:
            if w.get(k) is not None:
                if k == "wash_diarrhoea_pct" and d.get("diarrhoea_zero_coded"):
                    continue
                facts.append(Fact(k, label, w[k], "percent", 1))
        if not facts:
            return _fail(self.name, "not_found", f"No WASH survey values for {d['district']}.",
                         entities=_ent(d), semantics=self.semantics)
        lim = ["Survey estimates have sampling error and are from different vintages (NFHS-5 2019-21; JJM snapshot July 2026).",
               "District boundaries follow the older frame; districts created after 2011 may carry parent-district values."]
        if d.get("diarrhoea_zero_coded"):
            lim.append("Diarrhoea prevalence is zero-coded (missing) for this district and is withheld.")
        return ToolResult(self.name, "ok", f"WASH and health context for {d['district']}, {d['state']}.",
                          facts=facts, entities=_ent(d), semantics=self.semantics,
                          provenance=[ctx.store.provenance("hex_props", "NFHS-5 / JJM fields")], limitations=lim)


class MethodNotes(Tool):
    name = "method_notes"
    description = ("Retrieve quoted passages from the project's methodology and research documents to explain how an indicator or "
                   "dataset is defined, its limitations, or why something is unsupported.")
    parameters = {"type": "object", "properties": {"topic": {"type": "string", "description": "short topic or question"}},
                  "required": ["topic"], "additionalProperties": False}
    semantics = {"data_class": "documentation", "temporal_class": "static", "is_probability": False,
                 "spatial": "n/a", "coverage": "project documents"}
    _STOP = set("the a an of and or to in on for with is are was were what how why does do did about this that it its by from as at be".split())
    _index: list | None = None

    def _build(self, ctx):
        idx = []
        for p in ctx.cfg["doc_sources"]:
            if not Path(p).exists():
                continue
            from ..config import check_readable
            text = check_readable(p).read_text(encoding="utf-8")
            line_no, para, start = 0, [], 1
            for line in text.split("\n") + [""]:
                line_no += 1
                if line.strip():
                    if not para:
                        start = line_no
                    para.append(line.strip())
                elif para:
                    t = " ".join(para)
                    if len(t) >= 60:
                        idx.append({"file": str(Path(p).relative_to(ctx.cfg["_root"].parents[1])), "line": start,
                                    "text": t})
                    para = []
        return idx

    def run(self, args, ctx):
        if MethodNotes._index is None:
            MethodNotes._index = self._build(ctx)
        toks = {t for t in re.findall(r"[a-z0-9]{3,}", args["topic"].lower()) if t not in self._STOP}
        scored = []
        for e in MethodNotes._index:
            words = re.findall(r"[a-z0-9]{3,}", e["text"].lower())
            hit = sum(1 for t in toks if t in words)
            if hit:
                scored.append((hit / (len(toks) or 1) + min(len(words), 120) / 5000.0, e))
        scored.sort(key=lambda t: (-t[0], t[1]["file"], t[1]["line"]))
        top = [e for _, e in scored[:2]]
        if not top:
            return _fail(self.name, "not_found", "No matching passage in the project documents.",
                         semantics=self.semantics)
        data = [{"file": e["file"], "line": e["line"], "text": e["text"][:520]} for e in top]
        return ToolResult(self.name, "ok", "Passages from project documents.",
                          facts=[Fact(f"passage{i}", f"{e['file']}:{e['line']}", e["text"][:520])
                                 for i, e in enumerate(top, 1)],
                          data={"passages": data}, semantics=self.semantics,
                          provenance=[{"file": e["file"], "line": e["line"], "role": "documentation"} for e in top],
                          limitations=["Quoted passages describe the project's own documentation, not external literature."])


class MapLink(Tool):
    name = "map_link"
    description = "Return a link to an existing ClimResWASH page (map, forecast, report, insights) focused on a district. Navigation only."
    parameters = {"type": "object", "properties": {
        "view": {"type": "string", "enum": ["grid", "forecast", "report", "insights", "methodology"]},
        "district": {"type": "string"}, "state": {"type": "string"}},
        "required": ["view"], "additionalProperties": False}
    semantics = {"data_class": "navigation", "temporal_class": "static", "is_probability": False, "spatial": "n/a",
                 "coverage": "existing application routes"}

    def run(self, args, ctx):
        view = args["view"]
        d = None
        if args.get("district"):
            key, early = _district_or_result(ctx, self.name, args, self.semantics)
            if early:
                return early
            d = ctx.store.cache()["districts"][key]
        if view == "grid":
            q = {}
            if d:
                q = {"state": d["state"], "district": d["district"]}
            url = "/grid" + ("?" + urllib.parse.urlencode(q) if q else "")
        elif view == "report":
            if not d:
                return _fail(self.name, "error", "A report link needs a district.", semantics=self.semantics)
            url = "/report/" + urllib.parse.quote(d["district"])
        else:
            url = {"forecast": "/forecast", "insights": "/insights", "methodology": "/methodology"}[view]
        return ToolResult(self.name, "ok", f"Link: {url}", facts=[Fact("url", "Application link", url)],
                          entities=(_ent(d) if d else {}), data={"url": url}, semantics=self.semantics,
                          provenance=[{"file": "client/src/App.tsx", "role": "route table"}],
                          limitations=["Opens an existing page; it performs no calculation."])


class DescribeCapabilities(Tool):
    name = "describe_capabilities"
    description = ("Describe what this assistant can and cannot analyse: the available tools, their data, coverage and period. "
                   "Use for 'what can you do' or 'what data do you have' questions.")
    parameters = {"type": "object", "properties": {}, "required": [], "additionalProperties": False}
    semantics = {"data_class": "documentation", "temporal_class": "static", "is_probability": False,
                 "spatial": "n/a", "coverage": "this assistant"}

    def run(self, args, ctx):
        facts = []
        for cls in ALL_TOOLS:
            if cls.name in ("describe_capabilities", "ask_clarification", "declare_unsupported"):
                continue
            cov = cls.semantics.get("coverage", "")
            facts.append(Fact(cls.name, cls.name, f"{cls.description} Coverage: {cov}."))
        return ToolResult(self.name, "ok", "Available analyses.", facts=facts, semantics=self.semantics,
                          limitations=["Read-only analysis of existing ClimResWASH datasets; no future predictions, "
                                       "no causal attribution, nothing below district resolution."])


# ---- control tools: the MODEL decides to call them; they end the turn ------------
class AskClarification(Tool):
    name = "ask_clarification"
    description = "Ask the user one short question when the request is ambiguous or a required detail (district, state, year) is missing."
    parameters = {"type": "object", "properties": {"question": {"type": "string", "maxLength": 300}},
                  "required": ["question"], "additionalProperties": False}
    semantics = {"data_class": "control", "temporal_class": "static", "is_probability": False}

    def run(self, args, ctx):
        return ToolResult(self.name, "control", args["question"], semantics=self.semantics,
                          data={"question": args["question"]})


class DeclareUnsupported(Tool):
    name = "declare_unsupported"
    description = ("Use when the request needs something the tools cannot supply: future flood/heat/drought probabilities or predictions, "
                   "causal attribution, village/household/facility-level results, losses or damages, or places/periods outside coverage.")
    parameters = {"type": "object", "properties": {
        "reason": {"type": "string", "maxLength": 300},
        "nearest_supported": {"type": "string", "maxLength": 300, "description": "the closest supported analysis"}},
        "required": ["reason"], "additionalProperties": False}
    semantics = {"data_class": "control", "temporal_class": "static", "is_probability": False}

    def run(self, args, ctx):
        return ToolResult(self.name, "control", args["reason"], semantics=self.semantics,
                          data={"reason": args["reason"], "nearest_supported": args.get("nearest_supported", "")})


ALL_TOOLS = [ResolvePlace, DistrictHazardProfile, RankDistricts, ForecastSummary, MonsoonIndicators, RainfallFeatures,
             ReportedFloodMonths, HistoricalClimate, WashContext, MethodNotes, MapLink, DescribeCapabilities,
             AskClarification, DeclareUnsupported]
