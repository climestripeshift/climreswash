"""
DIAGNOSTIC ONLY — DO NOT RUN (causes regression on Himalayan districts).

This script was written to diagnose and attempt to fix Wayanad landslide = 0.
It was run, revealed a regression (Uttarkashi 2.57→1.09, Chamoli 2.67→1.55),
and reverted (india_hex_props.json restored from git). The TRUE fix is V2 SRTM
sub-km raster slope ingestion.

---
Original intent: Fix Wayanad landslide score near-zero due to elevation proxy below gate.

ROOT CAUSE (systemic, not Wayanad-specific):
- slope_deg = None for ALL 12,705 hexes — compute_slope_water.py was never run
- Fallback estimate_slope(745m) = 3.0° — BELOW the 5° landslide gate → ls_r = 0
- H3-macro slopes (neighbor elevation diff / 15.1km edge) underestimate real
  SRTM slopes by 3-5x at resolution 5 (~252km²/hex). This is a resolution effect,
  not a data error.
- Plains (Varanasi, Patna, Deccan): H3 macro-slope = 0.03–0.6° — safe at any gate
- Wayanad (escarpment): H3 macro-slope = 1.9–4.8° — right to flag, wrong to gate out

FIX:
1. Compute H3-neighbor slope for every hex (max |elev diff| to 6 neighbors ÷ edge dist)
2. Lower landslide gate from 5° → 3° — calibrated for H3-macro resolution:
   3° macro ≈ 10-15° SRTM slope (genuinely steep terrain)
3. Recompute landslide_risk and hex_risk. All other hazards unchanged.

NOTE: TRUE fix = SRTM sub-km raster slope (V2 upgrade). H3-macro slope is a
meaningful proxy but still underestimates escarpment steepness. Run this patch
until real SRTM slopes are ingested via fetch_elevation / compute_slope_water.

Run: python scripts/patch_wayanad_landslide.py
"""
import json, math
from pathlib import Path
import h3

ROOT = Path(__file__).resolve().parent.parent
HEX_FILE = ROOT / "client/public/data/india_hex_props.json"
HEX_EDGE_KM = 15.1   # H3 resolution 5 approximate edge length
LANDSLIDE_GATE = 3.0  # degrees — lowered from 5° for H3-macro scale (was 5°)

HAZARD_KEYS = [
    "flood_risk", "heat_risk", "cyclone_risk", "drought_risk", "wetbulb_risk",
    "landslide_risk", "coldwave_risk", "flashflood_risk", "sealevel_risk",
    "fire_risk", "pollution_risk",
]

CHECK_STEEP = ["Wayanad", "Idukki", "Uttarkashi", "Chamoli", "Darjeeling", "Pithoragarh"]
CHECK_FLAT = ["Varanasi", "Patna", "Ludhiana", "Latur", "Osmanabad", "Nagpur"]


def h3_slope_deg(h3_id: str, elev: float, by_id: dict) -> float:
    """Max elevation difference to any of 6 H3 neighbors ÷ edge distance → degrees."""
    max_diff = 0.0
    for nb in h3.grid_disk(h3_id, 1):
        if nb == h3_id:
            continue
        nb_props = by_id.get(nb)
        if nb_props:
            nb_elev = float(nb_props.get("elevation_mean", 0) or 0)
            diff = abs(elev - nb_elev)
            if diff > max_diff:
                max_diff = diff
    if max_diff <= 0:
        return 0.0
    return math.degrees(math.atan(max_diff / (HEX_EDGE_KM * 1000)))


def district_avg(data, district, key):
    hexes = [p for p in data if p.get("district_name") == district]
    if not hexes:
        return None, 0
    return sum(p.get(key, 0) or 0 for p in hexes) / len(hexes), len(hexes)


def main():
    print("=" * 68)
    print("  Wayanad landslide fix — patch_wayanad_landslide.py")
    print("=" * 68)

    print(f"\nLoading {HEX_FILE.name}…")
    data = json.loads(HEX_FILE.read_text())
    print(f"  {len(data)} hexes")

    # Build lookup
    by_id = {p["h3_id"]: p for p in data}

    # Capture BEFORE
    print(f"\nBEFORE — steep regions:")
    before = {}
    for d in CHECK_STEEP:
        avg, n = district_avg(data, d, "landslide_risk")
        before[d] = avg
        if avg is not None:
            print(f"  {d:25s}  ls_risk={avg:.2f}  ({n} hexes)")

    print(f"\nBEFORE — flat regions (must stay near-zero):")
    for d in CHECK_FLAT:
        avg, n = district_avg(data, d, "landslide_risk")
        if avg is not None:
            print(f"  {d:25s}  ls_risk={avg:.2f}  ({n} hexes)")

    # ── Compute H3 slopes and recompute landslide_risk ──────────────────────
    print(f"\nComputing H3-neighbor slopes + landslide recompute…")
    print(f"  Gate: {LANDSLIDE_GATE}° (was 5°) — calibrated for H3-macro resolution")

    n_updated = 0
    n_hex_risk_updated = 0
    n_gated_in = 0   # hexes that now pass the gate (were gated out before)

    for i, p in enumerate(data):
        h3_id = p["h3_id"]
        elev = float(p.get("elevation_mean", 200) or 200)
        ndvi = float(p.get("ndvi_mean", 0.3) or 0.3)

        slope = h3_slope_deg(h3_id, elev, by_id)
        p["slope_deg"] = round(slope, 2)

        old_ls = p.get("landslide_risk") or 0.0

        if slope > LANDSLIDE_GATE:
            # Same formula as join_hex_districts.py §6
            # Use AC from hex props (already baked in); reconstruct minimal risk
            # We need exposure and AC — use the stored adaptive_capacity and
            # reconstruct exposure from population.
            pop = int(p.get("population", 10000) or 10000)
            ac = float(p.get("adaptive_capacity", 0.5) or 0.5)

            # exposure_score mirrors join_hex_districts.py
            exp10 = min(10.0, math.log10(max(1, pop)) * 2 * 1.17)  # 1.17 ≈ 1+(9+8+25*0.3)/100

            ls_haz = min(10.0, (slope / 3) * (1.2 - ndvi) * 3)
            ls_sens = 0.4 * (slope / 30) + 0.3 * (1 - ndvi) + 0.3
            ac_damp = max(0.2, 1 - ls_haz / 12)
            eff_ac = ac * ac_damp
            new_ls = max(0.0, min(10.0, (ls_haz * exp10 * ls_sens) * (1 - eff_ac) / 10))
            new_ls = round(new_ls, 2)
        else:
            new_ls = 0.0

        if new_ls != old_ls:
            p["landslide_risk"] = new_ls
            n_updated += 1
            if old_ls == 0.0 and new_ls > 0:
                n_gated_in += 1

        # Recompute hex_risk = max of all channels
        old_hex = p.get("hex_risk") or 0.0
        new_hex = round(max(p.get(k) or 0.0 for k in HAZARD_KEYS), 2)
        if new_hex != old_hex:
            p["hex_risk"] = new_hex
            n_hex_risk_updated += 1

        if (i + 1) % 3000 == 0:
            print(f"  [{i+1}/{len(data)}]")

    print(f"\nFIX APPLIED:")
    print(f"  slope_deg populated:     {len(data)} hexes")
    print(f"  landslide_risk changed:  {n_updated} hexes")
    print(f"  newly gated IN (was 0):  {n_gated_in} hexes")
    print(f"  hex_risk updated:        {n_hex_risk_updated} hexes")

    # ── AFTER ───────────────────────────────────────────────────────────────
    print(f"\nAFTER — steep regions:")
    for d in CHECK_STEEP:
        avg_after, n = district_avg(data, d, "landslide_risk")
        avg_before = before.get(d, 0) or 0
        if avg_after is not None:
            delta = avg_after - avg_before
            flag = "✅ improved" if delta > 0.2 else ("➡️ unchanged" if abs(delta) < 0.1 else "")
            print(f"  {d:25s}  ls_risk: {avg_before:.2f} → {avg_after:.2f}  {flag}")

    print(f"\nAFTER — flat regions (regression check):")
    flat_ok = True
    for d in CHECK_FLAT:
        avg_after, n = district_avg(data, d, "landslide_risk")
        if avg_after is not None:
            ok = "✅" if avg_after < 0.3 else "❌ SPURIOUS RISK"
            if avg_after >= 0.3:
                flat_ok = False
            print(f"  {d:25s}  ls_risk={avg_after:.2f}  {ok}")
    print(f"  Flat-region guard: {'✅ PASS' if flat_ok else '❌ FAIL — check Deccan hexes'}")

    # Wayanad detail
    print(f"\nWayanad hex detail (AFTER):")
    for p in data:
        if p.get("district_name") == "Wayanad":
            print(f"  elev={p.get('elevation_mean'):.0f}m  slope={p.get('slope_deg'):.2f}°  "
                  f"ndvi={p.get('ndvi_mean'):.2f}  ls_risk={p.get('landslide_risk'):.2f}  "
                  f"hex_risk={p.get('hex_risk'):.2f}")

    # Retrospective Wayanad score
    wayanad_hexes = [p for p in data if p.get("district_name") == "Wayanad"]
    avg_ls = sum(p.get("landslide_risk", 0) or 0 for p in wayanad_hexes) / len(wayanad_hexes)
    result = "HIT (≥7)" if avg_ls >= 7 else "PARTIAL (5–7)" if avg_ls >= 5 else "PARTIAL (3–5)" if avg_ls >= 3 else "MISS (<3)"
    print(f"\n  RETROSPECTIVE — Wayanad landslide_risk: {avg_ls:.2f}  →  {result}")

    # Save
    print(f"\nWriting {HEX_FILE}…")
    HEX_FILE.write_text(json.dumps(data, separators=(",", ":")))
    print(f"  Written: {HEX_FILE.stat().st_size / 1e6:.1f} MB")
    print("\n✅ Done. Only landslide_risk and hex_risk changed.")


if __name__ == "__main__":
    main()
