#!/usr/bin/env python3
"""
compute_nfhs6_district_trends.py -- NFHS-5 (2019-21) -> NFHS-6 (2023-24)
DISTRICT-level trends (all ~93 indicators the compendiums publish, per
district) + correlations against this platform's terrain/hazard/WASH factors,
aggregated from hex level up to district.

Unlike compute_nfhs_trends.py (state-level, 36 points, 7 hand-picked
indicators), this runs at district level: 697 districts x ~93 indicators,
enough statistical power to compute a genuine correlation matrix rather than
hand-picked pairs, and to let the data surface what's actually strongest.

Inputs:
  data/nfhs6_district_all_indicators.json  (scripts/parse_nfhs6_district_pdfs.py)
  client/public/data/india_hex_props.json  (hex terrain/hazard/WASH aggregates)

Output:
  client/public/data/nfhs6_district_trends.json
    { meta, districts[], correlations[], top_improvers[], top_regressors[] }

NFHS-6 fact sheets (state AND district) do not publish sanitation, cooking
fuel, handwashing, or anaemia -- confirmed absent from every parsed district
table, not an extraction gap. Those indicators are excluded from this trend
set; the platform's existing wash_sanitation_pct etc. (NFHS-5) stay as-is.

Run: python scripts/compute_nfhs6_district_trends.py
"""
import difflib
import json
import math
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NFHS_FILE = ROOT / "data/nfhs6_district_all_indicators.json"
HEX_FILE = ROOT / "client/public/data/india_hex_props.json"
OUT = ROOT / "client/public/data/nfhs6_district_trends.json"


def norm(s: str) -> str:
    return (s or "").lower().replace("&", "and").replace("-", " ").replace("_", " ").strip()

# ── Indicators with an unambiguous "higher is better" direction; everything
# else not listed defaults to "lower is better" (true for the large majority --
# stunting, wasting, diarrhoea, mortality-adjacent, blood pressure, etc.).
# Matched by substring against the parsed indicator label (case-insensitive).
HIGHER_IS_BETTER_HINTS = [
    "improved drinking-water", "electricity", "health insurance", "bank account",
    "ever attended school", "owning a house", "pre-school", "10 or more years of schooling",
    "ever used the internet", "antenatal", "protected against neonatal tetanus",
    "iron folic acid", "mcp card", "institutional births", "skilled health personnel",
    "postnatal care", "fully vaccinated", "received any vaccine", "received bcg",
    "doses of polio", "doses of pentavalent", "measles-containing vaccine",
    "hepatitis b vaccine", "doses of rotavirus", "vitamin a dose",
    "taken to a health facility", "breastfed within one hour", "exclusively breastfed",
    "receiving an adequate diet", "receiving solid or semi-solid food",
    "household decisions", "paid in cash", "bank or savings account",
    "mobile phone that they themselves use", "hygienic methods of protection",
    "iodized salt",
]

# ── Known official district renamings / NFHS-vs-hex-grid spelling variants that
# a plain normalized-string match won't catch. (state, nfhs_name) -> hex_name.
# Built from the actual unmatched set after the first pass (see chat) -- not
# guessed blind; each is a documented rename or a confirmed spelling variant.
DISTRICT_ALIASES = {
    ("Karnataka", "Bengaluru Urban"): "Bangalore Urban",
    ("Karnataka", "Bengaluru Rural"): "Bangalore Rural",
    ("Karnataka", "Belagavi"): "Belgaum",
    ("Karnataka", "Ballari"): "Bellary",
    ("Karnataka", "Kalaburagi"): "Gulbarga",
    ("Karnataka", "Shivamogga"): "Shimoga",
    ("Karnataka", "Mysuru"): "Mysore",
    ("Karnataka", "Tumakuru"): "Tumkur",
    ("Karnataka", "Chikkamagaluru"): "Chikmagalur",
    ("Karnataka", "Bagalkote"): "Bagalkot",
    ("Karnataka", "Vijayapura"): "Bijapur",              # renamed from Bijapur, 2014
    ("Gujarat", "Ahmedabad"): "Ahmadabad",
    ("Gujarat", "Botad"): "Batod",                        # spelling variant in hex source
    ("Gujarat", "Dahod"): "Dohad",                        # spelling variant in hex source
    ("Haryana", "Gurugram"): "Gurgaon",
    ("Haryana", "Nuh"): "Mewat",
    ("Andhra Pradesh", "Y.S.R."): "Kadapa(YSR)",
    ("Assam", "Marigaon"): "Morigaon",
    ("Assam", "Karbi Anglong"): "Karbi Anglong",
    ("Bihar", "Purbi Champaran"): "East Champaran",
    ("Jharkhand", "Purbi Singhbum"): "Purbi Singhbhum",
    ("Chhattisgarh", "Dantewada"): "Dakshin Bastar Dantewada",
    ("Madhya Pradesh", "Agar Malwa"): "Agar",             # pre-expansion short name
    ("Maharashtra", "Beed"): "Bid",
    ("Odisha", "Sonepur"): "Subarnapur",                  # renamed 2011
    ("Punjab", "Sri Muktsar Sahib"): "Muktsar",           # honorific added later
    ("Tamil Nadu", "Tuticorin"): "Thoothukkudi",
    ("Telangana", "Bhadradri Kothagudem"): "Bhadradri",
    ("Telangana", "Kumuram Bheem Asifabad"): "Komaram Bheem",
    ("Telangana", "Medchal Malkajgiri"): "Medchal",
    ("Uttar Pradesh", "Amroha"): "Jyotiba Phule Nagar",   # renamed back from J.P. Nagar, 2012
    ("Uttar Pradesh", "Ayodhya"): "Faizabad",             # renamed 2018
    ("Uttar Pradesh", "Hathras"): "Mahamaya Nagar",       # renamed back, 2012
    ("Uttar Pradesh", "Kasganj"): "Kanshiram Nagar",      # renamed back, 2014
    ("Uttar Pradesh", "Prayagraj"): "Allahabad",          # renamed 2018
    ("West Bengal", "Hooghly"): "Hugli",
    ("Andaman & Nicobar Islands", "Nicobar"): "Nicobars",
}

# NFHS state name -> every hex-grid state name that could hold its districts.
# Usually 1:1 by spelling/pluralization only, but the 2020 DNH+Daman&Diu UT
# merger means one NFHS state now spans what the (older) hex boundaries still
# carry as two separate states -- search both.
NFHS_TO_HEX_STATES = {
    "Andaman & Nicobar Islands": ["Andaman & Nicobar Island"],
    "Dadra & Nagar Haveli and Daman & Diu": ["Dadra & Nagar Haveli", "Daman & Diu"],
}
# The source PDF text extraction renders some state names inconsistently across
# pages (e.g. "Andaman & Nicobar Islands" on some, "Andaman and Nicobar Islands"
# on others -- an "&"-vs-"and" glyph/ligature quirk in the PDF itself, not a
# parsing bug) -- so this lookup normalizes both sides rather than requiring an
# exact string match.
NFHS_TO_HEX_STATES_NORM = {norm(k): v for k, v in NFHS_TO_HEX_STATES.items()}


def higher_is_better(label: str) -> bool:
    low = label.lower()
    return any(h in low for h in HIGHER_IS_BETTER_HINTS)


def pearson(xs, ys):
    n = len(xs)
    if n < 3:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx == 0 or syy == 0:
        return None
    return sxy / math.sqrt(sxx * syy)


def main():
    nfhs = json.loads(NFHS_FILE.read_text())
    hexes = json.loads(HEX_FILE.read_text())

    # ── District-level factor aggregates (population-weighted mean) ─────────
    FACTORS = [
        "heat_risk", "wetbulb_risk", "flood_risk", "drought_risk", "cyclone_risk",
        "coldwave_risk", "landslide_risk", "fire_risk", "flashflood_risk",
        "pollution_risk", "gw_stress_score", "pm25_annual", "hex_risk",
        "adaptive_capacity", "elevation_mean", "ndvi_mean", "dist_to_river_km",
        "hazard_count_5", "multi_hazard_days", "total_burden_days",
        "wash_sanitation_pct", "wash_water_pct", "wash_literacy_pct",
    ]
    acc = defaultdict(lambda: {"pop": 0.0, **{f: 0.0 for f in FACTORS}})
    for h in hexes:
        d, s = h.get("district_name"), h.get("state")
        if not d or not s:
            continue
        pop = max(h.get("population") or 0, 1)
        a = acc[(s, d)]
        a["pop"] += pop
        for f in FACTORS:
            v = h.get(f)
            if v is not None:
                a[f] += v * pop

    district_factors = {}
    for (s, d), a in acc.items():
        pop = a["pop"]
        district_factors[(norm(s), norm(d))] = {
            "state": s, "district": d, "population": round(pop),
            **{f: round(a[f] / pop, 3) for f in FACTORS},
        }

    # ── Match NFHS-6 (state, district) -> hex-grid (state, district) ────────
    hex_by_state = defaultdict(list)
    for (sn, dn), rec in district_factors.items():
        hex_by_state[sn].append((dn, rec["district"]))

    def match_district(nfhs_state: str, nfhs_district: str):
        alias = DISTRICT_ALIASES.get((nfhs_state, nfhs_district))
        target_district = alias or nfhs_district
        cand_states = NFHS_TO_HEX_STATES_NORM.get(norm(nfhs_state), [nfhs_state])
        for cand_state in cand_states:
            sn = norm(cand_state)
            key = (sn, norm(target_district))
            if key in district_factors:
                return key
        # fuzzy fallback within each candidate state
        for cand_state in cand_states:
            sn = norm(cand_state)
            candidates = hex_by_state.get(sn, [])
            if not candidates:
                continue
            names = [c[0] for c in candidates]
            best = difflib.get_close_matches(norm(target_district), names, n=1, cutoff=0.72)
            if best:
                return (sn, best[0])
        return None

    # ── Build per-district indicator trend rows ──────────────────────────────
    by_district = defaultdict(list)
    for r in nfhs["district_rows"]:
        by_district[(r["state"], r["district"])].append(r)

    unmatched = []
    districts_out = []
    for (state, district), rows in by_district.items():
        mkey = match_district(state, district)
        factors = district_factors.get(mkey) if mkey else None
        if not factors:
            unmatched.append((state, district))
        indicators = {}
        for r in rows:
            if r["nfhs6"] is None or r["nfhs5"] is None:
                continue
            delta = round(r["nfhs6"] - r["nfhs5"], 2)
            hib = higher_is_better(r["indicator"])
            indicators[r["num"]] = {
                "label": r["indicator"], "nfhs6": r["nfhs6"], "nfhs5": r["nfhs5"],
                "delta": delta, "improved": (delta > 0) if hib else (delta < 0),
                "small_sample": r["nfhs6_small_sample"] or r["nfhs5_small_sample"],
            }
        districts_out.append({
            "state": state, "district": district,
            "matched_factors": factors is not None,
            "factors": factors,
            "indicators": indicators,
        })
    districts_out.sort(key=lambda r: (r["state"], r["district"]))

    print(f"Districts: {len(districts_out)}  matched to hex factors: "
          f"{sum(1 for d in districts_out if d['matched_factors'])}  "
          f"unmatched: {len(unmatched)}")
    if unmatched:
        print("  Unmatched (state, district):")
        for s, d in sorted(unmatched):
            print(f"    {s} / {d}")

    # ── Correlation matrix: every indicator's delta & nfhs6-level vs every
    # factor, computed across all matched, non-small-sample districts. Only
    # pairs with n>=50 and |r|>=0.25 are kept -- with ~600 districts of power
    # we can afford to let the data speak instead of hand-picking pairs, but
    # still filter out noise-level correlations.
    indicator_labels = {}
    for d in districts_out:
        for num, ind in d["indicators"].items():
            indicator_labels.setdefault(num, ind["label"])

    correlations = []
    for num, label in indicator_labels.items():
        for field in ("delta", "nfhs6"):
            pts_by_factor = defaultdict(list)
            for d in districts_out:
                if not d["matched_factors"]:
                    continue
                ind = d["indicators"].get(num)
                if not ind or ind["small_sample"]:
                    continue
                for f in FACTORS:
                    fv = d["factors"].get(f)
                    if fv is None:
                        continue
                    pts_by_factor[f].append((fv, ind[field], d["state"], d["district"]))
            for f, pts in pts_by_factor.items():
                if len(pts) < 50:
                    continue
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                r = pearson(xs, ys)
                if r is None or abs(r) < 0.25:
                    continue
                correlations.append({
                    "indicator_num": num, "indicator": label, "field": field,
                    "factor": f, "r": round(r, 3), "n": len(pts),
                })
    correlations.sort(key=lambda c: -abs(c["r"]))
    top_correlations = correlations[:60]

    # ── Biggest district movers (any indicator), for headline callouts ──────
    all_deltas = []
    for d in districts_out:
        for num, ind in d["indicators"].items():
            if ind["small_sample"]:
                continue
            all_deltas.append({
                "state": d["state"], "district": d["district"], "indicator": ind["label"],
                "delta": ind["delta"], "nfhs6": ind["nfhs6"], "nfhs5": ind["nfhs5"],
                "improved": ind["improved"],
            })
    top_improvers = sorted([a for a in all_deltas if a["improved"]],
                            key=lambda a: -abs(a["delta"]))[:40]
    top_regressors = sorted([a for a in all_deltas if not a["improved"]],
                             key=lambda a: -abs(a["delta"]))[:40]

    out = {
        "meta": {
            "source": nfhs["source"],
            "note": nfhs["note"],
            "n_districts": len(districts_out),
            "n_matched": sum(1 for d in districts_out if d["matched_factors"]),
            "n_indicators": len(indicator_labels),
            "factors": FACTORS,
        },
        "districts": districts_out,
        "correlations": top_correlations,
        "top_improvers": top_improvers,
        "top_regressors": top_regressors,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"\nSaved {OUT} ({OUT.stat().st_size / 1024 / 1024:.1f}MB)")
    print(f"\nTop 15 correlations (|r|, n, factor -> indicator):")
    for c in top_correlations[:15]:
        print(f"  r={c['r']:+.2f} n={c['n']:3d}  {c['factor']:22s} vs {c['field']:6s} {c['indicator'][:60]}")


if __name__ == "__main__":
    main()
