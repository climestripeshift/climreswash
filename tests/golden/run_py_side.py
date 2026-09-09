"""Python side of the golden parity test: computes Tier-1 (pure formula
vectors) and Tier-2 (25 real hexes, shared weather scenario) outputs from
scripts/risk/formulas.py and scripts/risk/hex_risk.py, and writes them to
tests/golden/py_results.json for compare.py to diff against the TS side.

Run standalone: python3 tests/golden/run_py_side.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from risk.formulas import (
    compute_risk, drought_score, exposure_score, flood_sensitivity,
    heat_sensitivity, heatwave_score, pluvial_flood_score, wet_bulb_score,
)
from risk.hex_risk import build_wash_state_context, resolve_static_hex_inputs

GOLDEN_DIR = Path(__file__).resolve().parent


def run_tier1(vectors):
    out = {}
    out["pluvial_flood_score"] = [round(pluvial_flood_score(*v), 6) for v in vectors["pluvial_flood_score"]]
    out["heatwave_score"] = [round(heatwave_score(*v), 6) for v in vectors["heatwave_score"]]
    out["drought_score"] = [round(drought_score(v), 6) for v in vectors["drought_score"]]
    out["wet_bulb_score"] = [round(wet_bulb_score(*v), 6) for v in vectors["wet_bulb_score"]]
    out["exposure_score"] = [round(exposure_score(*v), 6) for v in vectors["exposure_score"]]
    out["flood_sensitivity"] = [round(flood_sensitivity(*v), 6) for v in vectors["flood_sensitivity"]]
    out["heat_sensitivity"] = [round(heat_sensitivity(*v), 6) for v in vectors["heat_sensitivity"]]
    out["compute_risk"] = [round(compute_risk(*v), 6) for v in vectors["compute_risk"]]
    return out


def run_tier2(hexes, scenario):
    wash_raw = json.loads((ROOT / "scripts/nfhs5_wash.json").read_text())
    mpi_raw  = json.loads((ROOT / "scripts/nfhs5_poverty_mpi.json").read_text())
    states = sorted({h["props"].get("state") for h in hexes if h["props"].get("state")})
    wash_by_state, state_ac = build_wash_state_context(states, wash_raw, mpi_raw)

    results = []
    hexes_with_rh = []  # written back out so the TS side uses the identical rh_pct
    for h in hexes:
        p, lat, lon = h["props"], h["lat"], h["lon"]
        inp = resolve_static_hex_inputs(p, lat, lon, wash_by_state, state_ac)

        elev = inp["elev"]
        dist_coast = inp["dist_coast"]
        # Same rh_proxy formula hex_risk.py uses for wet-bulb (compute_hex_risk,
        # the rh_proxy line) -- computed here so both sides use one shared value.
        ndvi = inp["ndvi"]
        rh_pct = min(95, 40 + ndvi * 40 + max(0, 20 - dist_coast / 10000))

        flood_haz = pluvial_flood_score(scenario["rainfall_mm"], inp["sand_pct"], inp["built_pct"], inp["slope"])
        flood_risk = compute_risk(flood_haz, inp["exposure_10"], inp["fs"], inp["ac"])

        threshold = 30.0 if elev > 800 else (37.0 if dist_coast < 50000 else 40.0)
        heat_haz = heatwave_score(scenario["tmax_c"], threshold, scenario["hot_days"], inp["built_pct"], inp["tree_pct"], inp["dist_w_heat"])
        heat_risk = compute_risk(heat_haz, inp["exposure_10"], inp["hs"], inp["ac"])

        wb_haz = wet_bulb_score(scenario["tmax_c"], rh_pct)
        wb_risk = compute_risk(wb_haz, inp["exposure_10"], inp["hs"], inp["ac"])

        results.append({
            "category": h["category"], "h3_id": p["h3_id"], "district": p.get("district_name"), "state": p.get("state"),
            "inputs": {
                "slope": round(inp["slope"], 3), "dist_w": round(inp["dist_w"], 1),
                "dist_w_heat": round(inp["dist_w_heat"], 1), "sand_pct": round(inp["sand_pct"], 1),
                "built_pct": round(inp["built_pct"], 1), "tree_pct": round(inp["tree_pct"], 1),
                "exposure_10": round(inp["exposure_10"], 3), "ac": round(inp["ac"], 4),
                "heat_threshold": threshold, "rh_pct": round(rh_pct, 2),
            },
            "sensitivity": {"flood": round(inp["fs"], 4), "heat": round(inp["hs"], 4)},
            "hazard": {"flood": round(flood_haz, 4), "heat": round(heat_haz, 4), "wetbulb": round(wb_haz, 4)},
            "risk": {"flood": round(flood_risk, 4), "heat": round(heat_risk, 4), "wetbulb": round(wb_risk, 4)},
        })
        hexes_with_rh.append({**h, "rh_pct": round(rh_pct, 2)})

    (GOLDEN_DIR / "hexes_with_scenario.json").write_text(json.dumps(hexes_with_rh, indent=1))
    return results


def main():
    scenario_def = json.loads((GOLDEN_DIR / "scenario.json").read_text())
    hexes = json.loads((GOLDEN_DIR / "hexes.json").read_text())

    tier1 = run_tier1(scenario_def["tier1_vectors"])
    tier2 = run_tier2(hexes, scenario_def["tier2_scenario"])

    out = {"tier1": tier1, "tier2": tier2}
    (GOLDEN_DIR / "py_results.json").write_text(json.dumps(out, indent=1))
    print(f"Python side: wrote tier1 ({sum(len(v) for v in tier1.values())} values) "
          f"+ tier2 ({len(tier2)} hexes) to py_results.json")


if __name__ == "__main__":
    main()
