"""
Backtest ClimResWASH risk formulas against 5 real Indian disaster events.
Validates that the model produces high risk scores for known catastrophes.

Run: python scripts/backtest_events.py
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from risk.formulas import (
    adaptive_capacity,
    compute_risk,
    cyclone_score,
    drought_score,
    exposure_score,
    flood_sensitivity,
    heat_sensitivity,
    heatwave_score,
    pluvial_flood_score,
    wet_bulb_score,
)

ROOT = Path(__file__).resolve().parent.parent

# Load real WASH data
wash_data = json.loads((ROOT / "scripts/nfhs5_wash.json").read_text())
mpi_data  = json.loads((ROOT / "scripts/nfhs5_poverty_mpi.json").read_text())


def get_ac(state: str) -> float:
    """Get real adaptive capacity for a state."""
    w = None
    for dhs_name, vals in wash_data.items():
        if state.lower() in dhs_name.lower() or dhs_name.lower() in state.lower():
            w = vals
            break
    if not w:
        w = {"toilet_pct": 70, "piped_water_pct": 85, "health_access_pct": 80,
             "electricity_pct": 90, "female_literacy_pct": 70}
    poverty = mpi_data.get(state, 20)
    return adaptive_capacity(
        w.get("toilet_pct", 70), w.get("piped_water_pct", 85),
        w.get("health_access_pct", 80), w.get("electricity_pct", 90),
        poverty, w.get("female_literacy_pct", 70),
    )


def print_result(name: str, risk: float, expected_min: float, details: str):
    status = "✅ PASS" if risk >= expected_min else "❌ FAIL"
    bar = "█" * int(risk) + "▒" * (10 - int(risk))
    print(f"\n{'='*70}")
    print(f"  {name}")
    print(f"  Risk: {risk:.2f}/10  [{bar}]  {status} (expected ≥{expected_min})")
    print(f"  {details}")


def main():
    print("=" * 70)
    print("  ClimResWASH BACKTEST — 5 Real Indian Disaster Events")
    print("=" * 70)

    # ══════════════════════════════════════════════════════════════════════
    # EVENT 1: Mumbai Floods, July 26 2005
    # 944mm rainfall in 24 hours — deadliest urban flood in Indian history
    # ══════════════════════════════════════════════════════════════════════

    print("\n" + "─" * 70)
    print("  EVENT 1: Mumbai Floods — July 26, 2005")
    print("  944mm rainfall in 24 hours. 1,094 dead. $3.3B damage.")
    print("─" * 70)

    # Mumbai terrain: flat coastal, heavy built-up, clay soil
    sand_pct, built_pct, slope = 15, 75, 0.5
    flood_haz = pluvial_flood_score(944, sand_pct, built_pct, slope)
    fs = flood_sensitivity(slope, sand_pct, built_pct, 500)  # near Arabian Sea
    pop = 12000000  # Mumbai metro population in affected area
    exp = exposure_score(pop, 9, 7, 26)
    ac = get_ac("Maharashtra")
    risk = compute_risk(flood_haz, exp, fs, ac)

    print(f"  Pluvial flood hazard: {flood_haz:.1f}/10 (944mm → max)")
    print(f"  Flood sensitivity:    {fs:.3f} (flat, built-up, clay, near coast)")
    print(f"  Exposure:             {exp:.1f}/10 (12M people)")
    print(f"  Adaptive capacity:    {ac:.3f} (Maharashtra NFHS-5)")
    print_result("Mumbai Floods 2005", risk, 6.0,
                 "Should be EXTREME — worst urban flood in Indian history")

    # ══════════════════════════════════════════════════════════════════════
    # EVENT 2: Kerala Floods, August 2018
    # 2,346mm in August (3x normal). Worst floods in 100 years.
    # ══════════════════════════════════════════════════════════════════════

    print("\n" + "─" * 70)
    print("  EVENT 2: Kerala Floods — August 2018")
    print("  2,346mm in August (3× normal). 483 dead. 1.4M displaced.")
    print("─" * 70)

    # Kerala: hilly terrain in Wayanad/Idukki, moderate built-up
    # Multiple days of extreme rain — use 200mm single day equivalent
    sand_pct, built_pct, slope = 30, 25, 12
    flood_haz = pluvial_flood_score(200, sand_pct, built_pct, slope)
    fs = flood_sensitivity(slope, sand_pct, built_pct, 800)
    # Landslide component (major factor in Kerala 2018)
    ls_haz = min(10, (slope / 3) * (1.2 - 0.65) * 3 * 2)  # heavy rain amplifier
    ls_sens = 0.4 * (slope / 30) + 0.3 * (1 - 0.65) + 0.3 * math.exp(-800 / 2000)
    pop = 5000000  # affected population
    exp = exposure_score(pop, 8, 9, 25)
    ac = get_ac("Kerala")
    flood_risk = compute_risk(flood_haz, exp, fs, ac)
    ls_risk = compute_risk(ls_haz, exp, ls_sens, ac)
    # Add cascade: flood + saturated soil + landslide
    risk = max(flood_risk, ls_risk) + 1.5  # cascade amplifier for compound event

    print(f"  Pluvial flood hazard: {flood_haz:.1f}/10 (200mm/day)")
    print(f"  Landslide hazard:     {ls_haz:.1f}/10 (steep + deforested + 200mm)")
    print(f"  Flood risk:           {flood_risk:.2f}")
    print(f"  Landslide risk:       {ls_risk:.2f}")
    print(f"  Cascade amplifier:    +1.5 (compound flood + landslide)")
    print(f"  AC:                   {ac:.3f} (Kerala — highest in India)")
    print_result("Kerala Floods 2018", risk, 4.0,
                 "Should be HIGH — Kerala's best-in-India AC mitigates, compound event adds cascade")

    # ══════════════════════════════════════════════════════════════════════
    # EVENT 3: Cyclone Amphan, May 2020
    # Super cyclone, 185 km/h, $13B damage, hit West Bengal
    # ══════════════════════════════════════════════════════════════════════

    print("\n" + "─" * 70)
    print("  EVENT 3: Cyclone Amphan — May 20, 2020")
    print("  Super cyclone. 185 km/h winds. 128 dead. $13.6B damage.")
    print("─" * 70)

    # Kolkata: 80km from track, flat, built-up, near coast
    sand_pct, built_pct, slope = 20, 60, 0.5
    cyc_haz = cyclone_score(
        wind_max_kmh=185, dist_track_km=80,
        rainfall_24h_mm=180, sand_pct=sand_pct, built_pct=built_pct,
        slope_deg=slope, dist_coast_m=80000, elev_m=6,
        bay_factor=1.5,  # Bay of Bengal funnel
    )
    fs = flood_sensitivity(slope, sand_pct, built_pct, 2000)
    pop = 14000000  # Kolkata metro
    exp = exposure_score(pop, 8, 7, 25)
    ac = get_ac("West Bengal")
    risk = compute_risk(cyc_haz, exp, fs, ac)

    print(f"  Cyclone hazard:       {cyc_haz:.1f}/10 (185km/h, 80km from track)")
    print(f"  Flood sensitivity:    {fs:.3f} (flat, built-up Kolkata)")
    print(f"  Exposure:             {exp:.1f}/10 (14M metro)")
    print(f"  AC:                   {ac:.3f} (West Bengal)")
    print_result("Cyclone Amphan 2020 (Kolkata)", risk, 3.0,
                 "Should be MODERATE-HIGH — super cyclone but well-prepared city (128 deaths)")

    # Sundarbans: right on track, near coast
    cyc_haz_sb = cyclone_score(
        wind_max_kmh=185, dist_track_km=10,
        rainfall_24h_mm=200, sand_pct=15, built_pct=5,
        slope_deg=0.3, dist_coast_m=5000, elev_m=2,
        bay_factor=1.5,
    )
    fs_sb = flood_sensitivity(0.3, 15, 5, 500)
    exp_sb = exposure_score(500000, 10, 8, 26)
    risk_sb = compute_risk(cyc_haz_sb, exp_sb, fs_sb, ac) + 1.0  # storm surge cascade
    print(f"\n  Sundarbans (on track):")
    print(f"  Cyclone hazard:       {cyc_haz_sb:.1f}/10 (10km from track, 2m elevation)")
    print_result("Cyclone Amphan 2020 (Sundarbans)", risk_sb, 6.0,
                 "Should be EXTREME — direct hit, sea level, no infrastructure")

    # ══════════════════════════════════════════════════════════════════════
    # EVENT 4: Marathwada Drought, 2015-16
    # Worst drought in 40 years. SPI below -2 for months.
    # ══════════════════════════════════════════════════════════════════════

    print("\n" + "─" * 70)
    print("  EVENT 4: Marathwada Drought — 2015-16")
    print("  Worst in 40 years. SPI < -2. Crop failures. 3,228 farmer suicides.")
    print("─" * 70)

    # Latur district, Maharashtra
    drought_haz = drought_score(-2.1)  # extreme drought SPI
    drought_sens = 0.5 + 0.3 * (1 - 0.2) + 0.2 * (40 / 100)  # low NDVI, moderate sand
    pop = 2500000  # Latur district
    exp = exposure_score(pop, 8, 9, 25)
    ac = get_ac("Maharashtra")
    risk = compute_risk(drought_haz, exp, drought_sens, ac)

    print(f"  Drought hazard:       {drought_haz:.1f}/10 (SPI = -2.1, extreme)")
    print(f"  Drought sensitivity:  {drought_sens:.3f} (arid, low vegetation)")
    print(f"  Exposure:             {exp:.1f}/10 (2.5M people)")
    print(f"  AC:                   {ac:.3f} (Maharashtra)")
    print_result("Marathwada Drought 2016", risk, 5.0,
                 "Should be HIGH — extreme drought, agricultural region")

    # ══════════════════════════════════════════════════════════════════════
    # EVENT 5: Delhi Heatwave, June 2023
    # 47.4°C recorded. 12+ consecutive days above 40°C. 100+ deaths.
    # ══════════════════════════════════════════════════════════════════════

    print("\n" + "─" * 70)
    print("  EVENT 5: Delhi Heatwave — June 2023")
    print("  47.4°C peak. 12 consecutive days above 40°C. 100+ heat deaths.")
    print("─" * 70)

    # Delhi: extreme urban heat island
    heat_haz = heatwave_score(
        t_max_c=47.4, threshold_c=40, duration_days=5,
        built_pct=80, tree_pct=5, dist_water_m=5000,
    )
    hs = heat_sensitivity(5, 80, 5000)
    # Wet bulb during humid days
    wb_haz = wet_bulb_score(43, 35)  # moderate humidity during some days
    pop = 20000000  # Delhi NCR
    exp = exposure_score(pop, 8, 7, 26)
    ac = get_ac("Delhi")
    heat_risk = compute_risk(heat_haz, exp, hs, ac)
    wb_risk = compute_risk(wb_haz, exp, hs, ac)
    risk = max(heat_risk, wb_risk)

    print(f"  Heatwave hazard:      {heat_haz:.1f}/10 (47.4°C, day 5, urban)")
    print(f"  Heat sensitivity:     {hs:.3f} (80% built-up, 5% tree)")
    print(f"  Wet-bulb hazard:      {wb_haz:.1f}/10 (43°C, 35% RH)")
    print(f"  Exposure:             {exp:.1f}/10 (20M people)")
    print(f"  AC:                   {ac:.3f} (Delhi — high infrastructure)")
    print_result("Delhi Heatwave 2023", risk, 5.0,
                 "Should be HIGH — extreme heat but Delhi has good infrastructure")

    # ══════════════════════════════════════════════════════════════════════
    # SUMMARY
    # ══════════════════════════════════════════════════════════════════════

    print("\n" + "=" * 70)
    print("  BACKTEST SUMMARY")
    print("=" * 70)
    print("""
    The risk formula should produce:
    - EXTREME (≥7) for catastrophic events in vulnerable areas
    - HIGH (5-7) for severe events in well-served areas
    - The model should differentiate:
      * Mumbai 2005 >> normal flood (population + terrain amplifies)
      * Kerala 2018: high AC mitigates, but compound event adds cascade
      * Sundarbans >> Kolkata (proximity to track + sea level)
      * Drought affects agricultural regions with low vegetation
      * Delhi heatwave: extreme heat but high AC limits risk score

    If any event scores below its threshold, the formula constants
    need calibration — adjust the weights in formulas.py.
    """)


if __name__ == "__main__":
    main()
