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
import csv
import difflib
import json
import math
import re
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

    # ── Fallback: census-boundary spatial join for districts the platform's own
    # district_name field doesn't carry at all (Chennai, Kolkata, Daman, Mahe,
    # Mumbai, most of NCT Delhi -- confirmed absent from district_factors above,
    # not a naming mismatch: verified by listing each state's actual district
    # set, see chat). data/india_districts_census.geojson (Census 2011, 641 real
    # district polygons) has real geometry for every one of these. This computes
    # a SEPARATE aggregate purely for the correlation matching below -- it does
    # NOT touch india_hex_props.json's own district_name, which every other page
    # on this platform depends on. Genuinely post-2011 districts (Charkhi Dadri,
    # Tenkasi, Hanumakonda, Shahdara) still won't be here; correct, they didn't
    # exist as separate polygons in 2011.
    census_district_factors = {}
    census_path = ROOT / "data/india_districts_census.geojson"
    if census_path.exists():
        import geopandas as gpd
        import h3

        print("Computing census-boundary fallback aggregates...")
        census_gdf = gpd.read_file(str(census_path))
        if census_gdf.crs is None:
            census_gdf = census_gdf.set_crs("EPSG:4326")

        # Hex POLYGONS + "intersects", not centroid + "within": these fallback
        # districts (Chennai, Kolkata, Mumbai, Daman, Mahe, Delhi's inner
        # districts) are all small/dense enough that ZERO hex centroids land
        # inside them (verified -- a first attempt using centroids matched 0 of
        # these 5 despite the polygons genuinely existing in the census file).
        # A ~252km2 hex routinely covers a whole small urban district plus its
        # surroundings, so this necessarily blends in some neighboring area --
        # an approximation, same spirit as any coarse-grid estimate for a
        # sub-grid-cell area, and it's the ONLY way a hex grid this coarse can
        # say anything at all about a small compact district. A hex touching
        # multiple districts contributes to each -- deliberate, not a bug.
        hex_rows = []
        for h in hexes:
            if not h.get("h3_id"):
                continue
            boundary = h3.cell_to_boundary(h["h3_id"])
            hex_rows.append({"h3_id": h["h3_id"], "boundary": boundary, **{f: h.get(f) for f in FACTORS}, "population": h.get("population")})
        from shapely.geometry import Polygon
        hex_gdf = gpd.GeoDataFrame(hex_rows, geometry=[Polygon([(lon, lat) for lat, lon in r["boundary"]]) for r in hex_rows], crs="EPSG:4326")
        joined = gpd.sjoin(hex_gdf, census_gdf[["Dist_name", "ST_NM", "geometry"]], how="inner", predicate="intersects")

        cacc = defaultdict(lambda: {"pop": 0.0, **{f: 0.0 for f in FACTORS}})
        for _, row in joined.iterrows():
            d, s = row.get("Dist_name"), row.get("ST_NM")
            if not d or not s or (isinstance(d, float) and math.isnan(d)):
                continue
            pop = max(row.get("population") or 0, 1)
            a = cacc[(s, d)]
            a["pop"] += pop
            for f in FACTORS:
                v = row.get(f)
                if v is not None and not (isinstance(v, float) and math.isnan(v)):
                    a[f] += v * pop
        for (s, d), a in cacc.items():
            pop = a["pop"]
            census_district_factors[(norm(s), norm(d))] = {
                "state": s, "district": d, "population": round(pop),
                **{f: round(a[f] / pop, 3) for f in FACTORS},
            }
        print(f"  {len(census_district_factors)} census districts aggregated from {len(hex_rows)} hexes")

    # ── Match NFHS-6 (state, district) -> hex-grid (state, district) ────────
    hex_by_state = defaultdict(list)
    for (sn, dn), rec in district_factors.items():
        hex_by_state[sn].append((dn, rec["district"]))

    def match_district(nfhs_state: str, nfhs_district: str):
        """Returns (factors_dict, source) or (None, None). source is 'hex_grid'
        (this platform's own district_name -- what every other page uses) or
        'census_2011' (the supplementary boundary fallback, only for districts
        district_name doesn't carry at all)."""
        alias = DISTRICT_ALIASES.get((nfhs_state, nfhs_district))
        target_district = alias or nfhs_district
        cand_states = NFHS_TO_HEX_STATES_NORM.get(norm(nfhs_state), [nfhs_state])
        for cand_state in cand_states:
            sn = norm(cand_state)
            key = (sn, norm(target_district))
            if key in district_factors:
                return district_factors[key], "hex_grid"
        # fuzzy fallback within each candidate state
        for cand_state in cand_states:
            sn = norm(cand_state)
            candidates = hex_by_state.get(sn, [])
            if not candidates:
                continue
            names = [c[0] for c in candidates]
            best = difflib.get_close_matches(norm(target_district), names, n=1, cutoff=0.72)
            if best:
                return district_factors[(sn, best[0])], "hex_grid"
        # census-2011 boundary fallback -- exact name match only (these are all
        # well-known, unambiguous names -- Chennai, Kolkata, Mumbai, Daman, Mahe,
        # NCT Delhi's sub-districts -- fuzzy matching isn't needed and would risk
        # a wrong match for common short names)
        for cand_state in cand_states:
            key = (norm(cand_state), norm(target_district))
            if key in census_district_factors:
                return census_district_factors[key], "census_2011"
        return None, None

    # ── Build per-district indicator trend rows ──────────────────────────────
    by_district = defaultdict(list)
    for r in nfhs["district_rows"]:
        by_district[(r["state"], r["district"])].append(r)

    unmatched = []
    census_matched = []
    districts_out = []
    for (state, district), rows in by_district.items():
        factors, source = match_district(state, district)
        if not factors:
            unmatched.append((state, district))
        elif source == "census_2011":
            census_matched.append((state, district))
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
            "factor_source": source,
            "factors": factors,
            "indicators": indicators,
        })
    districts_out.sort(key=lambda r: (r["state"], r["district"]))

    print(f"Districts: {len(districts_out)}  matched to hex factors: "
          f"{sum(1 for d in districts_out if d['matched_factors'])}  "
          f"({len(census_matched)} via census-2011 fallback)  unmatched: {len(unmatched)}")
    if census_matched:
        print("  Matched via census-2011 fallback (not in this platform's own district_name):")
        for s, d in sorted(census_matched):
            print(f"    {s} / {d}")
    if unmatched:
        print("  Unmatched (state, district):")
        for s, d in sorted(unmatched):
            print(f"    {s} / {d}")

    # ── State-level rows, WITH the urban/rural split district tables don't have.
    # NFHS-6 doesn't produce district-level rural/urban estimates at all (stated
    # in the compendiums' own methodology note) -- this is the only granularity
    # finer than "Total" this dataset actually offers. The NFHS-6 compendium's own
    # state table gives NFHS-6's urban/rural (current round) but only NFHS-5's
    # Total (for the trend comparison) -- NFHS-5's OWN urban/rural split isn't on
    # that table at all. Filled in from a second, independent source instead:
    # data/raw/nfhs5/nfhs5_states_urban_rural.csv (pratapvardhan/NFHS-5 on GitHub,
    # CC-BY 4.0, itself parsed from the official NFHS-5 state fact sheets at
    # rchiips.org) -- joined by normalized indicator text since the two sources
    # use different indicator numbering/order. Exact match first, then substring
    # containment (my own state-row labels can be truncated mid-sentence by a
    # page-wrap quirk in the source PDF's 4-column state layout -- see
    # parse_nfhs6_district_pdfs.py -- so a truncated label vs. the fuller NFHS-5
    # wording needs substring, not just exact-normalized, matching).
    def norm_ind(s: str) -> str:
        s = re.sub(r"\d+", "", s.lower())
        return re.sub(r"\s+", " ", re.sub(r"[^a-z ]", " ", s)).strip()

    nfhs5_ur_path = ROOT / "data/raw/nfhs5/nfhs5_states_urban_rural.csv"
    nfhs5_ur_by_state = defaultdict(dict)  # state -> {norm_label: (urban, rural)}
    if nfhs5_ur_path.exists():
        with open(nfhs5_ur_path, newline="") as f:
            for row in csv.DictReader(f):
                try:
                    u, r5 = float(row["nfhs5_urban"]), float(row["nfhs5_rural"])
                except (ValueError, KeyError):
                    continue
                nfhs5_ur_by_state[row["state"]][norm_ind(row["indicator"])] = (u, r5)
        print(f"NFHS-5 urban/rural source loaded: {len(nfhs5_ur_by_state)} states")

    def find_nfhs5_ur(state: str, label: str):
        pool = nfhs5_ur_by_state.get(state)
        if not pool:
            return None, None
        target = norm_ind(label)
        if target in pool:
            return pool[target]
        if len(target) > 15:
            for k, v in pool.items():
                if target in k or k in target:
                    return v
        return None, None

    by_state = defaultdict(list)
    for r in nfhs["state_rows"]:
        by_state[r["state"]].append(r)
    states_out = []
    n_nfhs5_ur_matched = 0
    for state, rows in by_state.items():
        indicators = {}
        for r in rows:
            if r["nfhs6"] is None or r["nfhs5"] is None:
                continue
            delta = round(r["nfhs6"] - r["nfhs5"], 2)
            hib = higher_is_better(r["indicator"])
            nfhs5_urban, nfhs5_rural = find_nfhs5_ur(state, r["indicator"])
            if nfhs5_urban is not None:
                n_nfhs5_ur_matched += 1
            indicators[r["num"]] = {
                "label": r["indicator"], "nfhs6": r["nfhs6"], "nfhs5": r["nfhs5"],
                "delta": delta, "improved": (delta > 0) if hib else (delta < 0),
                "small_sample": r["nfhs6_small_sample"] or r["nfhs5_small_sample"],
                "nfhs6_urban": r.get("nfhs6_urban"), "nfhs6_rural": r.get("nfhs6_rural"),
                "nfhs5_urban": nfhs5_urban, "nfhs5_rural": nfhs5_rural,
            }
        states_out.append({"state": state, "indicators": indicators})
    states_out.sort(key=lambda r: r["state"])
    print(f"States: {len(states_out)}  urban/rural: NFHS-6 always present, "
          f"NFHS-5 matched for {n_nfhs5_ur_matched} state-indicator pairs")

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
            "n_matched_census_fallback": len(census_matched),
            "n_indicators": len(indicator_labels),
            "factors": FACTORS,
        },
        "districts": districts_out,
        "states": states_out,
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
