"""
Patch drought_risk in india_hex_props.json using drought_freq raster as a severity floor.

Root cause: NDVI-based SPI proxy underestimates drought in irrigated arid zones (Thar
belt) and seasonally-green drought-prone regions (Deccan/Marathwada). The drought_freq
raster correctly captures chronic aridity independently of vegetation cover.

Fix: drought_sev = max(ndvi_based_sev, freq_based_sev)
     where freq_based_sev = min(10, drought_freq * 15)

Also updates hex_risk where drought_risk now exceeds the previous hex_risk.

Run: python scripts/fix_drought_aridity.py
"""
import json
import sys
import math
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

import h3
import rasterio
from rasterio.windows import from_bounds

ROOT       = Path(__file__).resolve().parent.parent
HEX_PROPS  = ROOT / "client/public/data/india_hex_props.json"
RASTER     = ROOT / "data/raw/climatology/drought_freq.tif"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from risk.formulas import drought_score, compute_risk, exposure_score

LAND_USE_SAND = {
    "tree": 20, "shrub": 35, "grass": 30, "crop": 25, "built": 15,
    "barren": 75, "water": 10, "wetland": 10, "snow": 5, "mangrove": 15,
}

OCCURRENCE_REF = 0.15
DURATION_REF   = 0.5
CHRONIC_WEIGHT = 0.5
GW_WEIGHT      = 0.5
AC_GW_PENALTY  = 0.2
AC_EFFECTIVENESS_DROUGHT = 0.8

HAZARD_COLS = [
    "flood_risk", "heat_risk", "cyclone_risk", "drought_risk", "wetbulb_risk",
    "landslide_risk", "coldwave_risk", "flashflood_risk", "sealevel_risk",
    "fire_risk", "pollution_risk",
]


def sample_hex_drought_freq(src, h3_id: str) -> float:
    """Mean drought_freq within hex bounding box (fast, sufficient for aridity)."""
    boundary = h3.cell_to_boundary(h3_id)
    lats = [b[0] for b in boundary]
    lngs = [b[1] for b in boundary]
    try:
        window = from_bounds(min(lngs), min(lats), max(lngs), max(lats), src.transform)
        window = window.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
        if window.width < 1 or window.height < 1:
            return 0.0
        data = src.read(1, window=window)
        valid = data[(data > -9999) & (~(data != data))]  # exclude nodata and nan
        return float(valid.mean()) if len(valid) > 0 else 0.0
    except Exception:
        return 0.0


def recompute_drought_risk(p: dict, drought_freq: float) -> float:
    """Recompute drought_risk for a hex using the corrected aridity formula."""
    ndvi     = float(p.get("ndvi_mean", 0.3) or 0.3)
    lu       = str(p.get("land_use", "crop") or "crop")
    sand_pct = LAND_USE_SAND.get(lu, 30)
    pop      = int(p.get("population", 10000) or 10000)
    ac_base  = float(p.get("adaptive_capacity", 0.7) or 0.7)
    gw       = float(p.get("gw_stress_score", 0.1) or 0.1)

    # Severity: max of NDVI proxy and frequency floor
    spi_proxy = (ndvi - 0.4) * 3
    if sand_pct > 50:
        spi_proxy -= 0.5
    drought_sev_ndvi = drought_score(spi_proxy)
    drought_sev_freq = min(10.0, drought_freq * 15.0)
    drought_sev = max(drought_sev_ndvi, drought_sev_freq)

    # Occurrence and chronic factor (drought_freq ≈ months-fraction, ~0–0.7)
    drought_days = drought_freq
    occurrence = min(1.0, drought_days / OCCURRENCE_REF) if drought_days > 0 else 0.0
    drought_haz = drought_sev * occurrence
    if occurrence > 0:
        duration = min(1.0, drought_days / DURATION_REF)
        chronic_factor = 1.0 + CHRONIC_WEIGHT * duration
        drought_haz *= chronic_factor

    # Exposure (fixed demographic fractions matching join_hex_districts.py)
    exposure_10 = exposure_score(max(1, pop), 9, 8, 25)

    # Sensitivity
    sens_base = 0.5 + 0.3 * (1 - ndvi) + 0.2 * (sand_pct / 100)
    drought_sens = min(1.0, sens_base * (1 + GW_WEIGHT * gw))

    # Adaptive capacity with GW penalty
    ac = max(0.1, ac_base * (1 - AC_GW_PENALTY * gw)) * AC_EFFECTIVENESS_DROUGHT

    return compute_risk(drought_haz, exposure_10, drought_sens, ac)


def main():
    if not RASTER.exists():
        print(f"ERROR: {RASTER} not found. Run compute_likelihood.py first.")
        return

    print(f"Loading {HEX_PROPS}...")
    with open(HEX_PROPS) as f:
        props = json.load(f)
    print(f"  {len(props)} hexes")

    print("Patching drought_risk with aridity floor from drought_freq.tif...")
    updated = 0
    hex_risk_bumped = 0

    with rasterio.open(str(RASTER)) as src:
        for i, p in enumerate(props):
            drought_freq = sample_hex_drought_freq(src, p["h3_id"])
            old_drought  = float(p.get("drought_risk", 0) or 0)
            new_drought  = round(recompute_drought_risk(p, drought_freq), 2)

            if new_drought > old_drought + 0.05:
                p["drought_risk"] = new_drought
                updated += 1

                # Recompute hex_risk: infer cascade_amp from old values
                old_hex   = float(p.get("hex_risk", 0) or 0)
                old_max_h = max(float(p.get(c, 0) or 0) for c in HAZARD_COLS)
                cascade_amp = max(0.0, round(old_hex - old_max_h, 4))

                new_hazard_risks = [float(p.get(c, 0) or 0) for c in HAZARD_COLS]
                # drought_risk is already updated in p above
                new_max_h = max(new_hazard_risks)
                new_hex   = round(min(10.0, new_max_h + cascade_amp), 2)
                if new_hex > old_hex:
                    p["hex_risk"] = new_hex
                    hex_risk_bumped += 1

            if (i + 1) % 2000 == 0:
                print(f"  [{i+1}/{len(props)}] {updated} drought_risk updated")

    print(f"\n  Done: {updated} drought_risk updated, {hex_risk_bumped} hex_risk bumped")

    # Spot-check
    check_districts = ["Jaisalmer", "Barmer", "Jodhpur", "Nagaur", "Latur", "Solapur", "Anantapur"]
    print("\nSpot-check (avg drought_risk per district):")
    for dist in check_districts:
        hexes = [p for p in props if p.get("district_name") == dist]
        if hexes:
            avg = sum(h.get("drought_risk", 0) for h in hexes) / len(hexes)
            print(f"  {dist:20s}: {avg:.2f}  ({len(hexes)} hexes)")

    print(f"\nSaving {HEX_PROPS}...")
    with open(HEX_PROPS, "w") as f:
        json.dump(props, f, separators=(",", ":"))
    print("Done.")


if __name__ == "__main__":
    main()
