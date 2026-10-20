"""
4-D landslide and flash-flood layers: hex (lat, lon) x month-of-year x scenario x horizon.

Both are "susceptibility x rain trigger" (the international pattern); they share the rainfall
seasonality used by the flood layer and differ in terrain terms. The legacy engine channels had only
the static terrain half (no season, no rain), so landslide peaked on dry Leh.

Inputs
  data/raw/era5_monthly_precip/era5_tp_1991_2020.nc   (fetch_monthly_precip_climatology.py)
  client/public/data/india_hex_grid.geojson           (flood_days_per_year = CHIRPS days > 50 mm)
  client/public/data/india_hex_props.json             (rain_rp10_mm, population, state)
  terrain / cover via risk.hex_risk.resolve_static_hex_inputs (NDVI, built %, sand %, water distance);
  slope = slope_p90_deg (steepest decile of the hex, from the geojson) rather than the hex mean

Method (per hex, per month m)
  trigger_m = min(1, 10-yr daily rain x intensification / ref) x (1 - exp(-expected >50 mm days in m))
              ref = 150 mm (landslide) / 100 mm (flash flood); intensification = 1 + 7 %/C x mean warming
  landslide   = 10 x landslide_susceptibility(slope, NDVI) x trigger
  flash flood = 10 x flash_flood_susceptibility(slope, built, sand, NDVI, dist to water) x trigger

ASSUMPTIONS (flagged)
  * Susceptibility weights and the 150 / 100 mm references are uncalibrated engineering choices;
    geology, soil depth, roads, forest loss and catchment area are not available.
  * Heavy-rain days are spread over months in proportion to monthly mean precipitation.
  * Warming is the approximate uniform AR6 table (mean warming), +7 %/C on depth and day-count.
  * 678 hexes (J&K 387, Ladakh 289, Arunachal 2) have no recorded flood_days: they are stored as
    NO ESTIMATE (-1) and excluded from every aggregate; the page shows them as 'no estimate'.
  * UNEXPLAINED: 209 hexes (Arunachal 155, J&K 48, Assam 6) record 0 heavy-rain days although their
    10-yr daily rain exceeds 100 mm. The cause is not established (a different sampling period or
    a data gap), so they are kept as recorded zeros and flagged in the report, not patched.
  * No antecedent-moisture, snowmelt or glacial-lake (GLOF) processes.

Outputs: client/public/data/landslide_4d/ and flashflood_4d/ (same schema as heat_4d/)

Run: python scripts/compute_rain_hazards_4d.py
"""
import json
import sys
from pathlib import Path

import h3

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "scripts" / "risk"))
from formulas import flash_flood_hazard_seasonal, landslide_hazard_seasonal  # noqa: E402
from hazard_4d_common import NO_ESTIMATE, load_precip_monthly, rain_season, write_layer  # noqa: E402
from risk.hex_risk import resolve_static_hex_inputs  # noqa: E402
from scenarios import WARMING, mean_warming  # noqa: E402

NC = ROOT / "data/raw/era5_monthly_precip/era5_tp_1991_2020.nc"
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
HEX_GEO = ROOT / "client/public/data/india_hex_grid.geojson"
STATE_AC = ROOT / "client/public/data/state_ac.json"


def main():
    print("Loading ERA5 precipitation climatology...")
    lats, lons, precip = load_precip_monthly(NC)
    props = json.loads(HEX_PROPS.read_text())
    state_ac = json.loads(STATE_AC.read_text())
    geo = {f["properties"]["h3_id"]: f["properties"] for f in json.loads(HEX_GEO.read_text())["features"]}
    flood_days = {h: g.get("flood_days_per_year") for h, g in geo.items()}
    print(f"  {len(props)} hexes")

    hx = []
    for p in props:
        lat, lon = h3.cell_to_latlng(p["h3_id"])
        inp = resolve_static_hex_inputs(p, lat, lon, {}, state_ac)
        _, heavy_days = rain_season(lats, lons, precip, lat, lon, flood_days.get(p["h3_id"]))  # None = not recorded
        hx.append({
            # steepest-decile slope of the hex's 90 m DEM cells: slides and flash floods start on the steep
            # parts, which a 252 km2 hex mean hides (Wayanad mean 5.8 deg, p90 far higher)
            "slope": geo[p["h3_id"]].get("slope_p90_deg") or inp["slope"], "ndvi": inp["ndvi"], "built": inp["built_pct"], "sand": inp["sand_pct"],
            "dist_w": inp["dist_w"], "rp10": float(p.get("rain_rp10_mm") or 0.0), "heavy": heavy_days,
        })
    pops = [p.get("population") or 0.0 for p in props]
    states = [p.get("state") or "" for p in props]
    extra = {"mean_warming_c": {s: {h: mean_warming(s, h) for h in hs} for s, hs in WARMING.items()},
             "intensification_per_c": 0.07,
             "month_note": "Calendar month: expected heavy-rain (>50 mm) days that month x the hex's 10-yr daily storm, over terrain susceptibility."}

    def _row(i, fn, ssp, hz):
        if hx[i]["heavy"] is None:               # missing rainfall observation: NO ESTIMATE, not zero hazard
            return [NO_ESTIMATE] * 12
        return [round(fn(m) * 10) for m in range(12)]

    def _dt(ssp, hz):
        return mean_warming(ssp, hz) if ssp != "baseline" else 0.0

    print("Landslide")
    write_layer(ROOT / "client/public/data/landslide_4d", props, pops, states,
                lambda i, ssp, hz, _h: _row(i, lambda m: landslide_hazard_seasonal(
                    hx[i]["slope"], hx[i]["ndvi"], hx[i]["rp10"], hx[i]["heavy"][m], _dt(ssp, hz)), ssp, hz),
                extra, "Slope x vegetation susceptibility x seasonal heavy-rain trigger (ERA5 seasonality, CHIRPS heavy days); "
                       "AR6-derived uniform warming; see compute_rain_hazards_4d.py")
    print("Flash flood")
    write_layer(ROOT / "client/public/data/flashflood_4d", props, pops, states,
                lambda i, ssp, hz, _h: _row(i, lambda m: flash_flood_hazard_seasonal(
                    hx[i]["slope"], hx[i]["built"], hx[i]["sand"], hx[i]["ndvi"], hx[i]["dist_w"],
                    hx[i]["rp10"], hx[i]["heavy"][m], _dt(ssp, hz)), ssp, hz),
                extra, "FFPI-style susceptibility (slope, runoff, sparse vegetation, channel proximity) x seasonal heavy-rain "
                       "trigger; AR6-derived uniform warming; see compute_rain_hazards_4d.py")


if __name__ == "__main__":
    main()
