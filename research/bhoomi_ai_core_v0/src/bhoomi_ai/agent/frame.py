"""Request frame: what the user asked for (metric, geography, period, question type).

Used only for CHECKING the model's tool calls and answers (argument guard, relevance
check). It never selects tools or writes answers. It is deliberately conservative:
when the question is not clearly parsed, no constraint is derived and no check fires.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..data_access import ALIASES, norm

MONTHS = {m: i for i, m in enumerate(
    "january february march april may june july august september october november december".split(), 1)}
NUMBER_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}

# canonical metric -> pattern (checked in order; several can match)
METRIC_PATTERNS = [
    ("flashflood", r"flash[\s-]?flood"),
    ("reported_floods", r"(?:flood\w*[^.?]{0,40}\b(?:reported|months?|histor\w*|ever|occurred|happened|struck|recorded)\b|"
                        r"flood\w*\s+(?:events?|reports?|records?)\b|"
                        r"\b(?:reported|months?|histor\w*)\b[^.?]{0,25}flood\w*)"),
    ("flood_index", r"(?:flood|pluvial)\w*\s+(?:risk|index|score|screening|hazard)|(?:risk|index|score)\s+(?:of|for)\s+flood"),
    ("flood_any", r"\bflood\w*|inundation"),
    ("wetbulb", r"wet[\s-]?bulb|humid\s+heat"),
    ("coldwave", r"cold[\s-]?wave"),
    ("heat", r"dry\s+heat|heat[\s-]?wave|\bheat\b(?!\s*index)"),
    ("drought", r"drought"),
    ("cyclone", r"cyclone"),
    ("landslide", r"landslide"),
    ("sealevel", r"sea[\s-]?level|coastal\s+(?:risk|hazard)"),
    ("fire", r"vegetation\s+fire|wild[\s-]?fire|fire\s+(?:risk|index|hazard)"),
    ("pollution", r"pollution|air\s+quality|\bPM\s?2\.?5"),
    ("overall", r"overall|hazard\s+profile|risk\s+profile|hazard\s+scores?|main\s+hazards?"),
    ("dry_spell", r"dry\s+spell|dry\s+days?"),
    ("jul_aug_share", r"(?:july|august)[^.?]{0,70}(?:share|fraction|proportion|percent\w*)|(?:share|fraction|proportion)[^.?]{0,70}(?:july|august)"),
    ("onset", r"\bonset\b|monsoon\s+(?:start|began|arriv\w*|set\s*in)|start\s+of\s+the\s+monsoon"),
    ("season_rain", r"(?:monsoon|june[\s\-–]+(?:to\s+)?september|jjas|seasonal|season)[^.?]{0,30}rain\w*|rain\w*[^.?]{0,30}(?:monsoon|june[\s\-–]+(?:to\s+)?september|jjas|season)"),
    ("month_rain", r"(?:rain\w*|wettest)[^.?]{0,40}\b(?:june|july|august|september)\b|\b(?:june|july|august|september)\b[^.?]{0,40}(?:rain\w*|wettest)"),
    ("rain_trend", r"rain\w*\s+trend|trend\w*[^.?]{0,20}rain\w*"),
    ("era5_rain", r"(?:average|annual|yearly|long[\s-]?term|mean|era5)[^.?]{0,30}rain\w*|rain\w*[^.?]{0,30}(?:era5|per\s+year|annual|yearly)"),
    ("warming", r"warming|warmer|temperature\s+trend"),
    ("temperature", r"temperature"),
    ("variability", r"variab\w*|reliab\w*|consisten\w*"),
    ("population", r"population|populous|people\s+live|inhabitants"),
    ("wash_water", r"drinking\s+water|improved\s+water|water\s+access"),
    ("wash_sanitation", r"sanitation|toilet"),
    ("wash_stunting", r"stunt\w*"),
    ("wash_diarrhoea", r"diarrh\w+"),
    ("wash_anaemia", r"an(?:a)?emi\w*"),
    ("wash_tap", r"tap\s+connection|functional\s+tap|\bFHTC\b|\bJJM\b"),
    ("forecast", r"forecast|warning|alert|next\s+\d+\s+days|7[\s-]?day|tomorrow|this\s+week"),
]
METRIC_RX = [(m, re.compile(p, re.I)) for m, p in METRIC_PATTERNS]

QTYPE_PATTERNS = {
    "comparison": r"\b(compare|comparison|versus|vs\.?|difference\s+between|higher\s+than|lower\s+than|both|than)\b",
    "ranking": r"\b(top\s+\d+|top\s+(?:one|two|three|four|five)|highest|lowest|most|least|rank\w*|worst|best|largest|smallest)\b",
    "list": r"\b(which\s+months|what\s+months|in\s+which|list|when\s+(?:did|was|were))\b",
    "count": r"\b(how\s+many|number\s+of|count)\b",
    "definition": r"\b(what\s+does\b.*\bmean|how\s+(?:is|are)\b.*\b(?:defined|computed|calculated|measured)|define|explain|what\s+is\s+the\s+definition)\b",
    "navigation": r"\b(open\s+the|link\s+me|take\s+me|go\s+to|show\s+me\s+the\s+(?:map|page|report))\b",
    "prediction": r"\b(will|would|going\s+to|predict\w*|projected?|projection\w*|next\s+(?:year|decade|monsoon|season|summer)|in\s+the\s+future|(?:20[3-9]\d|21\d\d))\b",
    "causal": r"\b(why|cause[sd]?|because\s+of|reason\s+for|due\s+to|responsible\s+for|what\s+led)\b",
    "village": r"\b(villages?|hamlets?|households?|wards?|blocks?|tehsils?|talukas?|schools?|health\s+facilit\w+|neighbou?rhoods?)\b",
    "capabilities": r"\b(what\s+can\s+you|which\s+tools|what\s+tools|what\s+data|which\s+datasets?|what\s+do\s+you\s+(?:do|have))\b",
}
QTYPE_RX = {k: re.compile(v, re.I) for k, v in QTYPE_PATTERNS.items()}
ORDER_ASC = re.compile(r"\b(lowest|least|smallest|fewest|bottom|safest|best)\b", re.I)
ORDER_DESC = re.compile(r"\b(highest|most|largest|top|worst|greatest|biggest)\b", re.I)
TOP_N = re.compile(r"\b(?:top|first|bottom|lowest|highest|most|least)?\s*(\d{1,2}|" + "|".join(NUMBER_WORDS) + r")\s+"
                   r"(?:most\s+|least\s+|highest\s+|lowest\s+)?(?:\w+\s+){0,3}?districts?\b", re.I)
THAT_YEAR = re.compile(r"\b(that|the\s+same|same|those)\s+(?:year|period)\b|\bthen\b", re.I)
INDIA = re.compile(r"\b(india|nationwide|national|whole\s+country|entire\s+country|across\s+the\s+country)\b", re.I)


@dataclass
class Frame:
    metrics: list = field(default_factory=list)
    districts: list = field(default_factory=list)       # [(surface, [cache keys])]
    states: list = field(default_factory=list)
    years: list = field(default_factory=list)
    out_of_range_years: list = field(default_factory=list)
    months: list = field(default_factory=list)
    qtypes: set = field(default_factory=set)
    top_n: int | None = None
    order: str | None = None
    india_scope: bool = False
    ctx_district: str | None = None
    ctx_state: str | None = None
    ctx_year: int | None = None
    uses_context_year: bool = False

    @property
    def unique_districts(self):
        return [(s, k[0]) for s, k in self.districts if len(k) == 1]


def parse_request(text: str, store, context: dict | None = None) -> Frame:
    f = Frame()
    t = text or ""
    g = store.gazetteer()
    cache = store.cache()["districts"]
    # "June-September" / "June to September" is a season, not a single month
    t_months = re.sub(r"\bjune\s*(?:[-–]|to|through|and)\s*september\b", " ", t, flags=re.I)
    n_months = len({m.lower() for m in re.findall(r"\b(" + "|".join(MONTHS) + r")\b", t_months, re.I)
                    if m.lower() in ("june", "july", "august", "september")})
    work = t
    for m, rx in METRIC_RX:
        hit = rx.search(t_months if m == "month_rain" else work)
        if not hit:
            continue
        if m == "month_rain" and n_months != 1:
            continue                       # "July and August" is a share/period phrase, not one month
        f.metrics.append(m)
        if m in ("flashflood", "wetbulb", "coldwave", "reported_floods"):
            work = work[:hit.start()] + " " * (hit.end() - hit.start()) + work[hit.end():]   # blank so generic patterns skip it
    if "month_rain" in f.metrics and "jul_aug_share" in f.metrics:
        f.metrics.remove("month_rain")
    if "rain_trend" in f.metrics and "era5_rain" in f.metrics and not re.search(r"\b(average|mean|typical)\b", t, re.I):
        f.metrics.remove("era5_rain")
    # a specific flood sense overrides the generic one
    if "flood_any" in f.metrics and any(x in f.metrics for x in ("reported_floods", "flood_index", "flashflood")):
        f.metrics.remove("flood_any")
    if "temperature" in f.metrics and "warming" in f.metrics:
        f.metrics.remove("temperature")
    f.qtypes = {k for k, rx in QTYPE_RX.items() if rx.search(t)}
    words = [w for w in re.split(r"[\s,?.;:!()]+", t) if w]
    used = set()
    for n in (3, 2, 1):
        for i in range(len(words) - n + 1):
            if any(j in used for j in range(i, i + n)):
                continue
            gram = " ".join(words[i:i + n])
            if n == 1 and len(gram) < 4:
                continue
            key = norm(gram)
            if key in g["state_norm"] and n >= 1:
                s_ = g["state_norm"][key]
                if s_ not in f.states:
                    f.states.append(s_)
                if g["by_norm"].get(key):
                    f.districts.append((gram, list(g["by_norm"][key])))
                used.update(range(i, i + n))
                continue
            keys = g["by_norm"].get(key)
            if not keys and key in ALIASES:                     # "Sri Ganganagar", "Dholpur", ...
                keys = g["by_norm"].get(norm(ALIASES[key]))
            if keys:
                f.districts.append((gram, list(keys)))
                used.update(range(i, i + n))
    all_years = {int(y) for y in re.findall(r"\b((?:19|20)\d\d)\b", t)}
    f.years = sorted(y for y in all_years if 2000 <= y <= 2023)
    f.out_of_range_years = sorted(y for y in all_years if y < 2000 or 2023 < y <= 2029)
    f.months = sorted({MONTHS[m.lower()] for m in re.findall(r"\b(" + "|".join(MONTHS) + r")\b", t, re.I)})
    mt = TOP_N.search(t)
    if mt:
        v = mt.group(1).lower()
        f.top_n = NUMBER_WORDS.get(v) or int(v)
    if ORDER_ASC.search(t) and not re.search(r"\b(most|highest)\b[^.?]*\b(lowest|least)\b", t, re.I):
        f.order = "asc"
    elif ORDER_DESC.search(t):
        f.order = "desc"
    f.india_scope = bool(INDIA.search(t))
    ctx = context or {}
    f.ctx_district, f.ctx_state, f.ctx_year = ctx.get("district"), ctx.get("state"), ctx.get("year")
    f.uses_context_year = bool(THAT_YEAR.search(t)) and not f.years and f.ctx_year is not None
    return f
