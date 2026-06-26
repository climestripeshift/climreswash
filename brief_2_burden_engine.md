# Claude Code Brief 2/4 — Cumulative Burden Engine (Three Day-Counts)

**Goal:** Compute the platform's "absolute risk" metric — total suffering-time — as three complementary, non-duplicating day-counts per hex:
1. **single_hazard_days** — days under exactly ONE hazard's stress
2. **multi_hazard_days** — days under TWO OR MORE hazards at once
3. **total_burden_days** — total calendar days under ANY stress (= single + multi, de-duplicated)

This expresses the insight: a child suffering one hazard for 3 months ≈ three hazards for 1 month each — what matters is total stress-time. No double-counting.

**Scope:** This brief only. Build the burden-day computation from existing annual hazard frequencies (approximation — see method). Do NOT require daily data re-extraction (that's a future upgrade). Do NOT change the risk formula.

---

## The three metrics (the spec)

For each hex, across a year:
```
single_hazard_days + multi_hazard_days = total_burden_days
```
Every stressed day is classified as EITHER single OR multi — never both. The 20 days a child faces heat+drought together count as 20 multi-days, NOT 40. This is the no-duplication rule.

---

## Method — approximation from annual frequencies (v1)

We have per-hex annual day-counts per hazard (`heat_days_per_year`, `flood_days_per_year`, etc.) from the duration engine. We do NOT have daily co-occurrence. So we ESTIMATE the single/multi split using an overlap model. State this clearly as an approximation.

### Step 1 — collect active-hazard day-counts per hex
```
hazard_days = {
  "heat": heat_days_per_year,
  "flood": flood_days_per_year,
  "drought": drought_days_per_year * 30,   # convert month-fraction to days if needed
  "wet_bulb": wet_bulb_days_per_year,
  "cyclone": cyclone-related days,
  "air_pollution": days pm25 exceeds daily-unhealthy threshold (estimate from annual mean),
  ...
}
```
Only count a hazard's days if that hazard is WASH/health-relevant for burden.

### Step 2 — estimate overlap (the honest approximation)
We assume hazards are partially independent across the year. For each pair/group, estimate expected co-occurrence:

```
# total hazard-days summed (allows overlap)
sum_days = sum(hazard_days.values())

# expected overlap using independence over a 365-day year:
# P(day has hazard i) = days_i / 365
# expected days with >=2 hazards = 365 * [1 - P(0 hazards) - P(exactly 1)]
p = {h: min(1.0, d/365) for h,d in hazard_days.items()}

# probability a given day is clear (no hazard), assuming independence
p_clear = product(1 - p_h for all h)
# probability exactly one hazard
p_exactly_one = sum( p_h * product(1-p_j for j!=h) for h )

total_burden_days = 365 * (1 - p_clear)
multi_hazard_days = 365 * (1 - p_clear - p_exactly_one)
single_hazard_days = total_burden_days - multi_hazard_days
```

This honestly estimates the three counts with no double-counting (they sum correctly by construction). Document: "overlap estimated assuming partial independence; exact daily co-occurrence is a planned upgrade."

### Step 3 — severity-weighted companion (optional secondary metric)
Alongside the calendar-day counts, compute an intensity-weighted burden:
```
weighted_burden = sum( hazard_days[h] * (hazard_score[h]/10) * wash_relevance[h] )
```
This is the "severity-adjusted" burden (allows overlap intentionally — captures that compounded days are worse). Keep SEPARATE from the calendar-day counts. Label clearly.

---

## Part 2 — per-demographic burden

The burden differs by who suffers. For each demographic group (children under 5, elderly, women 15-49), weight the hazard-days by that group's sensitivity to each hazard (reuse the demographic-hazard sensitivity matrix if it exists, else a simple weighting):

```
child_burden_days = total_burden_days   # calendar days same
child_weighted_burden = sum( hazard_days[h] * demo_sensitivity["child"][h] * ... )
```
Calendar days are the same for everyone in the hex; the WEIGHTED burden differs by group (a heat-day weighs more for elderly). Store both.

---

## Part 3 — output columns

Add per hex:
```
single_hazard_days
multi_hazard_days
total_burden_days
weighted_burden                 # severity-adjusted
weighted_burden_children        # per-demographic
weighted_burden_elderly
weighted_burden_women
```

These become a new headline lens alongside "Max Risk": a "Burden / Suffering-Days" view.

---

## Part 4 — the new map view

Add a layer/toggle: **"WASH Stress Burden (days/year)"**
- Color hexes by total_burden_days
- Sub-toggle: total / single / multi
- Popup shows: "X days/year under WASH stress (Y single-hazard, Z compounded)"

This sits alongside the existing Max Risk view — different question (how LONG vs how BAD).

---

## Part 5 — validation (print)

Print for benchmark hexes across profiles:
| Hex | single | multi | total | profile | sane? |
| Jaisalmer | high heat-days, low others | low multi | high total (chronic heat) | single-dominated | ✓ chronic one-hazard |
| Delhi | heat+pollution+flood | HIGH multi | high total | multi-dominated | ✓ compounded |
| Assam | flood-days, some others | moderate | moderate | mixed | ✓ |
| Kerala low-stress | low all | low | low total | ✓ |

Sanity:
1. single + multi = total, exactly, every hex (the no-duplication identity — assert this).
2. Desert chronic-heat hex → high single, low multi.
3. Delhi (many overlapping hazards) → high multi share.
4. total_burden_days never exceeds 365.

---

## Acceptance criteria

- [ ] single_hazard_days, multi_hazard_days, total_burden_days per hex
- [ ] Identity holds exactly: single + multi = total (assert in code + test)
- [ ] total_burden_days ≤ 365 always
- [ ] Overlap approximation documented as such, with upgrade path to daily data noted
- [ ] Severity-weighted burden computed separately (not conflated with calendar days)
- [ ] Per-demographic weighted burden (children/elderly/women)
- [ ] New "WASH Stress Burden" map view with total/single/multi toggle
- [ ] Validation table printed; no-duplication identity confirmed
- [ ] Risk formula unchanged — this is an additional metric, not a risk change

---

## Rules for Claude Code

1. single + multi = total MUST hold exactly by construction. Assert it. This is the no-duplication requirement.
2. Calendar-day counts (single/multi/total) and severity-weighted burden are DIFFERENT metrics — keep separate, label clearly.
3. The overlap is an APPROXIMATION (independence assumption) — document it honestly; note daily-data as the future upgrade.
4. total_burden_days ≤ 365 always.
5. This is an ADDITIONAL metric — do not modify the existing risk score.
6. Print the validation table and assert the identity, then stop.

---

## END OF BRIEF 2/4
