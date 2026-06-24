# Claude Code Diagnostic — Is NFHS-5 data actually in the risk calculation?

Paste into Claude Code. Read-only — inspect and report, change nothing. Goal: determine whether the ingested NFHS-5 indicators actually feed the risk computation, or whether they're only stored as display columns the map shows but the math ignores.

---

## THE PROMPT (copy from here)

I need a read-only diagnostic. Do NOT modify any files. The NFHS-5 district data has been ingested and I can see it on the map. But I don't know if it's actually used in the risk calculation, or if it's just display-only. Find out.

## The core question

Risk in our model is:
> Risk = (Hazard × Exposure × Sensitivity) ÷ Adaptive Capacity

Adaptive Capacity (and part of Sensitivity) should be derived from NFHS-5 indicators (improved sanitation, improved water, female literacy, electricity, health access, etc.). I need to know: does the risk computation actually READ those NFHS columns and use them, or does it compute risk while ignoring them?

## Investigate and report

### 1. Where is risk computed?
- Find the function/script that computes the final per-hex risk score (likely in `join_hex_districts.py` or a risk module).
- Quote the actual risk formula as implemented — the lines where hazard, exposure, sensitivity, and adaptive capacity get combined.

### 2. Is Adaptive Capacity computed at all?
- Search for: "adaptive_capacity", "adaptive", "AC", "coping", "capacity".
- Is there a variable or column that computes adaptive capacity from NFHS indicators?
- If yes, quote how it's calculated and which NFHS columns feed it.
- If no, state that adaptive capacity is NOT being computed.

### 3. Do the NFHS columns appear in the risk math?
- List the NFHS-5 columns present in the hex data (improved_sanitation_pct, improved_water_pct, female_literacy_pct, electricity_pct, children_stunted_pct, diarrhoea_prev_pct, etc.).
- For EACH one, trace whether it is referenced anywhere in the risk computation code — not the ingestion, not the map rendering, but the actual risk formula.
- Produce a table: NFHS column | used in risk math? (yes/no) | where.

### 4. What happens to risk if NFHS data changes?
- Trace the logic: if I doubled female_literacy_pct or set improved_sanitation_pct to 100 for a hex, would that hex's risk score change?
- Answer concretely: YES (and explain the path) or NO (the data is display-only).

### 5. Is the division by Adaptive Capacity actually present?
- The formula divides by adaptive capacity. Find where this division happens.
- If risk is computed WITHOUT dividing by (or otherwise incorporating) adaptive capacity, flag it — it means low-capacity and high-capacity districts are treated identically, which is wrong.

### 6. Sensitivity check
- Sensitivity should incorporate WASH infrastructure (sanitation type, water source) on top of terrain.
- Is the sensitivity used in risk the terrain-only version, or the WASH-amplified version?
- Quote the relevant code.

## Output format

```
# NFHS Integration Diagnostic

## Verdict
[ONE of:]
- FULLY INTEGRATED — NFHS data feeds adaptive capacity and/or sensitivity, and changing it changes risk
- PARTIALLY INTEGRATED — [some columns used, some display-only — specify which]
- DISPLAY ONLY — NFHS data is shown on the map but the risk calculation ignores it

## The risk formula as actually implemented
[quote the real code]

## Adaptive Capacity
[computed? from what? quoted]

## NFHS columns: used vs display-only
| NFHS column | In risk math? | Where |
[table]

## Would changing NFHS data change risk?
[YES/NO with the traced path]

## Is division by adaptive capacity present?
[yes/no, quoted]

## Sensitivity: terrain-only or WASH-amplified?
[answer, quoted]

## What's missing (if anything)
[concrete description of what needs wiring if NFHS is not fully integrated]

## Files inspected
[list]
```

Change nothing. Produce the report and stop.

---

## END OF PROMPT
