"""
4-D heat status layer: hex (lat, lon) x month-of-year x climate scenario x horizon.

Answers "what is the heat status at place X in month M under scenario S / horizon H",
or for India/a state as a whole (aggregates in index.json).

Inputs
  data/raw/era5_monthly_temp/era5_t2m_afternoon_1991_2020.nc   (fetch_monthly_temp_climatology.py)
  client/public/data/india_hex_props.json                       (terrain, land cover, population)

Method (per hex, per month m)
  1. Baseline climatology 1991-2020: hottest afternoon-hour monthly mean 2m temperature (proxy for daily max), sampled at
     the hex centroid from the 0.25 deg ERA5 grid (bilinear).
  2. Hot-spell temperature  T_hot = Tmax_m + HOT_TAIL_C  (the monthly mean of daily max
     understates a heat-wave day; HOT_TAIL_C = 4.5 C is the IMD heat-wave departure from normal).
  3. Scenario warming  dT = WARMING[scenario][horizon]  (deg C vs the 1991-2020 baseline).
  4. Score = heatwave_score(T_hot, threshold, 3 days, built%, tree%, dist_water, warming_c=dT)
     with an elevation-smooth threshold (formulas.heat_threshold_smooth: 40 C plains / 37 C coastal,
     blending to 30 C between 500 and 1,500 m) instead of hex_risk.py's step at 800 m, which made
     plateau hexes just above 800 m score as hill stations.

ASSUMPTIONS (flagged, replace with data when available)
  * WARMING is derived in risk/scenarios.py from AR6 SPM.1 global rows (baseline shift 0.87 C, hot
    extremes x1.2), not per-hex CMIP6 deltas. It is spatially uniform and not month-specific.
  * HOT_TAIL_C = 4.5 C is IMD's heat-wave DEPARTURE criterion, used here as a fixed uplift for every hex
    and month. That is an uncalibrated assumption (the IMD figure classifies events; it does not estimate
    a month's extreme), so scores are a conditional proxy severity. Daily data would allow a per-hex T95.
  * Monthly resolution: day counts and true EHF need daily data (see ehf_score in formulas.py).

Outputs (client/public/data/heat_4d/)
  index.json           h3 ids, scenario/horizon metadata, warming table, bands, all-India and
                       per-state monthly aggregates for every combination
  {scenario}_{horizon}.json   {"score": [[12 ints, tenths of a point] per hex, index.json order]}

Run: python scripts/compute_heat_4d.py
"""
import json
import sys
from pathlib import Path

import h3
import netCDF4
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "scripts" / "risk"))
from formulas import heat_threshold_smooth, heatwave_score  # noqa: E402
from hazard_4d_common import sample_bilinear, write_layer  # noqa: E402

NC = ROOT / "data/raw/era5_monthly_temp/era5_t2m_afternoon_1991_2020.nc"
HEX_PROPS = ROOT / "client/public/data/india_hex_props.json"
OUT_DIR = ROOT / "client/public/data/heat_4d"

# IMD declares a heat wave at >=4.5 C above the normal daily max (severe: >=6.5 C). Used here as a
# fixed uplift for every hex and month: an ASSUMPTION, not an estimate of each month's extreme.
HOT_TAIL_C = 4.5
DURATION_DAYS = 3



def load_tmax_climatology():
    """Returns (lats, lons, tmax[12, nlat, nlon] in deg C): per calendar month, the hottest
    afternoon-hour monthly mean (06/09/12 UTC), averaged over all years."""
    ds = netCDF4.Dataset(NC)
    lats = np.array(ds["latitude"][:])
    lons = np.array(ds["longitude"][:])
    tv = "valid_time" if "valid_time" in ds.variables else "time"
    t = netCDF4.num2date(ds[tv][:], ds[tv].units, only_use_cftime_datetimes=False)
    months = np.array([x.month for x in t])
    hours = np.array([x.hour for x in t])
    data = np.ma.filled(ds["t2m"][:], np.nan).astype("float64") - 273.15
    clim = np.stack([
        np.nanmax([np.nanmean(data[(months == m) & (hours == h)], axis=0) for h in sorted(set(hours))], axis=0)
        for m in range(1, 13)
    ])
    return lats, lons, clim


def main():
    print("Loading ERA5 Tmax climatology...")
    lats, lons, tmax = load_tmax_climatology()
    props = json.loads(HEX_PROPS.read_text())
    print(f"  {len(props)} hexes")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    hex_inputs = []
    for p in props:
        lat, lon = h3.cell_to_latlng(p["h3_id"])
        t_m = [sample_bilinear(lats, lons, tmax[m], lat, lon) for m in range(12)]
        elev = p.get("elevation_mean")
        elev = 200.0 if elev is None else elev
        coast = p.get("dist_coast_m")
        coast = 1e9 if coast is None else coast
        threshold = heat_threshold_smooth(elev, coast)
        river = p.get("dist_to_river_km")
        dw = p.get("dist_water_m")
        dw = 30000.0 if dw is None else dw
        dist_w = min(float(river) * 1000, dw) if river is not None else dw
        hex_inputs.append({
            "t_m": t_m, "threshold": threshold,
            "built": p.get("lc_built_pct") or 0.0, "tree": p.get("lc_tree_pct") or 0.0,
            "dist_w": dist_w, "pop": p.get("population") or 0.0, "state": p.get("state") or "",
        })

    def score_fn(i, ssp, hz, dt):
        hx = hex_inputs[i]
        return [round(heatwave_score(t + HOT_TAIL_C, hx["threshold"], DURATION_DAYS,
                                     hx["built"], hx["tree"], hx["dist_w"], dt) * 10)
                for t in hx["t_m"]]

    write_layer(OUT_DIR, props, [h["pop"] for h in hex_inputs], [h["state"] for h in hex_inputs], score_fn,
                {"hot_tail_c": HOT_TAIL_C},
                "Approximate AR6-derived warming, uniform in space and month; see compute_heat_4d.py")


if __name__ == "__main__":
    main()
