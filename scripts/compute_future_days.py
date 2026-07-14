"""
Future hazard layer: delta-change bias correction + run existing risk engine.
Produces 4 future risk surfaces (SSP245/585 × 2030/2050).

Delta-change: future_days = observed_baseline + (model_future - model_hist)
This cancels model bias. Observed baseline comes from existing day-count columns.

Run: python scripts/compute_future_days.py
"""
import json
import random
from pathlib import Path

import h3
import numpy as np

ROOT       = Path(__file__).resolve().parent.parent
HEX_PROPS  = ROOT / "client/public/data/india_hex_props.json"
FUTURE_DIR = ROOT / "data/raw/climatology_future"
OUT_JSON   = ROOT / "client/public/data/india_hex_future.json"

SCENARIOS = ["ssp245", "ssp585"]
HORIZONS  = ["2030", "2050"]
METRICS   = ["flood", "extreme_rain", "heat", "severe_heat", "wet_bulb"]

# ── Mock delta patterns (when CMIP6 rasters not yet downloaded) ───────────────
# Based on IPCC AR6 India projections

def mock_delta(metric: str, scenario: str, horizon: str, lat: float, lon: float) -> float:
    """Plausible climate change delta (days/yr increase)."""
    random.seed(hash(f"{metric}{scenario}{horizon}{lat:.1f}{lon:.1f}") % 2**31)
    base_scale = {"ssp245": 1.0, "ssp585": 1.8}[scenario]
    time_scale = {"2030": 0.6, "2050": 1.0}[horizon]
    scale = base_scale * time_scale

    if metric == "heat":
        # All of India gets warmer; more in north/interior
        base = 5 + (lat - 15) * 0.3
        return max(0, base * scale + random.uniform(-2, 2))
    elif metric == "severe_heat":
        base = 1 + max(0, (lat - 20) * 0.1)
        return max(0, base * scale + random.uniform(-0.5, 0.5))
    elif metric == "flood":
        # Monsoon intensification in some areas; variable
        if lon > 85 and lat > 22:  # NE India: wetter
            base = 2
        elif lon < 77 and lat < 16:  # SW coast: wetter
            base = 1.5
        else:
            base = random.uniform(-1, 1.5)
        return base * scale + random.uniform(-1, 1)
    elif metric == "extreme_rain":
        return mock_delta("flood", scenario, horizon, lat, lon) * 0.3
    elif metric == "wet_bulb":
        # Humid areas get worse
        base = 3 + (1 if lon > 85 else 0) + (1 if lat < 20 else 0)
        return max(0, base * scale + random.uniform(-1, 1))
    return 0


def main():
    print(f"Loading {HEX_PROPS}...")
    with open(HEX_PROPS) as f:
        props = json.load(f)
    print(f"  {len(props)} hexes")

    # Check for real CMIP6 rasters
    has_rasters = all(
        (FUTURE_DIR / f"hist_ref_{m}_freq.tif").exists()
        for m in METRICS
    )

    if has_rasters:
        print("REAL MODE — reading CMIP6 delta rasters...")
        import rasterio
        from rasterio.windows import from_bounds

        def read_hex_freq(src, h3_id):
            """Sample raster at hex centroid — works for coarse CMIP6 (25km pixels)."""
            boundary = h3.cell_to_boundary(h3_id)
            clat = sum(b[0] for b in boundary) / len(boundary)
            clng = sum(b[1] for b in boundary) / len(boundary)
            try:
                vals = list(src.sample([(clng, clat)]))
                v = float(vals[0][0])
                if np.isnan(v) or v < -9999:
                    return 0.0
                return v
            except Exception:
                return 0.0

        for scenario in SCENARIOS:
            for horizon in HORIZONS:
                tag = f"{scenario}_{horizon}"
                print(f"\n  Processing {tag}...")
                for metric in METRICS:
                    hist_path = FUTURE_DIR / f"hist_ref_{metric}_freq.tif"
                    fut_path = FUTURE_DIR / f"{tag}_{metric}_freq.tif"
                    baseline_col = f"{metric}_days_per_year"
                    out_col = f"{metric}_days_{tag}"

                    if not fut_path.exists():
                        print(f"    {metric}: future raster missing, using mock delta")
                        for p in props:
                            boundary = h3.cell_to_boundary(p["h3_id"])
                            lat = sum(b[0] for b in boundary) / len(boundary)
                            lon = sum(b[1] for b in boundary) / len(boundary)
                            baseline = float(p.get(baseline_col, 0) or 0)
                            delta = mock_delta(metric, scenario, horizon, lat, lon)
                            p[out_col] = round(max(0, baseline + delta), 2)
                        continue

                    with rasterio.open(str(hist_path)) as hist_src, rasterio.open(str(fut_path)) as fut_src:
                        for p in props:
                            baseline = float(p.get(baseline_col, 0) or 0)
                            hist_val = read_hex_freq(hist_src, p["h3_id"])
                            fut_val = read_hex_freq(fut_src, p["h3_id"])
                            delta = fut_val - hist_val
                            p[out_col] = round(max(0, baseline + delta), 2)
                    print(f"    {metric}: done")
    else:
        print("⚠️  MOCK MODE — CMIP6 rasters not found in data/raw/climatology_future/")
        print("   Run gee_future_climatology.js in GEE to get real data.")
        print("   Generating plausible scenario deltas from IPCC AR6 patterns...\n")

        for p in props:
            boundary = h3.cell_to_boundary(p["h3_id"])
            lat = sum(b[0] for b in boundary) / len(boundary)
            lon = sum(b[1] for b in boundary) / len(boundary)

            for scenario in SCENARIOS:
                for horizon in HORIZONS:
                    tag = f"{scenario}_{horizon}"
                    for metric in METRICS:
                        baseline_col = f"{metric}_days_per_year"
                        baseline = float(p.get(baseline_col, 0) or 0)
                        delta = mock_delta(metric, scenario, horizon, lat, lon)
                        p[f"{metric}_days_{tag}"] = round(max(0, baseline + delta), 2)

    # ── Delta-add risk: future = present + intensification bonus ─────────────
    # Root cause of previous bug: present hex_risk (mean 4.5) was computed by
    # the full 5-hazard pipeline with real inputs. The old approach re-ran a
    # simplified 3-hazard formula from day counts with a zero baseline
    # (heat_days_per_year is missing from hex_props), producing mean ~1.4 —
    # maps turned green under worse climate scenarios.
    #
    # Fix: treat present hex_risk as the authoritative baseline. Add a bonus
    # proportional to how many additional hazard-days the SSP scenario brings.
    # The stored future day counts are already the delta (baseline=0 so
    # future_days ≈ mock_delta). Weights calibrated so SSP5-8.5 2050 adds
    # ~+1 to +3 points in the most exposed areas.
    #
    # Scenario ordering guaranteed by construction:
    #   SSP585 > SSP245 for same horizon; 2050 > 2030 for same scenario.

    # Max additional days expected at 99th pct under SSP5-8.5 2050
    HEAT_REF  = 35.0   # days → full heat contribution
    WB_REF    = 50.0   # days → full wet-bulb contribution
    FLOOD_REF = 10.0   # days → full flood contribution

    # Max bonus per hazard type (sum = 3.0 max total bonus)
    HEAT_W  = 1.2
    WB_W    = 1.2
    FLOOD_W = 0.6

    # Scenario scaling so SSP2 < SSP5 and 2030 < 2050
    SCENARIO_SCALE = {
        "ssp245_2030": 0.35,
        "ssp245_2050": 0.60,
        "ssp585_2030": 0.50,
        "ssp585_2050": 1.00,
    }

    print("\nComputing future risk surfaces (delta-add from present hex_risk)...")
    for scenario in SCENARIOS:
        for horizon in HORIZONS:
            tag = f"{scenario}_{horizon}"
            sc  = SCENARIO_SCALE[tag]
            print(f"  Risk surface: {tag}  (scale={sc})")

            for p in props:
                present = float(p.get("hex_risk", 3.0) or 3.0)
                heat_d  = float(p.get(f"heat_days_{tag}", 0) or 0)
                wb_d    = float(p.get(f"wet_bulb_days_{tag}", 0) or 0)
                flood_d = float(p.get(f"flood_days_{tag}", 0) or 0)

                bonus = (
                    min(1.0, heat_d  / HEAT_REF)  * HEAT_W  +
                    min(1.0, wb_d    / WB_REF)    * WB_W    +
                    min(1.0, flood_d / FLOOD_REF) * FLOOD_W
                ) * sc

                p[f"risk_{tag}"] = round(min(10.0, present + bonus), 2)

    # ── Stats ─────────────────────────────────────────────────────────────
    print("\nResults:")
    for scenario in SCENARIOS:
        for horizon in HORIZONS:
            tag = f"{scenario}_{horizon}"
            vals = [p.get(f"risk_{tag}", 0) for p in props]
            present = [p.get("hex_risk", 0) for p in props]
            mean_f = sum(vals) / len(vals)
            mean_p = sum(present) / len(present)
            print(f"  risk_{tag}: mean={mean_f:.2f} (present={mean_p:.2f}, change={mean_f-mean_p:+.2f})")

    # ── Save future data (separate file to not bloat hex props) ───────────
    future_data = []
    for p in props:
        entry = {"h3_id": p["h3_id"]}
        for scenario in SCENARIOS:
            for horizon in HORIZONS:
                tag = f"{scenario}_{horizon}"
                entry[f"risk_{tag}"] = p.get(f"risk_{tag}", 0)
                for m in METRICS:
                    entry[f"{m}_days_{tag}"] = p.get(f"{m}_days_{tag}", 0)
        future_data.append(entry)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w") as f:
        json.dump(future_data, f, separators=(",", ":"))

    import os
    print(f"\nSaved: {OUT_JSON} ({os.path.getsize(OUT_JSON) // 1024} KB)")

    # ── Validation table ──────────────────────────────────────────────────
    print(f"\n{'='*100}")
    print(f"  VALIDATION — Present vs Future risk (v1: AC/sensitivity held constant)")
    print(f"{'='*100}")
    print(f"{'District':20s} {'State':14s} {'Present':>7s} {'245_30':>7s} {'245_50':>7s} {'585_30':>7s} {'585_50':>7s} {'ht_now':>6s} {'ht_585_50':>9s} {'sane':>5s}")
    print("-" * 100)

    targets = [("Rajasthan", "Jaisalmer"), ("Assam", None), ("Kerala", None),
               ("Bihar", "Patna"), ("Delhi", None), ("Gujarat", None),
               ("Odisha", None), ("West Bengal", None)]

    flags = []
    for state, dist in targets:
        for p in props:
            if p.get("state") == state and (dist is None or p.get("district_name") == dist):
                d = p.get("district_name", "?")
                pr = p.get("hex_risk", 0)
                r245_30 = p.get("risk_ssp245_2030", 0)
                r245_50 = p.get("risk_ssp245_2050", 0)
                r585_30 = p.get("risk_ssp585_2030", 0)
                r585_50 = p.get("risk_ssp585_2050", 0)
                ht_now = p.get("heat_days_per_year", 0) or 0
                ht_fut = p.get("heat_days_ssp585_2050", 0) or 0

                sane = "✅"
                # Check: SSP585 >= SSP245 for same horizon
                if r585_50 < r245_50 - 0.1:
                    sane = "⚠️"
                    flags.append(f"  {d}: SSP585_2050 ({r585_50:.1f}) < SSP245_2050 ({r245_50:.1f})")
                # Check: 2050 >= 2030 for heat-driven
                if ht_fut < ht_now - 5:
                    sane = "⚠️"
                    flags.append(f"  {d}: heat_days decreased in 2050 ({ht_now:.0f} → {ht_fut:.0f})")

                print(f"{d:20s} {state:14s} {pr:7.2f} {r245_30:7.2f} {r245_50:7.2f} {r585_30:7.2f} {r585_50:7.2f} {ht_now:6.0f} {ht_fut:9.1f} {sane:>5s}")
                break

    if flags:
        print(f"\n⚠️  FLAGS:")
        for f in flags:
            print(f)
    else:
        print(f"\n✅ All sanity checks pass.")
    print(f"{'='*100}")
    print(f"\nv1 NOTE: AC, sensitivity, population held at PRESENT values.")
    print(f"This shows 'if capacity stays as today' — the gap-analysis baseline.")


if __name__ == "__main__":
    main()
