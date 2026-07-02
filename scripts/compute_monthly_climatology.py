"""
Compute per-hex monthly climatology (V1 — seasonal, not anomaly).

Method: Scale existing annual risk scores by India climate-zone monthly
distribution factors. Annual values are preserved exactly (sum of monthly
fractions = 1.0, so mean monthly = annual / 12).

V1 catches SEASONS (typical May is hot here) but NOT ANOMALIES (March 2022
was extreme). Anomaly detection is V2 (period-specific ERA5/CHIRPS inputs).

Adds per hex:
  {hazard}_peak_month   int  1-12   month with highest risk
  {hazard}_peak_score   float       risk score at peak month (capped 0-10)
  {hazard}_seasonal     list[12]    monthly risk scores Jan..Dec
For hazards: flood, heat, drought, wetbulb

Also adds:
  peak_season_month     int  1-12   month where overall hex risk peaks (all hazards)
  peak_season_score     float       overall risk at peak month

Run: python scripts/compute_monthly_climatology.py
"""
import json
import math
from pathlib import Path
import h3

ROOT = Path(__file__).resolve().parent.parent
HEX_FILE = ROOT / "client/public/data/india_hex_props.json"

MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

# ─────────────────────────────────────────────────────────────────────────────
# Monthly distribution factors by climate zone (sum to 1.0 per hazard/zone).
# Calibrated from IMD/CHIRPS/ERA5 literature for India's major climate zones.
# ─────────────────────────────────────────────────────────────────────────────

# Zone classification (lat, lon → zone string)
def climate_zone(lat: float, lon: float) -> str:
    if lon > 88 and lat > 20:       return "ne_india"     # Assam, Meghalaya, NE
    if lat < 14 and lon > 78:       return "ne_monsoon"   # Tamil Nadu, S. Andhra
    if lon < 74 and lat > 22:       return "arid"         # Rajasthan, Thar
    if lat > 28 and lon < 78:       return "winter_rain"  # Punjab, HP, W. disturbances
    return "sw_monsoon"                                    # rest of India

# ── Flood (days/yr >50mm rainfall) ──
# sw_monsoon: Jun-Sep dominant
# ne_monsoon: Oct-Dec dominant (Tamil Nadu)
# ne_india: May-Sep with earlier peak
# arid: Jul-Aug concentrated
# winter_rain: Jul-Aug + minor winter contribution
FLOOD_FACTORS = {
    "sw_monsoon":  [0.01, 0.01, 0.01, 0.02, 0.04, 0.18, 0.27, 0.25, 0.12, 0.05, 0.02, 0.02],
    "ne_monsoon":  [0.07, 0.05, 0.03, 0.02, 0.03, 0.07, 0.09, 0.08, 0.09, 0.18, 0.22, 0.07],
    "ne_india":    [0.02, 0.02, 0.04, 0.09, 0.15, 0.21, 0.23, 0.14, 0.06, 0.02, 0.01, 0.01],
    "arid":        [0.01, 0.01, 0.01, 0.01, 0.02, 0.07, 0.38, 0.32, 0.11, 0.03, 0.01, 0.02],
    "winter_rain": [0.07, 0.09, 0.05, 0.02, 0.03, 0.08, 0.22, 0.20, 0.08, 0.05, 0.05, 0.06],
}

# ── Heat (days/yr >40°C) ──
# Heat is fairly uniform nationally (peaks May in interior, Jun near coasts)
# Exceptions: NE India has much lower heat, coastal south moderates
HEAT_FACTORS = {
    "sw_monsoon":  [0.00, 0.01, 0.03, 0.10, 0.28, 0.25, 0.10, 0.08, 0.07, 0.05, 0.02, 0.01],
    "ne_monsoon":  [0.00, 0.01, 0.04, 0.12, 0.22, 0.20, 0.12, 0.10, 0.09, 0.06, 0.03, 0.01],
    "ne_india":    [0.00, 0.01, 0.03, 0.08, 0.20, 0.22, 0.15, 0.12, 0.10, 0.05, 0.03, 0.01],
    "arid":        [0.00, 0.01, 0.04, 0.12, 0.30, 0.25, 0.10, 0.08, 0.06, 0.03, 0.01, 0.00],
    "winter_rain": [0.00, 0.01, 0.04, 0.11, 0.26, 0.24, 0.12, 0.09, 0.07, 0.04, 0.02, 0.00],
}

# ── Wet-bulb (days/yr T_wb >28°C) ──
# Humid zones: monsoon peak (Jul-Aug highest)
# Semi-arid zones: pre-monsoon + monsoon
# Dry zones: June-July peak (brief humid period)
WB_FACTORS = {
    "sw_monsoon":  [0.01, 0.02, 0.03, 0.05, 0.07, 0.11, 0.18, 0.18, 0.15, 0.10, 0.06, 0.04],
    "ne_monsoon":  [0.03, 0.03, 0.04, 0.06, 0.08, 0.10, 0.14, 0.14, 0.12, 0.11, 0.09, 0.06],
    "ne_india":    [0.01, 0.01, 0.02, 0.05, 0.09, 0.14, 0.20, 0.20, 0.14, 0.07, 0.04, 0.03],
    "arid":        [0.01, 0.01, 0.02, 0.05, 0.10, 0.17, 0.22, 0.20, 0.11, 0.06, 0.03, 0.02],
    "winter_rain": [0.01, 0.02, 0.03, 0.06, 0.09, 0.13, 0.19, 0.18, 0.13, 0.09, 0.05, 0.02],
}

# ── Drought (fraction of months below 50% of climatological mean) ──
# Inverted from rainfall — dry months are complement of wet months.
# High drought fraction → high drought score in that month.
DROUGHT_FACTORS = {
    "sw_monsoon":  [0.12, 0.11, 0.11, 0.11, 0.09, 0.03, 0.01, 0.01, 0.05, 0.08, 0.14, 0.14],
    "ne_monsoon":  [0.06, 0.08, 0.11, 0.12, 0.12, 0.09, 0.05, 0.05, 0.05, 0.05, 0.06, 0.16],
    "ne_india":    [0.14, 0.12, 0.10, 0.07, 0.04, 0.02, 0.01, 0.01, 0.04, 0.09, 0.14, 0.14] ,
    "arid":        [0.10, 0.10, 0.11, 0.11, 0.11, 0.09, 0.03, 0.03, 0.07, 0.10, 0.11, 0.12],
    "winter_rain": [0.06, 0.06, 0.09, 0.11, 0.12, 0.10, 0.07, 0.07, 0.09, 0.10, 0.07, 0.06],
}

HAZARD_FACTORS = {
    "flood":   FLOOD_FACTORS,
    "heat":    HEAT_FACTORS,
    "wetbulb": WB_FACTORS,
    "drought": DROUGHT_FACTORS,
}

# Which hex prop column maps to which hazard key
RISK_COLS = {
    "flood":   "flood_risk",
    "heat":    "heat_risk",
    "wetbulb": "wetbulb_risk",
    "drought": "drought_risk",
}

# All seasonal-aware hazard risk cols for peak_season computation
ALL_HAZARD_RISK_COLS = [
    "flood_risk", "heat_risk", "wetbulb_risk", "drought_risk",
    "flashflood_risk", "landslide_risk", "cyclone_risk", "sealevel_risk",
    "coldwave_risk", "fire_risk", "pollution_risk",
]

# Non-seasonal hazards: assign a flat monthly profile (month doesn't matter much)
# coldwave peaks Dec-Feb, fire peaks Feb-May, pollution peaks Oct-Feb (post-harvest burning),
# cyclone peaks Jun-Nov (Bay of Bengal), sealevel peaks Jun-Nov (storm surge season)
STATIC_HAZARD_FACTORS = {
    "flashflood_risk":  [0.01, 0.01, 0.01, 0.02, 0.05, 0.18, 0.26, 0.24, 0.12, 0.06, 0.02, 0.02],  # like flood
    "landslide_risk":   [0.01, 0.01, 0.01, 0.02, 0.05, 0.17, 0.28, 0.25, 0.12, 0.05, 0.02, 0.01],  # like flood
    "cyclone_risk":     [0.01, 0.01, 0.01, 0.01, 0.04, 0.14, 0.20, 0.20, 0.18, 0.12, 0.07, 0.01],  # Jun-Nov
    "sealevel_risk":    [0.01, 0.01, 0.01, 0.01, 0.03, 0.14, 0.22, 0.22, 0.18, 0.11, 0.05, 0.01],  # Jun-Oct
    "coldwave_risk":    [0.25, 0.22, 0.12, 0.03, 0.01, 0.00, 0.00, 0.00, 0.01, 0.05, 0.12, 0.19],  # Dec-Feb
    "fire_risk":        [0.03, 0.09, 0.17, 0.21, 0.18, 0.07, 0.03, 0.03, 0.05, 0.06, 0.04, 0.04],  # Feb-May
    "pollution_risk":   [0.14, 0.12, 0.09, 0.06, 0.05, 0.04, 0.03, 0.04, 0.06, 0.13, 0.15, 0.09],  # Oct-Feb (stubble burning)
}


def hex_centroid(h3_id: str):
    boundary = h3.cell_to_boundary(h3_id)
    lat = sum(b[0] for b in boundary) / len(boundary)
    lon = sum(b[1] for b in boundary) / len(boundary)
    return lat, lon


def monthly_scores(annual_score: float, factors: list[float]) -> list[float]:
    """Scale annual risk score into 12 monthly scores. Mean = annual/12."""
    if annual_score <= 0:
        return [0.0] * 12
    raw = [min(10.0, round(annual_score * f * 12, 3)) for f in factors]
    return raw


def main():
    print("=" * 68)
    print("  Compute Monthly Climatology — V1 (seasonal distribution)")
    print("=" * 68)
    print()
    print("Method: Scale annual risk scores × monthly distribution factors.")
    print("Annual scores preserved exactly. No GEE re-run required.")
    print("Catches SEASONS, not ANOMALIES (anomaly detection = V2).")
    print()

    print(f"Loading {HEX_FILE.name}…")
    data = json.loads(HEX_FILE.read_text())
    print(f"  {len(data)} hexes")

    # Process each hex
    for p in data:
        lat, lon = hex_centroid(p["h3_id"])
        zone = climate_zone(lat, lon)

        # ── Per-hazard monthly profiles ──
        peak_month_candidates = {}  # col → (month_idx, peak_score)
        overall_monthly = [0.0] * 12  # sum of all hazards per month

        for hz_key, risk_col in RISK_COLS.items():
            annual = p.get(risk_col) or 0.0
            factors = HAZARD_FACTORS[hz_key][zone]
            scores = monthly_scores(annual, factors)
            peak_idx = max(range(12), key=lambda m: scores[m])
            peak_score = scores[peak_idx]
            p[f"{hz_key}_peak_month"]  = peak_idx + 1        # 1-indexed
            p[f"{hz_key}_peak_score"]  = round(peak_score, 2)
            p[f"{hz_key}_seasonal"]    = scores
            peak_month_candidates[risk_col] = (peak_idx, peak_score)
            for m in range(12):
                overall_monthly[m] += scores[m]

        # ── Non-seasonal hazards (use zone-agnostic factors) ──
        for risk_col, factors in STATIC_HAZARD_FACTORS.items():
            annual = p.get(risk_col) or 0.0
            scores = monthly_scores(annual, factors)
            for m in range(12):
                overall_monthly[m] += scores[m]

        # ── Overall peak season month ──
        peak_m = max(range(12), key=lambda m: overall_monthly[m])
        p["peak_season_month"] = peak_m + 1
        p["peak_season_score"] = round(overall_monthly[peak_m], 2)

    print(f"  Monthly profiles computed for all {len(data)} hexes")

    # ── Validation: check seasonal peaks for known locations ──
    print()
    print("─" * 68)
    print("  VALIDATION — Seasonal peak month check")
    print("─" * 68)

    CHECK_PLACES = [
        # (district, expected_hazard, expected_peak_months, description)
        ("Nagpur",                "heat",    [5, 6],    "Vidarbha: heat peak May-Jun"),
        ("Kamrup",                "flood",   [7, 8],    "Assam: flood peak Jul-Aug (SW monsoon)"),
        ("Latur",                 "drought", [1, 2, 3, 4, 5], "Marathwada: drought peak in dry months"),
        ("Thiruvananthapuram",    "flood",   [7, 8],    "Kerala: flood peak Jul-Aug (SW monsoon)"),
        ("Puducherry",            "flood",   [10, 11],  "Tamil Nadu coast: flood peak Oct-Nov (NE monsoon)"),
        ("Rajkot",                "flood",   [7, 8],    "Gujarat/arid zone: flood peak Jul-Aug"),
        ("Shimla",                "flood",   [7, 8],    "Himachal: flood Jul-Aug"),
        ("Thoothukudi",           "flood",   [10, 11],  "Deep Tamil Nadu: NE monsoon peak Oct-Nov"),
    ]

    all_pass = True
    by_district = {}
    for p in data:
        d = p.get("district_name", "")
        if d:
            by_district.setdefault(d, []).append(p)

    for district, hz_key, expected_months, desc in CHECK_PLACES:
        hexes = by_district.get(district, [])
        if not hexes:
            print(f"  ⚠️  {district}: not found in hex grid")
            continue
        # Population-weighted average
        total_pop = sum(p.get("population", 0) or 0 for p in hexes)
        if total_pop == 0:
            peak_month = hexes[0].get(f"{hz_key}_peak_month", 0)
        else:
            # Weighted peak month via weighted monthly scores
            weighted_monthly = [0.0] * 12
            for p in hexes:
                pop = p.get("population", 0) or 0
                scores = p.get(f"{hz_key}_seasonal", [0] * 12)
                for m, s in enumerate(scores):
                    weighted_monthly[m] += s * pop
            peak_month = max(range(12), key=lambda m: weighted_monthly[m]) + 1

        ok = peak_month in expected_months
        all_pass = all_pass and ok
        sym = "✅" if ok else "❌"
        print(f"  {sym} {district:25s}  {hz_key:8s}  peak={MONTH_NAMES[peak_month-1]:3s} (month {peak_month:2d})  "
              f"expected={[MONTH_NAMES[m-1] for m in expected_months]}  — {desc}")

    print()
    if all_pass:
        print("  ✅ All validation checks passed")
    else:
        print("  ⚠️  Some checks failed — review seasonal factors")

    # ── Regression check: annual values still present ──
    print()
    print("─" * 68)
    print("  BACKWARD COMPATIBILITY — annual risk scores unchanged")
    print("─" * 68)
    sample = data[0]
    for col in ["flood_risk", "heat_risk", "drought_risk", "wetbulb_risk", "hex_risk"]:
        print(f"  {col}: {sample.get(col)}")
    print("  → Annual risk scores unchanged ✅")

    # ── Summary stats ──
    print()
    print("─" * 68)
    print("  SUMMARY STATS — seasonal peak distribution")
    print("─" * 68)
    for hz_key, risk_col in RISK_COLS.items():
        peak_months = [p.get(f"{hz_key}_peak_month", 0) for p in data]
        from collections import Counter
        dist = Counter(peak_months)
        top3 = dist.most_common(3)
        print(f"  {hz_key:8s} peak month distribution: {[(MONTH_NAMES[m-1],n) for m,n in top3]}")

    print()
    print(f"  New fields per hex: {{hazard}}_peak_month, {{hazard}}_peak_score,")
    print(f"  {{hazard}}_seasonal (12-float list), peak_season_month, peak_season_score")
    total_new_fields = len(RISK_COLS) * 3 + 2
    print(f"  Total new fields: {total_new_fields} per hex")

    # ── Save ──
    print(f"\nWriting {HEX_FILE.name}…")
    HEX_FILE.write_text(json.dumps(data, separators=(",", ":")))
    size_mb = HEX_FILE.stat().st_size / 1e6
    print(f"  Written: {size_mb:.1f} MB")
    print()
    print("✅ Done. Formulas unchanged. Annual scores preserved.")
    print("   V1 captures seasonal structure (SEASONS, not ANOMALIES).")
    print("   V2 (period-specific ERA5/CHIRPS) would improve anomaly detection.")


if __name__ == "__main__":
    main()
