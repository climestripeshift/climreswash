# Claude Code Brief — Piece B: Gap Analysis ("Bridge the Gap")

**Goal:** Turn the 4 future risk surfaces (from Piece A) into the platform's core policy output: where will future climate stress exceed today's coping capacity, and by how much. Rank districts by the gap. This is the "invest here now" list — the mission deliverable.

**Depends on:** Piece A complete (future risk surfaces: `risk_ssp245_2030/2050`, `risk_ssp585_2030/2050` per hex), plus present-day risk, adaptive capacity, and the district rankings output.

**Scope:** This brief only. Gap computation + ranking + a dedicated gap-analysis view. Do NOT change the risk engine, the future projection method, or the present-day layers. This consumes their outputs.

---

## The concept — three gap measures

"The gap" can mean three increasingly useful things. Build the first two for v1.

### Gap 1 — Risk escalation (how much worse, how fast)
```
risk_escalation = future_risk(2050, scenario) − present_risk
```
Where is climate risk rising fastest? Identifies districts on the steepest trajectory.

### Gap 2 — Capacity gap (where future stress outpaces today's coping)
This is THE mission metric. Future hazard rises, but adaptive capacity is held at today's level (from Piece A's design). The gap is where tomorrow's stress exceeds today's ability to cope.

```
# future_risk already incorporates (1 - present_AC) from Piece A
# but to isolate the "coping shortfall", express it as:
capacity_gap = future_hazard_exposure(2050, scenario) × (1 − present_adaptive_capacity)
```
High when: future hazard is high AND present adaptive capacity is low. These are the districts that will be overwhelmed — high incoming stress, weak current coping. The priority list.

### Gap 3 — Investment gap (what it takes to close) — NOTE FOR LATER
```
# How much adaptive capacity improvement is needed to hold future risk at an acceptable level
required_AC = 1 − (acceptable_risk / future_hazard_exposure)
investment_gap = required_AC − present_AC
```
This needs an "acceptable risk" threshold and (ideally) cost data. SKIP for v1 — note it as a future extension. Mention in output that it's the natural next step.

---

## Part 1 — Compute gaps per hex, aggregate to district

`scripts/output/gap_analysis.py`

### Step 1 — per-hex gaps
For each hex, for each scenario × horizon, compute:
```
risk_escalation_<scenario>_<horizon> = future_risk − present_risk
capacity_gap_<scenario>_<horizon>    = future_hazard_exposure × (1 − present_ac)
```
Use the worst-case scenario (SSP5-8.5, 2050) as the headline gap, but keep all four available.

### Step 2 — aggregate to district
Population-weighted mean per district (reuse existing aggregation). Carry up:
- present_risk, future_risk (each scenario/horizon)
- risk_escalation, capacity_gap
- present_adaptive_capacity
- dominant FUTURE hazard (which hazard drives the 2050 risk — may differ from present!)
- people at risk now vs 2050 (using present population × future risk fraction)

### Step 3 — the dominant-hazard shift (a powerful insight)
For each district, compare present dominant hazard vs 2050 dominant hazard. Flag districts where it CHANGES:
> "Currently flood-dominant; becomes heat-dominant by 2050."
This shift is a strong policy signal — the nature of the threat is changing, not just the magnitude. Surface it.

---

## Part 2 — The gap ranking

Produce `public/data/gap_rankings.json`:
```
[
  {
    "rank": 1,
    "district": "...", "state": "...", "census_code": "...",
    "present_risk": 5.2,
    "future_risk_2050_ssp585": 7.8,
    "risk_escalation": 2.6,
    "capacity_gap": 6.9,
    "present_adaptive_capacity": 0.41,
    "present_dominant_hazard": "drought",
    "future_dominant_hazard": "heat",
    "hazard_shifted": true,
    "people_at_risk_present": 820000,
    "people_at_risk_2050": 1240000,
    "children_under5_at_risk_2050": 168000,
    "gap_explanation": "Drought risk today; by 2050 heat becomes the dominant threat. High incoming stress meets low current coping capacity (0.41) — a priority district for capacity-building now.",
    "priority_tier": "critical"
  },
  ...
]
```

Rank by `capacity_gap` (the mission metric) by default. Allow re-sort by risk_escalation.

Priority tiers (tunable thresholds):
- **critical**: capacity_gap in top 15% AND present_AC below median
- **high**: capacity_gap in top 35%
- **moderate / low**: the rest

Also produce `reports/gap_rankings.csv` for offline/policy use.

---

## Part 3 — The gap-analysis view (the "separate page" the user wanted)

A dedicated view/page (separate from the present-day map, as the user requested). Components:

### 3a — Gap map
- Same hex grid, but colored by `capacity_gap` (or a scenario/horizon the user selects)
- A scenario/horizon selector: [SSP2-4.5 | SSP5-8.5] × [2030 | 2050]
- A metric toggle: [Risk escalation | Capacity gap]
- Color scale emphasizes the high-gap districts (the ones needing investment)

### 3b — Time slider / before-after
- A present ⟷ 2050 toggle or slider that recolors the map, so a planner SEES the change
- Optional: side-by-side present vs 2050 maps

### 3c — Priority district list
- Districts ranked by capacity_gap, critical tier highlighted
- Each row: district, present risk → 2050 risk (with arrow), gap, hazard shift flag
- Click → district gap detail

### 3d — District gap detail card
- Present vs 2050 risk (both scenarios)
- The hazard shift (if any) prominently
- People at risk: now vs 2050, disaggregated
- The gap explanation
- The institution recommendations (from the earlier matrix) — now framed as "invest now to close the 2050 gap"

### 3e — Headline numbers (top of page)
- "X districts face a critical capacity gap by 2050 under SSP5-8.5"
- "Y million more people at climate-WASH risk in 2050 vs today"
- "Z districts where the dominant hazard changes by 2050"
These are the policy headlines — compute and display them.

---

## Part 4 — Sanity validation (print)

Print the top 15 gap districts and confirm:
1. They have LOW present adaptive capacity (gap should concentrate in low-capacity districts) — if a high-capacity district tops the gap list, investigate.
2. Their future risk > present risk (gap should be forward-looking).
3. Hazard-shift districts make sense (e.g. a currently-moderate-heat district in central India becoming heat-dominant by 2050 under SSP5-8.5 is plausible).
4. Compare SSP2-4.5 vs SSP5-8.5: the worst-case should produce larger gaps.

Print any anomalies (high-capacity district in critical tier, future < present risk) as FLAGS.

---

## Acceptance criteria

- [ ] Per-hex risk_escalation and capacity_gap computed for all 4 scenario×horizon combos
- [ ] Aggregated to district, population-weighted
- [ ] `gap_rankings.json` + CSV produced, ranked by capacity_gap, with priority tiers
- [ ] Dominant-hazard-shift detected and flagged per district
- [ ] People-at-risk present vs 2050 computed, disaggregated
- [ ] Gap-analysis view: gap map + scenario/horizon selector + metric toggle + priority list + detail card + headline numbers
- [ ] Present⟷2050 visual comparison (slider or side-by-side)
- [ ] Institution recommendations surfaced in gap detail, framed as "invest now"
- [ ] Top-15 gap sanity check printed; anomalies flagged
- [ ] Gap-analysis is a SEPARATE view; present-day map unchanged
- [ ] Investment gap (Gap 3) noted as future extension, not built

---

## Rules for Claude Code

1. Consume Piece A's future risk surfaces; do NOT recompute or modify them.
2. capacity_gap is the headline metric (future hazard × low present coping) — rank by it.
3. The dominant-hazard-shift is a key insight — detect and surface it prominently.
4. Hold adaptive capacity at present values (consistent with Piece A) — the gap is "future climate vs today's coping" by design.
5. Gap analysis is a SEPARATE view/page; do not alter the present-day map.
6. Reuse the institution recommendation matrix — don't duplicate it, reference it.
7. Compute the headline numbers (critical-gap district count, additional people at risk, hazard-shift count).
8. Print the top-15 sanity check; flag anomalies (high-capacity district topping the gap list = suspicious).
9. After the sanity check, stop and wait.

---

## END OF BRIEF
