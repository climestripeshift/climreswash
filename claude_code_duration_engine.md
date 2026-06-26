# Claude Code Brief — Duration-Aware Hazard Engine (3 outputs)

**Goal:** Make the hazard model duration-aware without double-counting, producing THREE distinct outputs:
1. **Risk score** — intensity-based (occurrence × severity × vulnerability), as now but cleaned
2. **Chronic burden adjustment** — duration amplification for chronic hazards only (heat, drought, wet-bulb)
3. **WASH disruption-days/year** — a standalone, legible metric of how many days/year WASH is disrupted

This also re-exposes raw day-counts as explicit columns, which is what makes future simulations possible (a simulation just overrides the day-count).

**Context from diagnostic:** `compute_likelihood.py` currently collapses raw day-counts into 0–1 likelihood (`freq / ref`, clamped). The raw GEE rasters are still on disk in `data/raw/climatology/*.tif` — so raw counts can be re-extracted WITHOUT re-running GEE.

**Scope:** This brief only. Do NOT touch the frontend, the NFHS/groundwater layers, or the validation script. Hazard engine + risk pipeline only.

---

## CRITICAL design principle — no double-counting

Three outputs answer three DIFFERENT questions and must use DIFFERENT inputs:

| Output | Question | Uses |
|---|---|---|
| Risk score | "how bad when it hits?" | occurrence_factor (caps fast) × severity × vulnerability |
| Chronic adjustment | "does sustained exposure compound damage?" | duration_factor (caps slow), CHRONIC HAZARDS ONLY |
| Disruption-days | "how many days/yr WASH disrupted?" | raw day-counts × severity, standalone |

Occurrence and duration use the SAME day-count but DIFFERENT reference divisors, so they are not the same measure applied twice. Occurrence answers "does it happen" (small reference). Duration answers "how sustained" (large reference). The chronic adjustment applies ONLY to heat/drought/wet-bulb — never to flood/cyclone, where a duration multiplier would be physically wrong (a flood is acute; 3 days isn't "less bad" per day than 1 day).

---

## Step 1 — Re-expose raw day-counts (modify `compute_likelihood.py`)

Currently it computes `freq` (raw days/yr) then immediately collapses to likelihood. Change it to store BOTH:

```
freq = float(valid.mean())                    # raw days/yr — KEEP THIS
p[col_name + "_days"] = round(freq, 2)         # NEW: raw count column
p[col_name] = round(min(1, max(0, freq / ref_val)), 3)   # existing likelihood
```

So every hazard gets two columns now:
- `flood_days_per_year` (raw count, e.g. 8.0) ← NEW
- `flood_likelihood` (normalized 0–1) ← existing

Do this for all 7 hazards. The raw rasters are on disk; this is just storing the count before normalizing.

## Step 2 — Add the config block (top of `join_hex_districts.py`)

```
# ---- Duration-aware hazard config (all tunable) ----

# Occurrence: how many days proves the hazard occurs here (small = caps fast)
OCCURRENCE_REF = {
    "flood": 3.0, "extreme_rain": 1.5, "heat": 10.0, "severe_heat": 2.0,
    "drought": 0.15, "high_wind": 0.02, "wet_bulb": 5.0,
}

# Duration: how many days until cumulative burden saturates (large = discriminates long tail)
# ONLY for chronic hazards
DURATION_REF = {
    "heat": 90.0, "drought": 0.5, "wet_bulb": 60.0,
}

# Which hazards compound with sustained exposure
CHRONIC_HAZARDS = {"heat", "drought", "wet_bulb"}

# Max chronic amplification (0.5 = up to +50% for fully sustained exposure)
CHRONIC_WEIGHT = 0.5

# How WASH-relevant each hazard's days are (for disruption-days metric)
WASH_RELEVANCE = {
    "flood": 1.0, "extreme_rain": 0.8, "heat": 0.7, "severe_heat": 0.8,
    "drought": 1.0, "high_wind": 0.5, "wet_bulb": 0.6,
}
```

## Step 3 — Rewrite the hazard combination (in `join_hex_districts.py`)

Replace the current `flood_haz = flood_sev * flood_lk` pattern with the three-part computation. For EACH hazard:

```
# --- occurrence factor (does it happen here) ---
days = p.get(f"{hz}_days_per_year", 0)
occ_ref = OCCURRENCE_REF[hz]
occurrence = min(1.0, days / occ_ref) if occ_ref else 0.0

# --- base hazard (intensity) ---
hazard = severity * occurrence       # severity from existing *_score functions

# --- chronic burden adjustment (chronic hazards only) ---
if hz in CHRONIC_HAZARDS:
    dur_ref = DURATION_REF[hz]
    duration = min(1.0, days / dur_ref) if dur_ref else 0.0
    chronic_factor = 1.0 + CHRONIC_WEIGHT * duration
else:
    chronic_factor = 1.0

hazard_adjusted = hazard * chronic_factor
```

Then risk uses `hazard_adjusted`:
```
risk_hz = hazard_adjusted * exposure * sensitivity_hz * (1 - effective_ac) / 10
```

Keep ALL intermediate values as columns for auditability:
- `{hz}_days_per_year` (raw)
- `{hz}_occurrence` (0–1)
- `{hz}_chronic_factor` (1.0–1.5)
- `{hz}_hazard` (final, post-chronic)
- `{hz}_risk`

## Step 4 — Compute the standalone disruption-days metric

Separate from risk. For each hex:

```
wash_disruption_days = 0
for hz in all_hazards:
    days = p.get(f"{hz}_days_per_year", 0)
    severity_frac = p.get(f"{hz}_hazard", 0) / 10   # 0-1
    wash_disruption_days += days * severity_frac * WASH_RELEVANCE[hz]

p["wash_disruption_days_per_year"] = round(wash_disruption_days, 1)
```

This is a pure count — "this hex's population experiences ~X days/year of climate-driven WASH disruption." NOT folded into risk. A parallel headline number.

## Step 5 — Validation table (print, don't skip)

Print a comparison for ~8 hexes across the spectrum. The key cases that prove the fix:

| Hex | heat_days | flood_days | risk (intensity) | chronic_factor | disruption_days | sane? |
|---|---|---|---|---|---|---|
| Jaisalmer (Raj) | ~100 | ~0 | high heat | ~1.5 (max chronic) | ~70 (heat-dominated) | ✓ chronic desert |
| Assam district | ~5 | ~8 | high flood | 1.0 (acute) | ~12 (flood, acute) | ✓ acute monsoon |
| Kerala | low heat | high flood | high flood | 1.0 | moderate | ✓ |
| Delhi | high heat | moderate | high both | ~1.4 | high | ✓ |

The proof points:
1. Jaisalmer's chronic_factor approaches 1.5 (100 heat-days is sustained) → its heat risk gets amplified
2. Assam's flood chronic_factor stays 1.0 (floods are acute, not duration-amplified)
3. disruption_days correctly separates them: Jaisalmer ~70 days/yr (chronic heat), Assam ~12 (acute flood)
4. This is the Rajasthan/Assam distinction the user wanted — visible in BOTH chronic_factor AND disruption_days, WITHOUT double-counting (occurrence caps both at 1.0, duration separates them)

---

## Acceptance criteria

- [ ] `compute_likelihood.py` stores raw `{hz}_days_per_year` columns alongside existing likelihood (re-extracted from on-disk rasters, no GEE re-run)
- [ ] Config block with occurrence/duration refs, chronic set, weights — all tunable, not inline
- [ ] Risk uses occurrence_factor (not the old likelihood) so duration isn't baked into occurrence
- [ ] Chronic adjustment applies ONLY to heat/drought/wet_bulb; flood/cyclone chronic_factor = 1.0 exactly
- [ ] `wash_disruption_days_per_year` computed as standalone metric, NOT folded into risk
- [ ] All intermediates kept as columns (days, occurrence, chronic_factor, hazard, risk per hazard)
- [ ] Validation table printed showing Jaisalmer (chronic heat) vs Assam (acute flood) correctly differentiated
- [ ] No double-counting: confirm occurrence and duration use different references
- [ ] Existing tests pass; severity formulas in formulas.py UNCHANGED

---

## Rules for Claude Code

1. Do NOT modify the severity functions in `formulas.py`. Only the pipeline combination changes.
2. Occurrence and duration MUST use different reference values — this is what prevents double-counting. Verify it.
3. Chronic factor applies ONLY to the CHRONIC_HAZARDS set. Flood and cyclone must get exactly 1.0.
4. disruption_days is standalone — do NOT add it into the risk score.
5. Keep every intermediate as an auditable column.
6. Re-extract day-counts from the on-disk rasters (data/raw/climatology/*.tif) — do NOT re-run GEE.
7. Print the validation table — it's how we confirm Jaisalmer vs Assam is now correctly differentiated.
8. After the validation table, stop and wait.

---

## END OF BRIEF
