"""Scientific verification of a draft answer against the turn's tool evidence.

This goes beyond number matching. A draft is checked for:
  numbers      every figure exists in the evidence (value, rounding)
  units        the unit written next to a number matches the unit of the fact
               that carries that value (mm vs days vs % vs index)
  dates        ISO dates appear in the evidence
  places       districts/states named are the ones the tools resolved;
               same-name districts in different states are not conflated
  data class   observation vs reanalysis/satellite estimate vs screening index
               vs forecast vs survey vs reported-event records
  index/prob   risk indices are never called probabilities or percentages
  time         forecasts: validity and staleness stated, no "today/now" if stale;
               no future/predictive claims without a projection tool
  causation    no causal attribution
  resolution   no village/household/facility-level claims
  coverage     Rajasthan-only tools are not generalised to India
  naming       CV is not called monsoon reliability; the onset proxy is
               labelled provisional/proxy and is not presented as IMD's onset

These rules are a safety net around the model's prose; they do not choose tools.
On failure the orchestrator returns verified tool results instead of the prose.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..data_access import norm

FACT_TAG = re.compile(r"[\[(]\s*(F\d+(?:\s*[,;]\s*F\d+)*)\s*[\])]")
DATE = re.compile(r"\b\d{4}-\d{2}(?:-\d{2})?(?:T[\d:.+\-]+)?\b")
NUMBER = re.compile(r"(?<![\w.])(?<![A-Za-z]-)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?")
MONTHS = {m: i for i, m in enumerate(
    "january february march april may june july august september october november december".split(), 1)}
MONTH_YEAR = re.compile(r"\b(" + "|".join(MONTHS) + r")\s+(\d{4})\b", re.I)
SCALE = re.compile(r"^\s*(million|lakh|crore|thousand)\b", re.I)
SCALE_MULT = {"million": 1e6, "lakh": 1e5, "crore": 1e7, "thousand": 1e3}
ON_DATE = re.compile(
    r"^[^.;\n]{0,28}?\b(?:on|for|at)\s+(?:(\d{4}-\d{2}-\d{2})|(" + "|".join(MONTHS) + r")\s+(\d{1,2})(?:st|nd|rd|th)?)\b", re.I)
LIST_MARK = re.compile(r"(?m)^\s*\d{1,2}[.)]\s")
SENT = re.compile(r"(?<=[.!?])\s+|\n+")

UNIT_TOKENS = [
    (r"°\s?C\s*(?:/|per)\s*decade|degrees?\s*C(?:elsius)?\s*per\s*decade", "degC/decade"),
    (r"mm\s*/\s*decade|mm\s*per\s*decade", "mm/decade"),
    (r"mm\s*per\s*year|mm\s*/\s*yr|mm\s*/\s*year", "mm/yr"),
    (r"°\s?C|degrees?\s*(?:C\b|Celsius)", "degC"),
    (r"millimet(?:re|er)s?|mm\b", "mm"),
    (r"%|percent(?:age points?)?|per\s*cent", "percent"),
    (r"days?\b", "days"),
    (r"years?\b|yrs?\b", "year"),
    (r"people|persons|inhabitants|residents", "people"),
    (r"hexes|hexagons|districts?|months?", "count"),
    (r"out\s+of\s+10|/\s*10\b|index\b", "index_0_10"),
    (r"km2|km²|km\b|kilomet(?:re|er)s?", "km"),
]
UNIT_RX = [(re.compile(r"^\s*(?:" + p + ")", re.I), cls) for p, cls in UNIT_TOKENS]
ACCEPT = {  # fact unit -> token classes that are an honest rendering of it
    "mm": {"mm"}, "mm/yr": {"mm", "mm/yr"}, "percent": {"percent"}, "days": {"days"}, "degC": {"degC"},
    "mm/decade": {"mm/decade"}, "degC/decade": {"degC/decade"}, "index_0_10": {"index_0_10"},
    "": set(), "people": {"people"}, "count": {"count", "days", "year"}, "year": {"year"}, "pct_points": {"percent"},
}

PROB = re.compile(r"\b(probabilit\w*|chances?\b|likelihood|odds\b|percent chance|per cent chance)", re.I)
PRED = re.compile(
    r"\b(will\s+(?:\w+\s+)?(?:flood|be\s+flooded|occur|experience|face|see|get|receive|suffer|rise|increase|"
    r"worsen|bring|be\s+hit)|is\s+(?:expected|projected|predicted|likely|set|forecast(?:ed)?)\s+to|"
    r"are\s+(?:expected|projected|predicted|likely)\s+to|going\s+to\s+\w+|"
    r"(?:in|by|until|through)\s+(?:20[3-9]\d|21\d\d)|next\s+(?:year|decade|monsoon|season|summer)|"
    r"in\s+the\s+(?:future|coming\s+(?:years|decades|months))|future\s+(?:flood|drought|heat|risk))", re.I)
CAUSAL = re.compile(
    r"\b(caused?|causes|causing|because|due\s+to|owing\s+to|as\s+a\s+result\s+of|resulted?\s+in|led\s+to|"
    r"leads?\s+to|responsible\s+for|attributable|driven\s+by|triggered|climate\s+change\s+(?:is|has|will|caused))",
    re.I)
OBSERVED = re.compile(r"\b(observed|measured|recorded|gauged|actually|real\s+(?:rain|temperature))", re.I)
QUALIFIER = re.compile(r"(reanalysis|ERA5|CHIRPS|estimate|satellite|modelled|model-based|gauge[- ]blend|derived)", re.I)
RESOLUTION = re.compile(
    r"\b(villages?|hamlets?|households?|streets?|neighbou?rhoods?|pixels?|buildings?|schools?|"
    r"health\s+facilit\w+|wards?|blocks?|tehsils?|talukas?)\b", re.I)
NEG_STRICT = re.compile(r"\b(not|no|cannot|can't|never|without|neither|nor|isn't|aren't|doesn't|don't|wasn't|n't)\b", re.I)
NEGATION = re.compile(r"\b(not|no|cannot|can't|unavailable|only|never|without|n't|neither|nor)\b", re.I)
DEICTIC = re.compile(r"\b(today|tomorrow|tonight|right\s+now|currently|this\s+week|at\s+present|now)\b", re.I)
STALE_MARK = re.compile(r"\b(expired|stale|archive[d]?|no\s+longer\s+current|not\s+current|outdated)\b", re.I)
NOFLOOD = re.compile(r"\b(no\s+floods?\s+(?:occurred|happened|were|was|in|during)|did\s+not\s+flood|"
                     r"never\s+flooded|flood[- ]free|was\s+not\s+flooded|without\s+(?:any\s+)?floods?)", re.I)
INDIA_WIDE = re.compile(r"\b(across\s+india|nationwide|all\s+of\s+india|whole\s+country|entire\s+country|"
                        r"india[- ]wide|every\s+state)\b", re.I)
GROUND_TERMS = re.compile(
    r"\b(flood\w*|drought\w*|heat\w*|rain\w*|monsoon\w*|cyclone\w*|risk\w*|temperature\w*|climat\w*|"
    r"sanitation|diarrh\w*|forecast\w*|wet-?bulb|stunt\w*|anaemi\w*|landslide\w*|hazard\w*|vulnerab\w*)\b", re.I)
INDICATOR_LEX = re.compile(
    r"(?P<flashflood>flash[\s-]?flood)|(?P<flood>pluvial|flood|inundation)|(?P<wetbulb>wet[\s-]?bulb|humid\s+heat)|"
    r"(?P<coldwave>cold[\s-]?wave)|(?P<heat>dry\s+heat|heat[\s-]?wave|\bheat\b)|(?P<drought>drought)|(?P<cyclone>cyclone)|"
    r"(?P<landslide>landslide)|(?P<sealevel>sea[\s-]?level|coastal)|(?P<fire>vegetation\s+fire|wild[\s-]?fire|\bfire\b)|"
    r"(?P<pollution>pollution|PM\s?2\.?5|air\s+quality)|(?P<overall>overall|highest\s+channel)|"
    r"(?P<water>drinking\s+water|improved\s+water)|(?P<sanitation>sanitation|toilet)|(?P<stunting>stunt\w*)|"
    r"(?P<diarrhoea>diarrh\w+)|(?P<anaemia>an(?:a)?emi\w*)|(?P<tap>tap\s+connection|functional\s+tap|FHTC|\bJJM\b)|"
    r"(?P<dryspell>dry\s+spell)|(?P<wettest>wettest)|(?P<share>\bshare\b)|(?P<pci>\bPCI\b|concentration)|"
    r"(?P<warming>warming|temperature\s+trend)|(?P<population>population)", re.I)
_KEY_ALIAS = {"flood_risk": "flood", "heat_risk": "heat", "cyclone_risk": "cyclone", "drought_risk": "drought",
              "wetbulb_risk": "wetbulb", "landslide_risk": "landslide", "coldwave_risk": "coldwave",
              "flashflood_risk": "flashflood", "sealevel_risk": "sealevel", "fire_risk": "fire",
              "pollution_risk": "pollution", "hex_risk": "overall", "population": "population",
              "dry_spell_max_days": "dryspell", "rain_month_max_1d_mm": "wettest", "rain_month_max_3d_mm": "wettest",
              "julaug_share_pct": "share", "pci_jjas": "pci", "wash_water_pct": "water",
              "wash_sanitation_pct": "sanitation", "wash_stunting_pct": "stunting", "wash_diarrhoea_pct": "diarrhoea",
              "wash_anaemia_pct": "anaemia", "jjm_fhtc_pct": "tap", "temp_trend_c_decade": "warming"}


def _fact_indicators(f) -> set:
    if f.key in _KEY_ALIAS:
        return {_KEY_ALIAS[f.key]}
    if f.key.startswith(("risk_", "peak_index")):
        return set()
    return {m.lastgroup for m in INDICATOR_LEX.finditer(f.label or "")}


TOOLCALL_TEXT = re.compile(r"<\s*/?\s*tool_call\s*>|^\s*[\[{]\s*\"?(?:name|function)\"?\s*:|\"arguments\"\s*:", re.I | re.M)
USER_YEAR = re.compile(r"\b(20[0-2]\d)\b")
FUTURE_ASK = re.compile(r"\b(will|would|going\s+to|predict\w*|projected?|projection\w*|next\s+(?:year|decade|monsoon|season|summer)|"
                        r"in\s+the\s+future|by\s+(?:20[3-9]\d|21\d\d)|in\s+(?:20[3-9]\d|21\d\d)|(?:20[3-9]\d|21\d\d))\b", re.I)
DECLINES_FUTURE = re.compile(r"\b(cannot|can't|can not|unable|not\s+(?:able|available|provide|predict|a\s+prediction|supported)|"
                             r"no\s+(?:future|projection|prediction)|does\s+not\s+(?:predict|provide|give)|"
                             r"only\s+(?:historical|current|screening))", re.I)
DISTRICT_LEVEL = re.compile(r"(district[- ]level|at\s+the\s+district|district\s+resolution|per\s+district|districts?\b)", re.I)
RANGE = re.compile(r"(?<![\w.\-])(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)(?![\w.\-])")
IMD_ONSET = re.compile(r"\bIMD(?:'s|\s+declared|\s+official)?\b[^.]{0,30}\bonset|\bofficial\s+onset", re.I)


@dataclass
class Violation:
    rule: str
    detail: str


@dataclass
class VerificationReport:
    passed: bool
    violations: list[Violation] = field(default_factory=list)
    cited_fact_ids: list[str] = field(default_factory=list)
    checked: dict = field(default_factory=dict)
    warnings: list = field(default_factory=list)

    def to_dict(self):
        return {"passed": self.passed, "violations": [v.__dict__ for v in self.violations],
                "cited_fact_ids": self.cited_fact_ids, "checked": self.checked, "warnings": self.warnings}


def _decimals(frac: str | None) -> int:
    return len(frac) - 1 if frac else 0


def _numbers_in(text: str) -> list[float]:
    out = []
    for m in NUMBER.finditer(text or ""):
        try:
            out.append(float(m.group(1).replace(",", "") + (m.group(2) or "")))
        except ValueError:
            pass
    return out


def has_projection_tool(results) -> bool:
    return any(r.semantics.get("data_class") == "projection" for r in results)


class Verifier:
    def __init__(self, store):
        self.store = store
        cache = store.cache()["districts"]
        self.names = {}
        for k, v in cache.items():
            self.names.setdefault(norm(v["district"]), set()).add(v["state"])
        self.display = {norm(v["district"]): v["district"] for v in cache.values()}
        self.states = {norm(s): s for s in {v["state"] for v in cache.values()}}

    # -- evidence -------------------------------------------------------------
    @staticmethod
    def _universe(results, user_text: str):
        nums, strs = [], [user_text or ""]
        for r in results:
            strs += [r.summary] + r.limitations
            for f in r.facts:
                v = f.numeric()
                if v is not None:
                    nums.append((v, f))
                else:
                    strs.append(str(f.value))
                strs += [f.label, f.definition]
            for key in ("rows", "candidates", "passages"):
                if key in r.data:
                    strs.append(str(r.data[key]))
            strs.append(str(r.entities))
            strs += [str(x) for x in r.semantics.values() if isinstance(x, str)]
            strs += [str(p.get("period", "")) for p in r.provenance]
        str_nums = set()
        for s in strs:
            for x in _numbers_in(DATE.sub(" ", s)):
                str_nums.add(round(x, 6))
            for d in DATE.findall(s):  # components of dates in the evidence are citable (year, month)
                for part in re.findall(r"\d+", d[:10]):
                    str_nums.add(float(int(part)))
        return nums, strs, str_nums

    # -- main ---------------------------------------------------------------------
    def verify(self, answer: str, results, user_text: str, context_text: str = "",
               refusal: bool = False) -> VerificationReport:
        v: list[Violation] = []
        results = [r for r in results if r.status != "control"]
        survey = any(r.semantics.get("data_class") == "survey" for r in results)
        nums, strs, str_nums = self._universe(results, user_text + " " + context_text)
        big_text = " ".join(strs)
        fact_ids = {f.id for r in results for f in r.facts}

        cited = []
        for m in FACT_TAG.finditer(answer):
            for fid in re.split(r"\s*[,;]\s*", m.group(1)):
                cited.append(fid)
                if fid not in fact_ids:
                    v.append(Violation("unknown_fact_id", f"{fid} was not produced by any tool in this turn"))
        body = FACT_TAG.sub(" ", answer)

        # a stated scale or range ("0-100", "1 to 10") must itself be in the evidence, not invented from nearby numbers
        evidence_ranges = {(float(a), float(b)) for a, b in RANGE.findall(DATE.sub(" ", big_text))}
        for a, b in RANGE.findall(DATE.sub(" ", body)):
            if (float(a), float(b)) not in evidence_ranges and f"{a}-{b}" not in user_text:
                v.append(Violation("scale_not_in_evidence", f"the range {a}-{b} is not stated in any tool result"))

        # a cited fact must be one of the figures stated in the same sentence
        by_id = {f.id: f for r in results for f in r.facts}
        for s in SENT.split(answer):
            ids = [i for m in FACT_TAG.finditer(s) for i in re.split(r"\s*[,;]\s*", m.group(1))]
            figs = [(float(m.group(1).replace(",", "") + (m.group(2) or "")), _decimals(m.group(2)))
                    for m in NUMBER.finditer(DATE.sub(" ", FACT_TAG.sub(" ", s)))]
            if not ids or not figs:
                continue
            for i in ids:
                f = by_id.get(i)
                if f is None or f.numeric() is None:
                    continue
                if not any(abs(round(abs(f.numeric()), d) - n) < 1e-9 for n, d in figs):
                    v.append(Violation("citation_mismatch",
                                       f"[{i}] is '{f.label}' = {f.display()} but the sentence states "
                                       + ", ".join(str(n) for n, _ in figs[:4])))

        # dates must exist in the evidence
        for d in DATE.findall(body):
            if d not in big_text:
                v.append(Violation("date_not_in_evidence", d))
        for m in MONTH_YEAR.finditer(body):
            iso = f"{m.group(2)}-{MONTHS[m.group(1).lower()]:02d}"
            if iso not in big_text:
                v.append(Violation("date_not_in_evidence", f"{m.group(0)} ({iso}) is not in the evidence"))
        body_nodate = DATE.sub(" ", body)
        body_nolist = LIST_MARK.sub("", body_nodate)

        # numbers and units
        for m in NUMBER.finditer(body_nolist):
            raw = m.group(1).replace(",", "") + (m.group(2) or "")
            try:
                x = float(raw)
            except ValueError:
                continue
            d = _decimals(m.group(2))
            sc = SCALE.match(body_nolist[m.end():m.end() + 12])
            if sc:
                mult = SCALE_MULT[sc.group(1).lower()]
                cands = [f for val, f in nums if abs(abs(val) - x * mult) <= 0.5 * 10 ** (-d) * mult + 1e-9]
                in_text = False
                if not cands:
                    v.append(Violation("number_not_in_evidence",
                                       f"{m.group(0)} {sc.group(1)} is not supported by any tool result"))
                continue
            cands = [f for val, f in nums if abs(round(abs(val), d) - x) < 1e-9]
            in_text = round(x, 6) in str_nums
            if not cands and not in_text:
                v.append(Violation("number_not_in_evidence", f"{m.group(0)} is not supported by any tool result"))
                continue
            tail = body_nolist[m.end():m.end() + 40]
            cls = None
            for rx, c in UNIT_RX:
                if rx.match(tail):
                    cls = c
                    break
            if cls and cands and cls != "km":
                ok = any(cls in ACCEPT.get(f.unit, {cls}) for f in cands)
                if not ok and not in_text:
                    v.append(Violation(
                        "unit_mismatch",
                        f"{m.group(0)} is written with unit '{cls}' but the matching value(s) are in "
                        + ", ".join(sorted({f.unit or 'unitless' for f in cands}))))
            elif cls and not cands and in_text and cls in ("percent", "degC", "mm", "days") and not refusal:
                # a number that only appears in free text must not be re-labelled with a measurement unit
                # unless the free text itself attaches that unit
                pattern = re.compile(re.escape(m.group(0)) + r"\s*(?:" + "|".join(p for p, c in UNIT_TOKENS if c == cls) + ")", re.I)
                if not pattern.search(big_text):
                    v.append(Violation("unit_mismatch", f"{m.group(0)} appears in the evidence without unit '{cls}'"))

        # a figure written "<n> on <date>" must be the value the tool gave for that date
        by_date = {f.key[5:]: f.value for r in results for f in r.facts
                   if f.key.startswith("risk_") and isinstance(f.value, (int, float))}
        if by_date:
            spans = [(d.start(), d.end()) for d in DATE.finditer(body)]
            for m in NUMBER.finditer(body):
                if any(a <= m.start() < b for a, b in spans):
                    continue
                tail = body[m.end():m.end() + 60]
                dm = ON_DATE.match(tail)
                if not dm:
                    continue
                iso = dm.group(1)
                if not iso:
                    mon, day = MONTHS.get(dm.group(2).lower()), int(dm.group(3))
                    iso = next((d for d in by_date if int(d[5:7]) == mon and int(d[8:10]) == day), None)
                if iso in by_date:
                    x = float(m.group(1).replace(",", "") + (m.group(2) or ""))
                    if abs(round(abs(by_date[iso]), _decimals(m.group(2))) - x) > 1e-9:
                        v.append(Violation("date_value_mismatch",
                                           f"{m.group(0)} is stated for {iso} but the tool gave {by_date[iso]} for that date"))

        # the indicator named next to a figure must be the indicator that figure belongs to
        for m in NUMBER.finditer(body_nolist):
            try:
                x = float(m.group(1).replace(",", "") + (m.group(2) or ""))
            except ValueError:
                continue
            d = _decimals(m.group(2))
            cands = [f for val, f in nums if abs(round(abs(val), d) - x) < 1e-9]
            if not cands or any(not _fact_indicators(f) for f in cands):
                continue
            start = max(body_nolist.rfind(".", 0, m.start()), body_nolist.rfind("\n", 0, m.start()), 0)
            names = [k.lastgroup for k in INDICATOR_LEX.finditer(body_nolist[start:m.start()])]
            if not names:
                continue
            near = names[-1]
            if not any(near in _fact_indicators(f) for f in cands):
                v.append(Violation("indicator_mismatch",
                                   f"{m.group(0)} is written as '{near}' but it is the value of "
                                   + ", ".join(sorted({f.label for f in cands}))))

        # the model's text must never be tool-call markup
        if TOOLCALL_TEXT.search(answer):
            v.append(Violation("tool_call_text_in_answer", "the draft contains tool-call markup instead of an answer"))

        # the period the user asked about must be the period the tool computed
        uy = sorted({int(y) for y in USER_YEAR.findall(user_text or "") if 2000 <= int(y) <= 2023})
        if uy and not refusal:
            since = re.search(r"\b(since|after|from|starting)\b[^.?]{0,12}\b" + str(uy[0]) + r"\b", user_text or "", re.I)
            want = (uy[0], 2023) if (len(uy) == 1 and since) else (uy[0], uy[-1])
            for r in results:
                e = r.entities
                if r.tool == "reported_flood_months" and "year_from" in e:
                    if (e["year_from"], e["year_to"]) != want:
                        v.append(Violation("period_not_applied",
                                           f"the question asks about {want[0]}-{want[1]} but the tool covered "
                                           f"{e['year_from']}-{e['year_to']}; call reported_flood_months with "
                                           f"year_from={want[0]}, year_to={want[1]}"))
                elif r.tool in ("monsoon_indicators", "rainfall_features") and len(uy) == 1 and e.get("year") != uy[0] \
                        and r.status in ("ok", "stale"):
                    v.append(Violation("period_not_applied",
                                       f"the question asks about {uy[0]} but the tool result is not for that year; "
                                       f"call {r.tool} with year={uy[0]}"))

        # a request the tools cannot serve must be declined explicitly, not answered with something else
        if not refusal and results:
            user_res = [m.group(0).lower() for m in RESOLUTION.finditer(user_text or "")]
            if survey:
                user_res = [w for w in user_res if w not in ("household", "households")]
            if user_res and not any(
                    RESOLUTION.search(s) and (NEGATION.search(s) or DISTRICT_LEVEL.search(s)) for s in SENT.split(body)):
                v.append(Violation("requested_resolution_unaddressed",
                                   "the question asks for sub-district results; the answer must say these are not available "
                                   "and that results are district-level"))
            if FUTURE_ASK.search(user_text or "") and not has_projection_tool(results) and not DECLINES_FUTURE.search(body):
                v.append(Violation("requested_future_unaddressed",
                                   "the question asks about the future; the answer must say predictions or future "
                                   "probabilities are not available"))

        # a ranking must have been computed for the scope the user asked for
        for r in results:
            if r.tool == "rank_districts" and not r.entities.get("state"):
                asked = [s for s in self.states.values()
                         if re.search(r"\b" + re.escape(s) + r"\b", user_text or "", re.I)]
                if asked:
                    v.append(Violation("scope_not_applied",
                                       f"the question is about {asked[0]} but the ranking covers all of India; "
                                       f"call rank_districts with state='{asked[0]}'"))

        # places
        allowed_d, allowed_s, state_of = set(), set(), {}
        for r in results:
            e = r.entities
            if e.get("district"):
                allowed_d.add(norm(e["district"]))
                state_of.setdefault(norm(e["district"]), set()).add(e.get("state"))
            if e.get("state"):
                allowed_s.add(norm(e["state"]))
            for c in r.data.get("candidates", []) or []:
                allowed_d.add(norm(c["district"]))
                allowed_s.add(norm(c["state"]))
                state_of.setdefault(norm(c["district"]), set()).add(c["state"])
            for row in r.data.get("rows", []) or []:
                allowed_d.add(norm(row["district"]))
                allowed_s.add(norm(row["state"]))
        user_norm = norm(user_text + " " + context_text)
        words = re.findall(r"[A-Za-z&][A-Za-z&'\-]*", body)
        state_words = words
        # word ranges that belong to a state name ("Jammu & Kashmir"): not scanned as district names (e.g. "Jammu")
        state_spans = []
        for sname in self.states.values():
            sw = re.findall(r"[A-Za-z&][A-Za-z&'\-]*", sname)
            for i in range(len(words) - len(sw) + 1):
                if [w.lower() for w in words[i:i + len(sw)]] == [w.lower() for w in sw]:
                    state_spans.append((i, i + len(sw)))
        flagged = set()
        for n in (3, 2, 1):
            for i in range(len(words) - n + 1):
                gram = words[i:i + n]
                key = norm(" ".join(gram))
                if n == 1 and not gram[0][:1].isupper():
                    continue
                if any(a <= i and i + n <= b for a, b in state_spans):
                    continue
                if key in self.names and key not in flagged:
                    if key in allowed_d or key in user_norm:
                        # same-name districts: an adjacent state must match the resolved state
                        if len(self.names[key]) > 1:
                            tail = [norm(" ".join(words[i + n:i + n + k])) for k in (1, 2, 3)]
                            named = {self.states[t] for t in tail if t in self.states}
                            exp = state_of.get(key, set())
                            if named and exp and not (named & {s for s in exp if s}):
                                v.append(Violation("wrong_state_for_district",
                                                   f"'{' '.join(gram)}' is associated with {sorted(named)} "
                                                   f"but the tool resolved {sorted(s for s in exp if s)}"))
                        continue
                    if re.search(r"\b" + re.escape(" ".join(gram)) + r"\b", big_text, re.I):
                        continue   # named in the tool's own text (e.g. a coverage note)
                    flagged.add(key)
                    v.append(Violation("unexpected_place", f"'{' '.join(gram)}' was not resolved by any tool"))
        for n in (3, 2, 1):
            for i in range(len(state_words) - n + 1):
                key = norm(" ".join(state_words[i:i + n]))
                if key in self.states and key not in allowed_s and key not in user_norm and key not in flagged:
                    if key in self.names:  # state shares a name with a district (e.g. none) -> handled above
                        continue
                    if re.search(r"\b" + re.escape(self.states[key]) + r"\b", big_text, re.I):
                        continue
                    flagged.add(key)
                    v.append(Violation("unexpected_place", f"state '{self.states[key]}' was not resolved by any tool"))

        if not results and not refusal:
            hit = GROUND_TERMS.search(body)
            if hit:
                v.append(Violation("ungrounded_claim", f"'{hit.group(0)}' discussed without any tool evidence"))

        # claim-type rules, sentence by sentence (quoted passages are exempt)
        classes = {r.semantics.get("data_class") for r in results}
        temporal = {r.semantics.get("temporal_class") for r in results}
        stale = any(r.semantics.get("forecast_status") in ("stale", "expired") for r in results)
        keys = {f.key for r in results for f in r.facts}
        has_projection = "projection" in classes
        sentences = [s for s in SENT.split(re.sub(r"[\"“”][^\"“”]{20,}[\"“”]", " ", body)) if s.strip()]
        for s in sentences:
            if refusal:
                pass  # a refusal may name the unsupported thing it declines
            elif PROB.search(s) and "probability" not in classes and not NEG_STRICT.search(s):
                v.append(Violation("index_as_probability", f"probability language without a probability result: '{s.strip()[:90]}'"))
            if not refusal and PRED.search(s) and not has_projection and not NEG_STRICT.search(s):
                v.append(Violation("unsupported_prediction", f"predictive/future claim: '{s.strip()[:90]}'"))
            if not refusal and CAUSAL.search(s) and not NEG_STRICT.search(s):
                v.append(Violation("unsupported_causal_claim", f"causal wording: '{s.strip()[:90]}'"))
            if classes & {"reanalysis", "satellite_gauge_estimate"} and OBSERVED.search(s) and not QUALIFIER.search(s):
                v.append(Violation("observation_vs_estimate", f"estimate described as observation: '{s.strip()[:90]}'"))
            res_words = [m.group(0).lower() for m in RESOLUTION.finditer(s)]
            if survey:
                res_words = [w for w in res_words if w not in ("household", "households")]
            if res_words and not NEGATION.search(s) and not refusal:
                v.append(Violation("resolution_overclaim", f"sub-district resolution claim: '{s.strip()[:90]}'"))
            if "reported_event_records" in classes and NOFLOOD.search(s):
                v.append(Violation("absence_as_evidence", f"absence of a report presented as no flood: '{s.strip()[:90]}'"))
            if INDIA_WIDE.search(s) and any(r.semantics.get("coverage", "").startswith("Rajasthan") for r in results) \
                    and not NEGATION.search(s):
                v.append(Violation("coverage_overreach", f"Rajasthan-only result generalised: '{s.strip()[:90]}'"))
            if "rainfall_cv" in keys and re.search(r"monsoon\s+(reliab|variab|consisten|predictab)", s, re.I):
                v.append(Violation("misnamed_indicator", "annual rainfall CV must not be called monsoon reliability/variability"))
            if "onset_proxy_status" in keys and IMD_ONSET.search(s) and not NEGATION.search(s):
                v.append(Violation("onset_proxy_as_imd", "the onset proxy is not the IMD onset"))
        if stale:
            if not STALE_MARK.search(body):
                v.append(Violation("stale_forecast_not_flagged", "the forecast is stale/expired but the answer does not say so"))
            for s in sentences:
                if DEICTIC.search(s):
                    v.append(Violation("stale_forecast_deictic", f"present-tense wording for a stale forecast: '{s.strip()[:90]}'"))
        if "reported_event_records" in classes and re.search(r"\b(flood|inundat)", body, re.I) and \
                not re.search(r"\breport", body, re.I) and "n_reported_months" in keys:
            v.append(Violation("missing_reported_qualifier", "flood months must be described as reported records"))
        if "onset_proxy_status" in keys and re.search(r"\bonset\b", body, re.I) and \
                not re.search(r"\b(proxy|provisional)\b", body, re.I):
            v.append(Violation("onset_not_labelled_proxy", "onset must be described as a provisional proxy"))

        return VerificationReport(passed=not v, violations=v, cited_fact_ids=sorted(set(cited)),
                                  checked={"numbers": len(list(NUMBER.finditer(body_nolist))),
                                           "sentences": len(sentences), "classes": sorted(c for c in classes if c)})
