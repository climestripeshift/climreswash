# Simulator Preset Diagnostic — Heatwave & Drought Under-fire

**Status:** Diagnostic complete. Two causes found (one expected, one a real bug). Nothing changed.

---

## Part 1 — "2022 Heatwave" (1 district flip)

### What path does the simulator use?
The simulator **recomputes heat from scratch** via `heatwaveScore(tmax_c, 40, hot_days, built_pct, tree_pct, 5000)`.  
It does **NOT** route through the stored `heat_risk` field (annual, max ~3) or `heat_peak_score`.  
**The brief's hypothesis about compressed-field routing is WRONG.**

### Actual cause: land-use heat sensitivity gap

`heatSensitivity(tree, built, distWater)` returns 0.28–0.46 for crop/rural land and 0.61–0.82 for built urban.  
India is ~60% crop hexes. At 45°C/7d:

| Land use | heat_hazard | heat_sens | exposure | risk |
|----------|-------------|-----------|----------|------|
| crop (most of India, ndvi≈0.5) | 5.81 | 0.46 | 10 | **1.86** |
| built urban (ac=0.7) | 6.83 | 0.70 | 10 | **3.35** |
| built poor-AC (ac=0.35) | 6.83 | 0.70 | 10 | **4.08** |
| barren | 5.68 | 0.43 | 10 | **1.93** |

The HIGH threshold is 5.0. Only one scenario approaches it: dense urban + very low AC.  
Additionally, NDVI-boosted tree_pct (many crop hexes have ndvi≈0.5 → tree_pct≈40) further suppresses heat_hazard in vegetated areas.

**Hyderabad (Telangana) is the one district that flips** because it has high-built-pct hexes with below-average adaptive capacity.

### Is this a bug?
**No — physically correct.** Heatwave is intrinsically an urban hazard in this formula. Rural areas have cooling vegetation and low built-fraction. The backtest (Delhi Heatwave 2023) also used `built_pct=80%` explicitly — it was modelling a dense city, not a typical Indian hex.

### Recommended fix (if more urban flips needed for demo)
- **Quick (preset tweak):** Raise T_max to 47°C (matches Delhi 2023 validated event). At 47°C, `heat_hazard` for built hexes reaches ~10 → risk ~5.6 for ac=0.5. Would add ~5–8 additional urban districts.
- **Real (formula alignment):** No fix needed — the formula is correct. Accept that heatwave scope is urban-only in this model.
- **Demo verdict:** **SHELVE the flip count for heatwave**; instead emphasise the map gradient (urban clusters light up red). Or bump to 47°C for a stronger headline.

---

## Part 2 — "El Niño Drought" (0 district flips)

### Is drought wired into reScoreHex?
Yes — `simulatorFormulas.ts:reScoreHex()` calls:
```ts
const droughtRisk = computeRisk(droughtScore(inputs.spi), exp, 0.5, ac);
```

It is present and fires correctly. SPI reaches the formula.

### Actual cause: STRUCTURAL BUG — flat sensitivity = 0.5

The simulator hardcodes drought sensitivity at **0.5 (flat)**.  
This creates a **mathematical ceiling** of exactly 5.0 risk, regardless of SPI, exposure, or location:

```
max risk = (10 × 10 × 0.5) × (1 − ac × 0.2) / 10 = 5.0 × (1 − ac×0.2) < 5.0
```

Even at SPI = −3 (maximum), exposure = 10, AC = 0 → risk = 5.0 exactly. **Never above.**  
Districts cannot flip to HIGH RISK (`>= 5.0`) via drought alone when sensitivity is flat 0.5.

### The validated path (backtest_events.py, line 184):
```python
drought_sens = 0.5 + 0.3 * (1 - ndvi) + 0.2 * (sand_pct / 100)
```
For Latur/Marathwada (ndvi=0.2, sand=40%): `drought_sens = 0.82`

| | Backtest (Latur) | Simulator (crop hex) |
|---|---|---|
| SPI | −2.1 | −1.5 |
| drought_score | 10.0 | 7.5 |
| sensitivity | **0.820** | **0.500** (bug) |
| exposure | 10 | 10 |
| risk | **7.54** | **2.98** |

### Fix: 2-line change in simulatorFormulas.ts

Replace the flat constant with the terrain-adaptive formula from backtest_events.py:
```ts
// In reScoreHex(), replace:
const droughtRisk = computeRisk(droughtScore(inputs.spi), exp, 0.5, ac);

// With:
const droughtSens = 0.5 + 0.3 * (1 - hex.ndvi_mean) + 0.2 * (lu.sand_pct / 100);
const droughtRisk = computeRisk(droughtScore(inputs.spi), exp, droughtSens, ac);
```

With the fix + El Niño preset at SPI = −2.0 (extreme, matching the 2015–16 event severity):

| Terrain | ndvi | sand | drought_sens | SPI | risk |
|---------|------|------|-------------|-----|------|
| crop (Marathwada) | 0.25 | 25% | 0.775 | −2.0 | **7.13 ← HIGH** |
| barren (Rajasthan) | 0.15 | 75% | 0.875 | −2.0 | **8.51 ← HIGH** |
| crop (moderate AC=0.5) | 0.3 | 25% | 0.750 | −1.5 | 4.61 |

SPI = −2.0 is the historically accurate value for 2015–16 Marathwada (the briefed 7.84 figure required SPI near −2.1 with ndvi=0.2, sand=40% — matches the backtest exactly).

**Demo verdict:** **QUICK FIX** — 2-line change plus update El Niño preset SPI to −2.0.

---

## Part 3 — Why the Working Presets Work

### Extreme Monsoon (46 districts, 105M people)
**Driven by FLOOD only.** Wetbulb at 29°C/92%RH = 0.0 (temperature too low for wetbulb danger).  
Driver: `pluvialFloodScore(130mm, ...)` produces high hazard (≥8.0) AND `floodSensitivity()` is terrain-adaptive, returning 0.3–0.85 for most hex types. High sensitivity × high hazard × high exposure → many hexes flip.

### +2°C Climate (10 districts, 57M people)
**Driven by WET-BULB.** At 41°C/70%RH, `wetBulbScore = 10.0` (dangerous).  
For built urban hexes (ndvi=0.2, built=70%): `heatSensitivity = 0.775`, `computeRisk(10, 10, 0.775, ac=0.4) = 7.13`.  
The 10 flipped districts are all urban with low-medium AC.

### The pattern
Both working presets route through **terrain-adaptive sensitivity functions**:
- `floodSensitivity()` → returns 0.30–0.85 based on slope, sand, built, dist_water
- `heatSensitivity()` → returns 0.28–0.82 based on tree, built, dist_water

Drought is the **only hazard** using a flat constant (0.5) instead of a terrain function. That's the structural gap — and the bug.

---

## Summary: Per-Preset Verdict

| Preset | Cause | Fix | Verdict |
|--------|-------|-----|---------|
| **2022 Heatwave** (1 flip) | Heat is urban-only hazard; crop/rural heat_sens too low for 5.0 threshold | Raise T_max to 47°C for ~5–8 more urban flips, or shelve | **SHELVE / bump T_max** |
| **El Niño Drought** (0 flips) | STRUCTURAL BUG: flat drought_sens=0.5 caps risk at 5.0 — below flip threshold | 2-line fix + SPI→−2.0 | **QUICK FIX** |
| Extreme Monsoon (46 flips) | Correct — terrain-adaptive floodSensitivity() fires | None needed | ✅ Working |
| +2°C Climate (10 flips) | Correct — wetBulbScore at 41°C/70%RH = 10; hits built urban with any AC | None needed | ✅ Working |

---

*Diagnostic only — nothing changed. Fix recommendation for drought: 2 lines in `simulatorFormulas.ts` + update El Niño preset to SPI=−2.0.*
