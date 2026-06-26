# Claude Code Brief — The Output Layer (Ranked Results + Why + Recommendation)

**Goal:** Build the thing customers actually use — a ranked list of places to act, each with the reason it's ranked there and a recommended action. This is the deliverable that turns a risk map into a decision tool. Works with existing data; no new sources, no logins.

**Why this first:** Both markets (government, banks/companies) buy "tell me where to act and why." It also validates the model — if the top-ranked places don't make intuitive sense, that's a model signal to catch now.

**Scope:** This brief only. A backend ranking/explanation module + a frontend results panel. Do NOT change the risk formula, hazard engine, or data layers. Read existing risk scores, produce ranked output.

---

## Part 1 — Backend: ranking + explanation module

Create `scripts/output/rank_and_explain.py`.

### What it does

For any geographic level (district, or state-aggregated), produce a ranked list where each entry has:
1. **The rank + risk score**
2. **The driver breakdown** — which hazard and which vulnerability factor drives this entry's risk (the "why")
3. **A recommended action** — derived from the dominant driver

### Step 1 — Aggregate hexes to districts (reuse existing logic)
- Population-weighted mean risk per district (you already do this in validation).
- Also carry up: the dominant hazard per district, mean adaptive capacity, key vulnerability flags.

### Step 2 — Compute the "why" for each district
For each district, identify the top contributors to its risk:

```
# Dominant hazard: which hazard contributes most to this district's risk
dominant_hazard = argmax over hazards of (hazard_risk_contribution)

# Dominant vulnerability: what makes it worse
# rank these factors by how far above the national median they are
vuln_factors = {
    "low adaptive capacity": (national_median_ac - district_ac),
    "high sensitivity": (district_sensitivity - national_median_sens),
    "high exposure": (district_exposure - national_median_exp),
    "groundwater stress": district_gw_stress,
    "poor sanitation": (national_median_sanitation - district_sanitation),
    "poor water access": (national_median_water - district_water),
}
top_vuln = top 2 factors by positive deviation
```

Output a short human-readable explanation string, e.g.:
> "High flood hazard (8.2) compounded by poor sanitation coverage (41%) and low adaptive capacity."

### Step 3 — Recommended action (rule-based, from dominant driver)
Map the dominant hazard + dominant vulnerability to a recommendation. A lookup table:

```
RECOMMENDATIONS = {
  ("flood", "poor sanitation"):   "Upgrade to flood-resilient sealed sanitation (DEWATS/sealed septic); protect water sources from contamination.",
  ("flood", "low adaptive capacity"): "Strengthen drainage + emergency WASH response capacity; pre-position supplies.",
  ("drought", "groundwater stress"): "Shift from groundwater to surface/multi-village schemes; aquifer recharge; demand management.",
  ("drought", "poor water access"): "Expand piped supply from drought-resilient sources; rainwater harvesting.",
  ("heat", "low adaptive capacity"): "Heat-action plans; cooling shelters; ensure water supply continuity during heatwaves.",
  ("heat", "high exposure"):       "Prioritise vulnerable groups (elderly, children); cooling + hydration access.",
  ("cyclone", "high sensitivity"): "Cyclone-resilient WASH infrastructure; protect coastal water sources from salinity.",
  # ... default fallbacks per hazard
}
```

If no exact match, fall back to a per-hazard generic recommendation. Always produce SOMETHING actionable.

### Step 4 — Output
Produce `public/data/district_rankings.json`:
```
[
  {
    "rank": 1,
    "district": "...",
    "state": "...",
    "census_code": "...",
    "risk_score": 8.4,
    "dominant_hazard": "flood",
    "dominant_hazard_score": 8.2,
    "top_vulnerabilities": ["poor sanitation (41%)", "low adaptive capacity"],
    "explanation": "High flood hazard compounded by poor sanitation and low coping capacity.",
    "recommendation": "Upgrade to flood-resilient sealed sanitation...",
    "population_at_risk": 1240000,
    "children_under5_at_risk": 165000
  },
  ...
]
```

Sort descending by risk_score. Include ALL districts (the full ranking), frontend can paginate.

Also produce a CSV version `reports/district_rankings.csv` for offline/policy use.

---

## Part 2 — Frontend: results panel

Add a results panel to the existing map page (do NOT build a new page; augment what exists).

### Components
1. **Ranked list panel** (collapsible, side or bottom of map):
   - Top 20 by default, "show more" to expand
   - Each row: rank, district name, state, risk score (colored), dominant hazard icon
   - Click a row → map flies to that district + opens its detail

2. **District detail card** (on click — reuse/extend existing sidebar):
   - District name, state, risk score (large)
   - "Why": dominant hazard + top vulnerabilities as labeled bars
   - "Recommended action": the recommendation text
   - "People at risk": total + children under 5 + elderly (from existing demographic columns)
   - A small breakdown: hazard contribution, exposure, sensitivity, adaptive capacity

3. **Filter/sort control** (top of panel):
   - Sort by: overall risk / specific hazard (flood/heat/drought/cyclone)
   - This is the seed of the "swappable view" — same data, different lens

### Data source
Frontend loads `public/data/district_rankings.json`. No backend calls — static file, fast.

---

## Part 3 — Validation built into the output

The ranked list IS a model check. After generating, print the top 15 districts and confirm they pass a sanity smell test:

- Do the highest-risk districts make intuitive sense? (e.g. flood-prone Bihar/Assam districts, drought-prone Bundelkhand/Marathwada, heat-stressed Rajasthan should appear high)
- Does the "dominant hazard" match the district's known climate? (Rajasthan districts should show heat/drought dominant, not flood; coastal Odisha should show cyclone/flood)
- Print any district whose dominant hazard seems geographically wrong as a FLAG for review.

This catches model errors via the output, before customers see them.

---

## Acceptance criteria

- [ ] `district_rankings.json` produced with rank, score, why, recommendation, people-at-risk per district
- [ ] Every district has a non-empty explanation AND recommendation (fallbacks work)
- [ ] CSV version produced for offline use
- [ ] Frontend ranked-list panel shows top districts, clickable
- [ ] Clicking a district shows the why + recommendation + people-at-risk
- [ ] Sort-by-hazard control works (overall / flood / heat / drought / cyclone)
- [ ] Top-15 sanity smell test printed; geographically-wrong dominant hazards flagged
- [ ] No change to risk formula or data layers — read-only consumer of existing risk scores

---

## Rules for Claude Code

1. Read existing risk scores; do NOT recompute or modify the risk formula.
2. Every district must get an actionable recommendation — never leave it blank; use per-hazard fallbacks.
3. The explanation must name the actual dominant hazard and top vulnerabilities for THAT district, computed from its data — not a generic template.
4. Print the top-15 sanity check and flag geographically-implausible results.
5. Frontend augments the existing map page; do not create a parallel page or duplicate the map.
6. Static JSON output — no backend API calls from the frontend.
7. After producing the rankings and printing the top-15 sanity table, stop and wait.

---

## END OF BRIEF
