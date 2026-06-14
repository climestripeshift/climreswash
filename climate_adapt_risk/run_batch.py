#!/usr/bin/env python3
"""Batch runner for the ClimateAdapt risk engine — demo mode.

Reads a JSON array of ClimResWASH district rows from stdin, runs the
pipeline for every district with allow_uncalibrated=True, normalises
compound-hazard scores across the full batch (two-pass), generates
adaptation recommendations, and writes results as a JSON array to stdout.

DEMO MODE NOTICE
----------------
All ENSO teleconnection betas (drought_beta, flood_beta, gamma) and biophysical
conditioners (soil_capacity, infiltration, slope_factor) are PLACEHOLDER values
defined in this script. They have NOT been calibrated against historical data.
Outputs are ILLUSTRATIVE only — suitable for demonstrating model architecture
and UI flow, not for policy decisions. config.CALIBRATED remains False.

Usage:
  echo '[{"districtId": "...", ...}]' | python3 run_batch.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Ensure climate_risk package is importable whether run from repo root or its own dir
sys.path.insert(0, str(Path(__file__).parent))

from climate_risk.schemas import DistrictInputs
from climate_risk.forcing import apply_teleconnection
from climate_risk.hazard import effective_drought_stress, effective_flood_runoff
from climate_risk.compound import compound_hazard
from climate_risk.normalize import normalize
from climate_risk.risk import district_risk
from climate_risk.impact import impact_people, impact_livelihood
from climate_risk.recommendations import generate_recommendations
import climate_risk.config as config

# ── Demo ENSO state (neutral/mild El Niño) ────────────────────────────────────
ONI_DEMO: float = 0.5   # Oceanic Niño Index — mild El Niño
DMI_DEMO: float = 0.0   # Dipole Mode Index  — neutral IOD

# ── PLACEHOLDER teleconnection & biophysical coefficients ─────────────────────
DROUGHT_BETA:  float = 0.8    # sensitivity of deficit to ONI — TODO fit from data
DROUGHT_GAMMA: float = -0.3   # sensitivity of deficit to DMI — TODO fit from data
FLOOD_BETA:    float = 1.2    # sensitivity of rainfall to ONI — TODO fit from data
FLOOD_GAMMA:   float = 0.5    # sensitivity of rainfall to DMI — TODO fit from data
SOIL_CAPACITY: float = 15.0   # mm plant-available water-holding capacity (uniform)
INFILTRATION:  float = 0.4    # fraction [0,1] (moderate loam default)
SLOPE_FACTOR:  float = 1.0    # terrain runoff multiplier (flat default)
KAPPA_WELFARE: float = 1.0    # consequence factor — placeholder (relative output only)
KAPPA_INCOME:  float = 1.0    # consequence factor — placeholder


def _norm01(v: float | None, fallback: float = 0.4) -> float:
    """Mirror of the TypeScript norm01: if > 1 assume percent, divide by 100."""
    if v is None:
        return fallback
    v = float(v)
    return v / 100.0 if v > 1.0 else v


def district_to_inputs(d: dict) -> DistrictInputs:
    """Map a ClimResWASH district DB row to DistrictInputs using demo placeholders."""
    h = max(float(d.get("hazardScore") or 0.25), 0.01)
    water = float(d.get("waterAccessPercent") or 50)

    # Drought proxy: water-deficit scaled by NDMA hazard baseline
    drought_baseline = (1.0 - water / 100.0) * h * 150.0
    # Flood proxy: rainfall intensity scaled by hazard baseline
    flood_baseline = h * 200.0

    return DistrictInputs(
        name=str(d.get("name") or d.get("districtId") or "?"),
        oni=ONI_DEMO,
        dmi=DMI_DEMO,
        drought_baseline_deficit=drought_baseline,
        drought_beta=DROUGHT_BETA,
        drought_gamma=DROUGHT_GAMMA,
        flood_baseline_rain=flood_baseline,
        flood_beta=FLOOD_BETA,
        flood_gamma=FLOOD_GAMMA,
        soil_capacity=SOIL_CAPACITY,
        surface_storage=water * 0.8,     # proxy: higher water access → more local storage
        groundwater=water * 1.2,          # correlated proxy
        infiltration=INFILTRATION,
        slope_factor=SLOPE_FACTOR,
        heat_hazard_norm=min(h / 0.52, 1.0),   # normalise NDMA [0.02, 0.52] to [0,1]
        exposure=_norm01(d.get("exposureScore")),
        vulnerability=_norm01(d.get("vulnerabilityScore")),
        capacity=_norm01(d.get("adaptationScore")),
        child_population=float(d.get("population") or 100_000) * 0.15,
        exposed_output=1_000.0,
    )


def _compute_raw(inp: DistrictInputs) -> tuple[float, float, float]:
    """Return (eff_drought, eff_flood, compound_raw) without normalising."""
    deficit = apply_teleconnection(inp.drought_baseline_deficit, inp.drought_beta, inp.oni, inp.drought_gamma, inp.dmi)
    rain    = apply_teleconnection(inp.flood_baseline_rain,    inp.flood_beta,    inp.oni, inp.flood_gamma,   inp.dmi)
    eff_drought = effective_drought_stress(deficit, inp.soil_capacity, inp.surface_storage, inp.groundwater)
    eff_flood   = effective_flood_runoff(rain, inp.infiltration, inp.slope_factor)
    hazards = {"drought": eff_drought, "flood": eff_flood, "heat": inp.heat_hazard_norm}
    raw = compound_hazard(hazards, config.HAZARD_WEIGHTS, config.INTERACTION_MATRIX)
    return eff_drought, eff_flood, raw


def run(districts: list[dict]) -> list[dict]:
    # ── Pass 1: raw compound hazard for all districts ──────────────────────────
    inputs_list: list[DistrictInputs] = []
    raws: list[float] = []
    errors: dict[str, str] = {}

    for d in districts:
        did = d.get("districtId", "?")
        try:
            inp = district_to_inputs(d)
            _, _, raw = _compute_raw(inp)
            inputs_list.append(inp)
            raws.append(raw)
        except Exception as exc:
            errors[did] = str(exc)
            inputs_list.append(None)   # placeholder
            raws.append(0.0)

    lo = min(r for r in raws if r > 0) if any(r > 0 for r in raws) else 0.0
    hi = max(raws) if raws else 1.0
    if hi <= lo:
        hi = lo + 1.0   # degenerate guard

    # ── Pass 2: full pipeline with calibrated-across-batch normalisation ───────
    results: list[dict] = []

    for d, inp, raw in zip(districts, inputs_list, raws):
        did = d.get("districtId", "?")

        if did in errors or inp is None:
            results.append({"districtId": did, "error": errors.get(did, "input error")})
            continue

        try:
            deficit = apply_teleconnection(inp.drought_baseline_deficit, inp.drought_beta, inp.oni, inp.drought_gamma, inp.dmi)
            rain    = apply_teleconnection(inp.flood_baseline_rain,    inp.flood_beta,    inp.oni, inp.flood_gamma,   inp.dmi)
            eff_drought = effective_drought_stress(deficit, inp.soil_capacity, inp.surface_storage, inp.groundwater)
            eff_flood   = effective_flood_runoff(rain, inp.infiltration, inp.slope_factor)

            hazard_norm = normalize(raw, lo, hi)   # cross-district bounds from pass 1
            risk_val = district_risk(hazard_norm, inp.exposure, inp.vulnerability, inp.capacity)
            ip = impact_people(risk_val, inp.child_population, KAPPA_WELFARE)
            il = impact_livelihood(risk_val, inp.exposed_output, KAPPA_INCOME)

            recs = generate_recommendations(
                risk_score=risk_val,
                effective_drought=min(eff_drought, 1.0),
                effective_flood=min(eff_flood / hi if hi > 0 else 0, 1.0),
                hazard_norm=hazard_norm,
                water_access=float(d.get("waterAccessPercent") or 50),
                toilet_coverage=float(d.get("toiletCoveragePercent") or 50),
                hw_facility=float(d.get("handwashingFacilityPercent") or 40),
                imr=float(d.get("infantMortalityRate") or 30),
                stunting=float(d.get("malnutritionStunting") or 20),
                wasting=float(d.get("malnutritionWasting") or 10),
                mmr=float(d.get("maternalMortalityRatio") or 100),
                population=int(d.get("population") or 100_000),
            )

            results.append({
                "districtId": did,
                "effectiveDrought": round(eff_drought, 4),
                "effectiveFlood":   round(eff_flood,   4),
                "compoundHazard":   round(raw,         4),
                "hazardNorm":       round(hazard_norm, 4),
                "riskScore":        round(risk_val,    4),
                "impactPeople":     round(ip,          2),
                "impactLivelihood": round(il,          2),
                "recommendations":  recs,
            })

        except Exception as exc:
            results.append({"districtId": did, "error": str(exc)})

    return results


if __name__ == "__main__":
    payload: list[dict] = json.load(sys.stdin)
    output = run(payload)
    json.dump(output, sys.stdout)
