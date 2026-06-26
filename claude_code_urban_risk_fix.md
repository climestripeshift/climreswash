# Claude Code Brief — Diagnose & Fix Urban Risk Underestimation (Delhi case)

**Problem:** Delhi shows LOW risk, but Delhi has extreme urban heat, urban flooding, and (separately) air pollution. A model that rates Delhi as safe is a credibility bug. Likely cause: adaptive capacity is suppressing risk for hazards that infrastructure doesn't actually mitigate (you can't toilet-coverage your way out of an urban heat island).

**This brief has two phases. Do Phase 1 (diagnose, read-only) FIRST and report. Only do Phase 2 (fix) after the cause is confirmed in Phase 1.**

**Scope:** The risk combination logic only. Do NOT touch hazard severity, demographics, or data ingestion until the diagnosis points there.

---

## PHASE 1 — DIAGNOSE (read-only, report first)

Do not change anything. Investigate why Delhi (and other dense urban districts) score low, and report.

### 1. Pull Delhi's numbers
For 3–5 hexes in central Delhi (NCT of Delhi), print every component of the risk calculation:
- Each hazard severity, each hazard's day-count/occurrence, each hazard final score
- exposure
- each sensitivity (flood, heat, drought)
- adaptive_capacity (and its components)
- ac_dampening, effective_ac
- final risk per hazard and overall risk

Do the same for a known high-risk rural comparison (e.g. a Bihar flood district) so we can see the contrast.

### 2. Test the adaptive-capacity-suppression hypothesis
- Delhi has HIGH adaptive capacity (good NFHS: sanitation, water, electricity, literacy). So (1 − effective_ac) is small, suppressing risk.
- Compute: what would Delhi's risk be if adaptive_capacity were set to the national MEDIAN instead of its actual high value?
- If risk jumps substantially, AC suppression is confirmed as the cause.

### 3. Test the urban-heat-island hypothesis
- Check Delhi's heat sensitivity. Is the built-up/UHI amplifier actually elevating it?
- Compare Delhi's heat_sensitivity to a rural district's. Is Delhi meaningfully higher (it should be — dense built-up)?
- Check Delhi's heat HAZARD (day-counts of >40°C). Is it high? (It should be — Delhi has many 40°C+ days.)
- If heat sensitivity or heat hazard is NOT elevated for Delhi, the UHI mechanism is under-firing.

### 4. Test the aggregation hypothesis
- Are Delhi's dense-core hexes being averaged with greener peri-urban hexes when aggregated to district?
- Print the range (min/max) of hex risk within Delhi NCT. If the core hexes ARE high but the district mean is low, it's a dilution/aggregation issue.

### 5. Check what hazards Delhi is even being scored on
- Confirm whether urban flood (pluvial) is firing for Delhi, or only riverine.
- Confirm air pollution is absent (it is — note it).

### Phase 1 output — report before fixing
```
# Urban Risk Diagnostic — Delhi

## Delhi hex breakdown
[full component table for 3-5 Delhi hexes + 1 rural comparison]

## Hypothesis test results
- AC suppression: [confirmed/not] — risk at median AC would be X vs current Y
- UHI under-firing: [confirmed/not] — Delhi heat_sens X vs rural Y
- Aggregation dilution: [confirmed/not] — Delhi hex risk range min-max
- Hazards firing: [which hazards score for Delhi]

## Primary cause
[the main reason Delhi scores low, evidence-backed]

## Recommended fix
[which of the Phase 2 fixes applies]
```

STOP after Phase 1. Report. (If running non-interactively, proceed to Phase 2 ONLY for the fix that the diagnosis confirms.)

---

## PHASE 2 — FIX (apply only the fix the diagnosis confirms)

The most likely fix, based on the hypothesis. Implement the one(s) Phase 1 confirms.

### Fix A — Hazard-specific adaptive capacity (most likely needed)

The core problem: adaptive capacity currently reduces ALL hazards equally. But infrastructure protects against some hazards and not others:

| Hazard | Does WASH/social adaptive capacity mitigate it? |
|---|---|
| Flood (contamination) | YES — sanitation, water, health systems genuinely help |
| Drought | PARTLY — water infrastructure helps |
| Heat / urban heat island | WEAKLY — literacy/toilets don't cool a city; only some AC components (electricity for cooling, health access) help |
| Air pollution | BARELY — infrastructure doesn't reduce PM2.5 exposure |
| Cyclone | PARTLY |

Implement a per-hazard AC effectiveness factor:

```
AC_EFFECTIVENESS = {
    "flood": 1.0,      # AC fully applies — infrastructure genuinely mitigates
    "drought": 0.8,
    "cyclone": 0.7,
    "heat": 0.4,       # AC weakly applies — can't infrastructure away a heat island
    "wet_bulb": 0.4,
    "air_pollution": 0.2,  # if/when added — AC barely helps
}

effective_ac_for_hazard = effective_ac × AC_EFFECTIVENESS[hazard]
risk_hazard = hazard × exposure × sensitivity × (1 − effective_ac_for_hazard)
```

This means a high-capacity city like Delhi still gets its flood risk reduced (fair — good drainage/sanitation helps) but its HEAT risk stays high (fair — infrastructure doesn't cool the city). This is the key fix.

### Fix B — Strengthen the urban heat island amplifier (if Phase 1 shows UHI under-firing)
- Increase the built-up weight in heat sensitivity so dense urban cores score meaningfully higher.
- Verify it produces: Delhi/Mumbai heat sensitivity clearly above rural.

### Fix C — Address aggregation dilution (if Phase 1 shows it)
- For district-level display, consider reporting MAX or 90th-percentile hex risk for urban districts, not just population-weighted mean — so a district with extreme-risk cores isn't masked by its greener edges.
- Or report both mean and max.

### Fix D — Note air pollution as a separate scope decision
- Do NOT add air pollution in this brief (it's a scope decision for the user).
- But structure AC_EFFECTIVENESS and the hazard list so air pollution can be slotted in later cleanly.

---

## Validation after fix

Re-check and print:
1. Delhi risk should RISE and now reflect its heat + urban flood reality.
2. Other dense urban districts (Mumbai, Kolkata, Chennai, Bengaluru, Ahmedabad) should also rise — confirm they were similarly suppressed.
3. Rural high-risk districts (Bihar flood, Marathwada drought) should NOT drop — the fix shouldn't lower genuine rural risk.
4. Print before/after risk for: Delhi, Mumbai, Kolkata, a Bihar flood district, a Rajasthan heat district, a Marathwada drought district.
5. Sanity: high-capacity cities should no longer be artificially safe on heat; but their flood risk can still be moderated by their genuine infrastructure.

---

## Acceptance criteria

- [ ] Phase 1 diagnostic run and reported BEFORE any change
- [ ] Primary cause identified with evidence (component breakdown for Delhi hexes)
- [ ] Fix applied matches the confirmed cause (not a guessed fix)
- [ ] If AC suppression confirmed: hazard-specific AC effectiveness implemented
- [ ] Delhi and other major cities' risk rises to plausible levels
- [ ] Rural high-risk districts unchanged (fix doesn't suppress genuine risk)
- [ ] Before/after table printed for 6 benchmark districts
- [ ] Air pollution NOT added (left as scope decision) but structure ready for it
- [ ] AC_EFFECTIVENESS weights in a config block, tunable

---

## Rules for Claude Code

1. Phase 1 FIRST — diagnose and report before changing anything. Fix the confirmed cause, not a guess.
2. The hazard-specific AC effectiveness is the most likely fix — high adaptive capacity should NOT fully cancel heat/pollution risk, only the hazards infrastructure genuinely mitigates.
3. Do NOT add air pollution — that's a separate scope decision. But leave the structure ready.
4. The fix must RAISE urban risk WITHOUT lowering genuine rural risk — verify both.
5. Weights in a tunable config block.
6. Print before/after for the 6 benchmark districts — this proves the fix.
7. After the before/after table, stop and wait.

---

## END OF BRIEF
