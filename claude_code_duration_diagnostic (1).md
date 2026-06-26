# Claude Code Diagnostic — How do day-counts flow through the hazard model?

Read-only. Inspect and report, change nothing. Goal: determine whether the per-hazard "days per year above threshold" data (from the GEE climatology) survives as an explicit number in the hex data and hazard formula, or whether it got collapsed into a likelihood score that lost the day-count. This decides whether we ADD duration or REFACTOR it.

---

## THE PROMPT (copy from here)

Read-only diagnostic — do NOT modify any files. I need to understand exactly how the climatology "days per year" data flows into the hazard score, because I want to make the hazard duration-aware (so a 45-day heatwave burden scores higher than an 8-day flood burden) and I want the same machinery to drive simulations later.

## Background

The GEE climatology script computed, per hex, things like "mean annual count of days with rainfall > 50mm", "days with T_max > 40°C", etc. I need to know whether those raw day-counts:
(a) survive as explicit numeric columns in the hex data (e.g. heat_days_per_year = 45), OR
(b) got collapsed into a 0–1 likelihood score that threw away the actual count.

## Investigate and report

### 1. What did the climatology ingestion produce?
- Find the script that read the GEE frequency rasters (likely compute_likelihood.py).
- What columns did it output per hex? List them exactly.
- For each, is it a raw COUNT (e.g. "45 days") or a NORMALIZED score (e.g. "0.75")?
- Quote the normalization lines if counts were converted to 0–1.

### 2. Are raw day-counts stored in the hex data?
- Open the hex GeoJSON / props file.
- For a sample hex, list every hazard-related column and its value.
- Specifically: is there any column holding an actual number-of-days (like flood_days_per_year = 8, heat_days_per_year = 45), or only likelihood scores (flood_likelihood = 0.27)?

### 3. How does the hazard score currently use this?
- Find where the final hazard score is computed (join_hex_districts.py or risk module).
- Quote the exact line(s) where likelihood/days feeds the hazard.
- Is it: hazard = severity × likelihood, or hazard = severity × (days / reference), or something else?

### 4. Was day-count information lost?
- Critical question: if I wanted to know "how many days per year does hex X experience heat above threshold", can I recover that number from the current hex data?
- YES (it's stored as an explicit column) or NO (only the normalized likelihood survived, the raw count is gone and would need re-import from GEE).

### 5. Per-hazard reference / normalization
- When day-counts were normalized to likelihood, was the reference value (the divisor that maps to 1.0) the SAME for all hazards, or DIFFERENT per hazard?
- Quote the reference values. (This matters: heat and flood should have very different references — heat needs ~60 days to max out, flood needs ~5.)

## Output format

```
# Day-Count Flow Diagnostic

## Verdict
[ONE of:]
- COUNTS PRESERVED — raw days/year stored as explicit columns; duration is a quick formula change
- COUNTS COLLAPSED — only normalized likelihood survived; raw counts must be re-imported from GEE to add duration properly
- PARTIAL — [explain what survived]

## 1. Climatology output columns
[list, marked count vs normalized]

## 2. Day-counts in hex data?
[yes/no, sample hex values]

## 3. Current hazard formula
[quoted]

## 4. Can raw day-count be recovered from current data?
[YES/NO]

## 5. Per-hazard reference values
[same for all / different per hazard, quoted]

## What this means for adding duration
[If counts preserved: describe the quick formula change. If collapsed: describe what needs re-importing.]

## Files inspected
[list]
```

Change nothing. Produce the report and stop.

---

## END OF PROMPT
