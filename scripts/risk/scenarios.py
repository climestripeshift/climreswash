"""Shared climate-scenario table for the 4-D hazard layers (heat, flood, drought, wet-bulb,
landslide, flash flood, cold wave). One source of truth, derived in code from published numbers.

DERIVATION (reproducible; tests/test_scenarios.py re-derives every entry)
  1. Source rows: IPCC AR6 WG1 SPM, Table SPM.1, best-estimate change in global mean surface
     temperature (GSAT) in deg C relative to 1850-1900:

                      near 2021-2040   mid 2041-2060   long 2081-2100
        SSP1-2.6           1.5              1.7             1.8
        SSP2-4.5           1.5              2.0             2.7
        SSP3-7.0           1.5              2.1             3.6
        SSP5-8.5           1.6              2.4             4.4

     Horizon labels used by the maps: 2030 = 2021-2040, 2050 = 2041-2060, 2080 = 2081-2100.
  2. Baseline shift to 1991-2020: AR6 gives 0.85 C for 1995-2014 (SPM Table SPM.1 note) and 0.99 C
     for 2001-2020 (SPM A.1.2). Linear interpolation to the 1991-2020 midpoint (2005.5) gives
     0.85 + (0.99 - 0.85) / 6 x 1.0 = 0.87 C. mean warming vs 1991-2020 = GSAT(scenario) - 0.87.
  3. Hot extremes over land are scaled by 1.2 (AR6 Ch.11: hot extremes warm faster than the mean;
     the factor itself is an ASSUMPTION, not an AR6 number). hot-extreme warming = 1.2 x mean,
     rounded to 0.1 C.

ASSUMPTIONS (flagged, see HAZARD_4D_CALCULATIONS.md A1-A2)
  * India's mean warming is taken equal to the global mean (no land or regional amplification or damping).
  * Same value for every hex, every month; no model spread (the SPM very-likely ranges are not used).
Replace with per-hex, per-month CMIP6 deltas when available.
"""

# AR6 WG1 SPM Table SPM.1: GSAT change (deg C) vs 1850-1900, best estimates
AR6_GSAT = {
    "ssp126": {"2030": 1.5, "2050": 1.7, "2080": 1.8},
    "ssp245": {"2030": 1.5, "2050": 2.0, "2080": 2.7},
    "ssp370": {"2030": 1.5, "2050": 2.1, "2080": 3.6},
    "ssp585": {"2030": 1.6, "2050": 2.4, "2080": 4.4},
}
AR6_PERIOD = {"2030": "2021-2040", "2050": "2041-2060", "2080": "2081-2100"}

# GSAT warming from 1850-1900 to the 1991-2020 baseline: interpolated between AR6's 0.85 (1995-2014)
# and 0.99 (2001-2020), midpoints 2004.5 and 2010.5, evaluated at 2005.5.
BASELINE_GSAT_OFFSET_C = round(0.85 + (0.99 - 0.85) / 6.0 * 1.0, 2)  # 0.87

HOT_EXTREME_AMPLIFICATION = 1.2

HORIZONS = ["2030", "2050", "2080"]

SCENARIO_LABELS = {
    "baseline": "Baseline 1991-2020",
    "ssp126": "SSP1-2.6 (low emissions)",
    "ssp245": "SSP2-4.5 (intermediate)",
    "ssp370": "SSP3-7.0 (high)",
    "ssp585": "SSP5-8.5 (very high)",
}


def mean_warming(scenario: str, horizon: str) -> float:
    """Mean warming (deg C) vs 1991-2020 for a scenario/horizon; 0 for the baseline."""
    if scenario == "baseline":
        return 0.0
    return round(AR6_GSAT[scenario][horizon] - BASELINE_GSAT_OFFSET_C, 2)


# deg C of warming of HOT EXTREMES vs 1991-2020 (heat layer)
WARMING = {
    s: {h: round(mean_warming(s, h) * HOT_EXTREME_AMPLIFICATION, 1) for h in HORIZONS}
    for s in AR6_GSAT
}


def combos():
    """[(scenario, horizon_label, hot_extreme_warming)] including the baseline first."""
    out = [("baseline", "1991-2020", 0.0)]
    for ssp, hs in WARMING.items():
        for hz, dt in hs.items():
            out.append((ssp, hz, dt))
    return out
