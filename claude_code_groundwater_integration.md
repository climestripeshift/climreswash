# Claude Code Brief — Integrate Groundwater Stress into Sensitivity

**Goal:** Wire the district-level groundwater data (`groundwater_district.csv`) into the model so that groundwater stress amplifies drought sensitivity and modifies adaptive capacity. Right now the file exists but nothing reads it.

**Scope:** This brief only. Join groundwater to hexes, amplify drought sensitivity, modify adaptive capacity, re-run risk, show before/after. Do NOT touch hazard, do NOT touch the frontend beyond letting the new column flow through, do NOT build the cascade/correlation layers.

---

## Background — what the data is

`groundwater_district.csv` (place in `data/raw/groundwater/`) has 496 districts with:

| Column | Meaning |
|---|---|
| state, district | names for joining |
| n_wells | number of observation wells (confidence) |
| mean_water_level_mbgl | mean depth to water table, metres below ground level |
| min_mbgl, max_mbgl | range |
| gw_stress_score | normalized 0–1 stress (deeper water = higher stress = 1.0) |

The `gw_stress_score` is already computed: `min(1, depth_mbgl / 30)`. A score of 1.0 means severe groundwater depletion (water table at 30m+); 0.1 means shallow, abundant groundwater.

Geographic sanity (already verified): Gujarat (Banaskantha, Patan), Haryana (Kurukshetra, Rewari), Rajasthan (Jhunjhunu, Sikar) score ~1.0. Meghalaya, Assam, coastal TN score ~0.02–0.05.

---

## Why it goes where it goes

**Drought sensitivity** should be amplified by groundwater stress: a district whose primary water source (the aquifer) is already failing is far more sensitive to drought, because the drought hits an already-depleted reserve. This is the main use.

**Adaptive capacity** should be slightly reduced by groundwater stress: piped-water coverage means less when the pipes draw from a failing aquifer. Secondary, smaller effect.

These are independent of the existing terrain and NFHS inputs — no double counting.

---

## The integration — three steps

### Step 1 — Join groundwater to hexes

The groundwater CSV is district-level. Join it to hexes the same way NFHS was joined:

1. Hexes already carry a district identifier (census code or district name from the existing NFHS join). Reuse that same join key.
2. Match `groundwater_district.csv` to districts. NOTE: the groundwater district names are from WRIS and may differ in spelling/case from the census names (e.g. "JHUNJHUNU" vs "Jhunjhunu", "NORTH MIDDLE ANDAMAN" vs census name). Do a normalized match:
   - uppercase both, strip spaces/underscores/punctuation
   - match on (normalized state + normalized district)
   - log how many districts matched and how many groundwater rows went unmatched
3. For hexes whose district has no groundwater data (≈200 districts, mostly NE/Himalayan high-rainfall areas), set `gw_stress_score = 0.1` as a default (these are water-abundant regions where groundwater isn't the binding constraint — low stress is the correct assumption). Log how many hexes got the default.
4. Add `gw_stress_score` as a column on every hex.

### Step 2 — Amplify drought sensitivity

Find where drought sensitivity is currently computed (per the earlier diagnostic, around `join_hex_districts.py` line ~253, something like):

```
drought_sens = 0.5 + 0.3 * (1 - ndvi) + 0.2 * (sand_pct / 100)
```

Apply the groundwater amplifier AFTER the base computation:

```
drought_sens_base = <existing terrain formula>
drought_sens = min(1.0, drought_sens_base * (1 + GW_WEIGHT * gw_stress_score))
```

Where `GW_WEIGHT = 0.5` (tunable, put it in a config block at the top). This means:
- gw_stress_score = 1.0 (Gujarat) → drought sensitivity amplified by up to 50%
- gw_stress_score = 0.1 (Meghalaya) → drought sensitivity amplified by only 5%

Keep BOTH values in the output so the effect is auditable:
- `drought_sensitivity_base` (terrain only)
- `drought_sensitivity` (groundwater-amplified — the one used in risk)

### Step 3 — Modify adaptive capacity (secondary, smaller)

Find where adaptive capacity is computed (`integrate_nfhs5.py` or wherever `ac` is finalized). After the existing AC composite, apply a small groundwater penalty:

```
ac_base = <existing AC composite>
ac = ac_base * (1 - AC_GW_PENALTY * gw_stress_score)
```

Where `AC_GW_PENALTY = 0.2` (tunable, config block). A fully groundwater-stressed district loses up to 20% of its adaptive capacity, reflecting that its water infrastructure rests on a failing source.

Keep both:
- `adaptive_capacity_base`
- `adaptive_capacity` (groundwater-adjusted — used in risk)

### Step 4 — Re-run risk and show before/after

After wiring, recompute risk for all hexes. Then print a before/after comparison table for ~10 sample districts across the groundwater spectrum:

| District | gw_stress | drought_sens before | after | risk before | risk after | sane? |
|---|---|---|---|---|---|---|
| Banaskantha (Gujarat) | 1.0 | … | ↑ | … | ↑ | ✓ deep aquifer |
| Jhunjhunu (Rajasthan) | ~0.9 | … | ↑ | … | ↑ | ✓ |
| Meghalaya district | 0.05 | … | ≈same | … | ≈same | ✓ water-abundant |
| Kerala district | low | … | ≈same | … | ≈same | ✓ |

The validation that it worked: groundwater-stressed districts' drought risk should rise; water-abundant districts should barely move.

---

## Config block (top of the relevant script)

```
# Groundwater integration weights (tunable)
GW_WEIGHT       = 0.5   # how much groundwater stress amplifies drought sensitivity
AC_GW_PENALTY   = 0.2   # how much groundwater stress reduces adaptive capacity
GW_DEFAULT      = 0.1   # default stress for districts with no well data
```

---

## Acceptance criteria

- [ ] `gw_stress_score` joined onto every hex (real value or logged default)
- [ ] Join match rate logged (how many districts matched, how many groundwater rows unmatched, how many hexes got default)
- [ ] Drought sensitivity amplified by groundwater; `drought_sensitivity_base` and `drought_sensitivity` both present
- [ ] Adaptive capacity reduced by groundwater; `adaptive_capacity_base` and `adaptive_capacity` both present
- [ ] Risk recomputed using the groundwater-adjusted values
- [ ] Before/after table printed for ~10 districts across the stress spectrum
- [ ] Gujarat/Haryana/Rajasthan stressed districts show RISEN drought risk; NE/Kerala barely move
- [ ] Weights live in a config block, not hardcoded inline
- [ ] Existing tests still pass; hazard layer untouched

---

## Rules for Claude Code

1. Do NOT modify hazard scores or the severity/likelihood code.
2. Keep base and adjusted values as separate columns — the adjustment must be auditable.
3. Normalized name matching for the district join; log unmatched rows rather than silently dropping.
4. Districts without well data get the GW_DEFAULT (0.1), logged — do not leave them null or they'll break the risk math.
5. Weights in a config block, clearly labelled tunable.
6. Print the before/after table — this is how we confirm the integration is geographically sane.
7. Idempotent: running twice gives the same result.
8. After printing the before/after table, stop and wait for confirmation.

---

## What the user does first

Place `groundwater_district.csv` into `data/raw/groundwater/` before running.

---

## END OF BRIEF
