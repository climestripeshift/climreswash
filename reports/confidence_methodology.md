# Confidence / Uncertainty Methodology

**Approach used: A — Data-provenance confidence**

Confidence reflects INPUT DATA QUALITY, not a guarantee of accuracy. A HIGH confidence score means the inputs are real, validated data from authoritative sources. It does not mean the risk estimate is perfectly correct — it means the estimate is as good as the data allows.

Approach B (Monte Carlo uncertainty propagation) is documented below as the post-demo upgrade path.

---

## Why Approach A for the demo

- **Fast and honest.** Data quality is known from prior provenance audit and backtest validation. Computing it is O(1) per hex with no additional data needed.
- **Directly explainable.** A reviewer who asks "why LOW?" gets "coastal distance heuristic, no IBTrACS track data used" — a factual, defensible answer.
- **Approach B would take more compute and requires assumed uncertainty ranges** that aren't yet validated. Wrong assumed ranges would give false precision.

---

## Per-hazard confidence tiers

### HIGH — Real validated data

| Hazard | Data source | Validation |
|--------|-------------|------------|
| `flood_risk` | CHIRPS/ERA5 rainfall · IMD intensity table · SRTM 90m terrain | Mumbai 2005 (7.06/10), Kerala 2018 (5.25/10) backtests ✓ |
| `drought_risk` | MODIS NDVI 2023 · ESA WorldCover 2021 · NFHS-5 AC | Marathwada 2015 (7.54/10) backtest ✓ |
| `heat_risk` | ERA5 max temperature · NFHS-5 adaptive capacity | Delhi Heatwave 2023 (6.88/10) backtest ✓ |
| `wetbulb_risk` | ERA5 temperature + RH · Stull 2011 formula | Physiological 28°C threshold literature-validated |
| `pollution_risk` | WashU satellite PM2.5 2021–2023 annual mean | Real satellite retrievals, WHO-anchored scoring |

### MEDIUM — Real but coarse or approximate

| Hazard | Limitation |
|--------|------------|
| `coldwave_risk` | Elevation + latitude climatology proxy · no historical event backtest |
| `flashflood_risk` | Slope from H3 neighbor elevation differences · slope_deg approximate |
| `sealevel_risk` | SRTM elevation + coastal distance · simplified bathtub inundation model |
| `fire_risk` | ESA land cover + aridity index · no FIRMS fire-history validation |

### LOW — Heuristic, absent, or unvalidated inputs

| Hazard | Limitation |
|--------|------------|
| `cyclone_risk` | Coastal distance heuristic — no IBTrACS historical track data used |
| `landslide_risk` | Deforestation proxy — slope_deg field absent, national 3° default assumed |

---

## Per-hex confidence assignment

**Logic:** worst-case among hazards that meaningfully score for this hex (score ≥ 1.5).

- If ANY hazard with score ≥ 1.5 is LOW confidence → hex is LOW
- Else if ANY hazard with score ≥ 1.5 is MEDIUM confidence → hex is MEDIUM
- Else → HIGH

This is more honest than "dominant hazard only" because: a coastal district with high sealevel_risk (MEDIUM) AND high cyclone_risk (LOW) should be flagged LOW — both components contribute to its risk profile.

### Distribution across 12,705 hexes

| Level | Hexes | % |
|-------|-------|---|
| HIGH | 10,395 | 81.8% |
| MEDIUM | 853 | 6.7% |
| LOW | 1,457 | 11.5% |

LOW hexes are concentrated in: Andhra/Odisha/Tamil Nadu coasts (cyclone heuristic), Northeast hill districts (landslide absent slope), and coastal Maharashtra/Gujarat (cyclone + landslide).

---

## Example validations

### Example 1: Latur, Maharashtra (validated drought district)
- `hex_risk`: 3.5 | Dominant: `pollution_risk` | **Confidence: HIGH**
- Reason: WashU satellite PM2.5 2021–2023 · real annual means
- Note: Drought was validated at 7.54/10 in the backtest (Marathwada 2015). The stored `hex_risk` of 3.5 reflects the standard scenario; confidence is HIGH because all active hazards use real data.

### Example 2: Nagapattinam, Tamil Nadu (high cyclone coast)
- `hex_risk`: 7.92 | `cyclone_risk`: 7.92 | **Confidence: LOW**
- Reason: Coastal distance heuristic · no IBTrACS historical track data used
- This is a correct flag — the cyclone model does not use observed track frequency or intensities. HIGH risk from a LOW-confidence model warrants extra scrutiny.

### Example 3: Leh (Ladakh) (high landslide)
- `hex_risk`: 10 | `landslide_risk`: 8.94 | **Confidence: LOW**
- Reason: Deforestation proxy · slope_deg absent (national 3° default assumed)
- Leh has extreme terrain that the default 3° slope assumption cannot capture. The landslide score may be significantly wrong in either direction.

---

## What confidence does NOT mean

- HIGH confidence does not mean the risk estimate is exactly correct.
- It means the inputs are real, validated, and the formula has been backtested.
- All risk estimates carry **spatial approximation uncertainty**: vulnerability data is district-level applied uniformly to all hexes within a district — intra-district variation is not captured.
- **Future/2050 risk surfaces are hidden** (SHOW_FUTURE_2050 = false) because those inputs have known structural bugs — this is the correct decision.

---

## Approach B — Monte Carlo (post-demo upgrade path)

When available, run N=500 samples per hex:
- Hazard inputs ± climatology spread (e.g., rainfall ± 15%)
- Sensitivity coefficients ± 0.05
- Adaptive capacity ± 0.05
- Population ± 15%

Report: mean ± sd, p5–p95 interval. Surface as "8.2 (90% CI 6.4–9.1)."

The existing `hex_confidence.json` (if generated) stores per-hex CI from an earlier Monte Carlo run. The `HexInfoPanel` already renders it if present. Approach B should be run after all formula parameters are finalized.

---

*Confidence reflects data provenance — honest about what we know and what we assumed.*
