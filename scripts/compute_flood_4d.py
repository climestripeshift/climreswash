"""
4-D flood status layer: hex (lat, lon) x month-of-year x climate scenario x horizon.

Answers "what is the flood hazard at place X in month M under scenario S / horizon H",
or for India/a state as a whole (aggregates in index.json). Same file layout as
compute_heat_4d.py, so one page (/flood-4d) renders it.

Inputs
  data/raw/era5_monthly_precip/era5_tp_1991_2020.nc  (fetch_monthly_precip_climatology.py)
  client/public/data/india_hex_grid.geojson          (flood_days_per_year)
  client/public/data/india_hex_props.json            (rain_rp10_mm, floodplain_pct, flat_pct, land cover, population)
  client/public/data/state_ac.json                    (via resolve_static_hex_inputs, as the risk engine)

Method (per hex, per month m)
  1. Seasonal shape: ERA5 1991-2020 mean precipitation of month m / wettest month, sampled at
     the hex centroid (bilinear)  -> season_share in 0..1.
  2. Heavy-rain days: the hex's flood_days_per_year (CHIRPS days > 50 mm, in the geojson) spread
     over the year in proportion to monthly precipitation -> expected heavy days in month m.
  3. Warming: mean warming dT_mean (scenarios.mean_warming); storm depth, heavy-day count and
     river-flood potential are intensified by 1 + 7 %/C x dT_mean (Clausius-Clapeyron).
  4. Score = flood_hazard_seasonal(...) = soft_cap(max(pluvial, riverine)):
       severity = IMD_table(hex 10-yr 24 h rain x intensification) x pluvial_ponding_modifier(flat, built, sand)
                  (modifier bounded 0.5-1.5, flood review v2 §3.1; NOT the legacy /slope x3.3 form)
       pluvial  = severity x (1 - exp(-heavy days in month / 1 day))
       riverine = floodplain_pct/10 x season_share x intensification

ASSUMPTIONS (flagged)
  * Heavy days are spread over months in proportion to monthly mean precipitation (no daily data).
  * The 1-day/month occurrence reference is an assumption. The 678 J&K/Ladakh hexes have no
    flood_days: their pluvial part is 0 (riverine still applies).
  * Warming is the approximate, spatially uniform AR6 table in risk/scenarios.py. Monsoon timing
    shifts, changes in seasonal totals, sea-level rise and cyclone surge are NOT modelled.
  * The ponding-modifier weights (0.5 flat / 0.3 built / 0.2 clay) are uncalibrated.

Outputs (client/public/data/flood_4d/)  -- same schema as heat_4d/
  index.json, {scenario}_{horizon}.json ({"score": [[12 ints, tenths of a point] per hex]})

Run: python scripts/compute_flood_4d.py
"""
import json
import sys
from pathlib import Path

import h3

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "scripts" / "risk"))
from formulas import flood_hazard_seasonal  # noqa: E402
from scenarios import WARMING, mean_warming  # noqa: E402
from hazard_4d_common import load_precip_monthly, rain_season, write_layer  # noqa: E402
from risk.hex_risk import resolve_static_hex_inputs  # noqa: E402

NC = ROOT / "data/raw/era5_monthly_precip/era5_tp_1991_2020.nc"
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
HEX_GEO = ROOT / "client/public/data/india_hex_grid.geojson"
STATE_AC = ROOT / "client/public/data/state_ac.json"
OUT_DIR = ROOT / "client/public/data/flood_4d"


def main():
    print("Loading ERA5 precipitation climatology...")
    lats, lons, precip = load_precip_monthly(NC)
    props = json.loads(HEX_PROPS.read_text())
    state_ac = json.loads(STATE_AC.read_text())
    flood_days = {f["properties"]["h3_id"]: f["properties"].get("flood_days_per_year")
                  for f in json.loads(HEX_GEO.read_text())["features"]}
    print(f"  {len(props)} hexes")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    hex_inputs = []
    for p in props:
        lat, lon = h3.cell_to_latlng(p["h3_id"])
        inp = resolve_static_hex_inputs(p, lat, lon, {}, state_ac)
        share, heavy_days = rain_season(lats, lons, precip, lat, lon, flood_days.get(p["h3_id"]))
        partial = heavy_days is None  # heavy-rain days not recorded: pluvial part unknown
        if partial:
            heavy_days = [0.0] * 12   # riverine part is still computed; score is a LOWER BOUND
        hex_inputs.append({
            "share": share, "rp10": float(p.get("rain_rp10_mm") or 0.0),
            "heavy_days": heavy_days, "partial": partial,
            "sand": inp["sand_pct"], "built": inp["built_pct"], "flat": float(p.get("flat_pct") or 0.0),
            "floodplain": float(p.get("floodplain_pct") or 0.0),
            "pop": p.get("population") or 0.0, "state": p.get("state") or "",
        })

    def score_fn(i, ssp, hz, _hot):
        hx = hex_inputs[i]
        dt = mean_warming(ssp, hz) if ssp != "baseline" else 0.0
        return [round(flood_hazard_seasonal(hx["rp10"], hx["sand"], hx["built"], hx["flat"],
                                            hx["floodplain"], hx["heavy_days"][m], hx["share"][m], dt) * 10)
                for m in range(12)]

    write_layer(OUT_DIR, props, [h["pop"] for h in hex_inputs], [h["state"] for h in hex_inputs], score_fn,
                {"mean_warming_c": {s: {h: mean_warming(s, h) for h in hs} for s, hs in WARMING.items()},
                 "intensification_per_c": 0.07,
                 "partial_pluvial_hexes": sum(1 for h in hex_inputs if h["partial"]),
                 "coverage_note": "Hexes without recorded heavy-rain days (J&K, Ladakh, 2 in Arunachal) show the river-flood part only: a lower bound."},
                "ERA5 monthly seasonality x hex 10-yr 24h storm; AR6-derived uniform warming; see compute_flood_4d.py")


if __name__ == "__main__":
    main()
