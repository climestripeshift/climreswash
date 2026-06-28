# Claude Code Brief — Fix District-State Labels (Simple Relabel)

**Problem:** Hexes are in the right place, but some districts are labeled with the WRONG state. Churu shows Haryana (should be Rajasthan); Banswara shows Gujarat/MP (should be Rajasthan). The geometry is fine — only the state LABEL is wrong.

**Fix:** Overwrite each hex's state with the correct one from an authoritative district→state lookup. No spatial re-join, no boundary surgery, no downloads.

**Scope:** This brief only. Relabel state on hexes + propagate to rankings/outputs. Do NOT change risk, geometry, or any other data.

---

## The authoritative source

`nfhs5_district_wash.csv` (already in the repo / data folder) has 707 districts each with the CORRECT `state`. This is the answer key. Churu→Rajasthan, Banswara→Rajasthan are correct there.

(If `india_districts_census.geojson` is present, it also has `Dist_name` + correct `ST_NM` as a cross-check.)

---

## The fix — step by step

### Step 1 — Build the district→state lookup
From `nfhs5_district_wash.csv`, build a dict: `normalized_district_name → state`.

Normalize names for matching: lowercase, strip spaces/underscores/punctuation, collapse multiple spaces. (e.g. "Churu", "CHURU", "churu " all → "churu".)

### Step 2 — Identify duplicate district names
Some district names exist in MULTIPLE states (Bilaspur, Aurangabad, Hamirpur, Pratapgarh, Balrampur, Raigarh, etc.). Build a set of these ambiguous names from the lookup (names that map to >1 state).

For NON-duplicate names (the large majority): the name uniquely determines the state. Simple overwrite.

For DUPLICATE names: cannot resolve by name alone — resolve by location (Step 4).

### Step 3 — Relabel the unique-name hexes
For each hex:
- Normalize its district name.
- If the name is NON-ambiguous (maps to exactly one state in the lookup): overwrite the hex's `state` with the correct state. Log if it changed.
- This fixes Churu, Banswara, and the vast majority immediately.

### Step 4 — Resolve duplicate-name hexes by location
For hexes whose district name is ambiguous (maps to >1 state):
- Use the hex's centroid lat/lon to pick the correct state.
- Simplest approach: for each candidate (district-name, state) pair, find the centroid of all OTHER hexes already confidently assigned to that state, and assign the ambiguous hex to whichever candidate state's region its coordinates are closest to.
- OR, if `india_districts_census.geojson` is available, point-in-polygon the hex centroid against the census district polygons (which have correct ST_NM) to get the unambiguous answer.
- Log each resolution.

### Step 5 — Propagate to outputs
After relabeling hexes, regenerate any derived files that carry state:
- `district_rankings.json` (state field per district)
- district briefs / any output with state
- Make sure a district now appears under ONE correct state, not 2-3.

---

## Validation (print)

Spot-check these MUST come out correct:
```
Churu        → Rajasthan   (was Haryana)
Banswara     → Rajasthan   (was Gujarat/MP)
Bharatpur    → Rajasthan
Bhilwara     → Rajasthan
Jhunjhunu    → Rajasthan
Sikar        → Rajasthan
```
And the known duplicate names resolve sensibly:
```
Bilaspur     → Chhattisgarh / HP / Punjab (each hex to the right one by location)
Aurangabad   → Maharashtra / Bihar (by location)
Hamirpur     → UP / HP (by location)
Pratapgarh   → UP / Rajasthan (by location)
```

Print:
- How many hexes had their state CHANGED.
- How many districts now appear under multiple states (should be ~0 after fix, except genuinely-duplicate names which are different real districts).
- The before/after state for 10 sample corrected districts.

---

## Acceptance criteria

- [ ] District→state lookup built from nfhs5_district_wash.csv
- [ ] Unique-name hexes relabeled to correct state
- [ ] Churu→Rajasthan, Banswara→Rajasthan confirmed fixed
- [ ] Duplicate-name districts resolved by location (or census polygon)
- [ ] Outputs (rankings, briefs) regenerated with correct states
- [ ] Each non-duplicate district appears under exactly ONE state
- [ ] Count of changed hexes printed; before/after for 10 samples printed
- [ ] Geometry, risk scores, all other data UNCHANGED — only state labels fixed

---

## Rules for Claude Code

1. This is a LABEL fix only — do NOT move hexes, change geometry, or recompute risk.
2. nfhs5_district_wash.csv is the authoritative state source.
3. Normalize names for matching (case/space/punctuation insensitive).
4. Non-duplicate names: simple overwrite. Duplicate names: resolve by location.
5. Regenerate derived outputs so the corrected state propagates everywhere.
6. Print the validation (Churu, Banswara, duplicates) — confirm fixes.
7. After validation, stop.

---

## END OF BRIEF
