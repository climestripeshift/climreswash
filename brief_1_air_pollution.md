# Claude Code Brief 1/4 — Air Pollution Hazard

**Goal:** Add air pollution (PM2.5) as a hazard — standalone, plus a heat-interaction term (pollution and heat co-occur and compound). Needed for Delhi and the Indo-Gangetic plain, which are currently understated.

**Scope:** This brief only. Add the pollution hazard to the existing engine the same way other hazards work. Do NOT rebuild the risk formula or other layers.

---

## Why pollution is in scope

- It's a child-health hazard (CCRR includes it; India's CCRR air pollution score is 9.94 — near max), aligning with your demographic focus.
- It compounds heat (stagnant air / inversions trap both; aerosols affect local temperature).
- It directly harms your vulnerable groups (under-5, elderly, pregnant women) via respiratory/cardiovascular pathways.

It is NOT a WASH hazard per se — so it feeds the RISK and the burden-day count, but does NOT feed WASH-specific cascade rules. Treat it as a health-hazard channel alongside the climate hazards.

---

## Data source

**Satellite-derived annual mean PM2.5** — the Washington University / Atmospheric Composition Analysis Group global PM2.5 product (V5/V6), ~1km, annual mean, free for research. It's the standard for spatial PM2.5 where ground monitors are sparse.

- Alternative/supplement: CPCB ground stations (point data, urban-biased) for validation.
- For India clip to lon 68–98, lat 6–37.

GEE access: the surface PM2.5 product is available as an image collection (search "PM2.5" / "ACAG" in GEE) OR download the annual GeoTIFF directly from the WashU site. Either way, you get an annual-mean PM2.5 raster.

User runs the GEE export or downloads the raster into `data/raw/pollution/pm25_annual.tif`. MOCK MODE if missing.

---

## Part 1 — Pollution severity score

Add to `formulas.py` (a new pure function, matching existing style):

```python
def air_pollution_score(pm25_annual: float) -> float:
    """
    PM2.5 annual mean (ug/m3) -> 0-10 hazard score, anchored to WHO tiers.
    WHO guideline 5; interim targets 35/25/15/10; India NAAQS 40.
    """
    # piecewise-linear against WHO/NAAQS breakpoints
    # 0->0, 5->1, 15->3, 25->5, 35->7, 50->9, 75+->10
    breakpoints = [(0,0),(5,1),(15,3),(25,5),(35,7),(50,9),(75,10)]
    # linear interpolate, clamp 0-10
```

Test cases (add to test suite):
```
air_pollution_score(5)   ≈ 1.0    # WHO guideline
air_pollution_score(40)  ≈ 7.6    # India NAAQS-ish
air_pollution_score(110) == 10.0  # Delhi winter, clamped
air_pollution_score(0)   == 0.0
```

## Part 2 — Ingest PM2.5 per hex

In the pollution ingestion (or extend compute_likelihood.py):
- Zonal mean of the PM2.5 raster per hex → `pm25_annual` column.
- Compute `air_pollution_hazard = air_pollution_score(pm25_annual)`.
- Air pollution has no meaningful "day count" the same way (it's a chronic annual mean), so for the burden-day engine (next brief) treat pollution as "active" on days exceeding a daily threshold — but for THIS brief, the annual-mean severity is enough. Store `pm25_annual` and `air_pollution_hazard`.

## Part 3 — Heat interaction term

Pollution and heat compound. Add a modest interaction so hexes high in BOTH get an extra bump (not double-counting — a genuine compounding effect):

```
# in the risk pipeline, after both heat and pollution hazards computed
heat_pollution_compound = HP_WEIGHT * min(heat_hazard, air_pollution_hazard) / 10
# applied as a small amplifier to the heat hazard (or as its own term)
heat_hazard_adjusted = min(10, heat_hazard * (1 + heat_pollution_compound))
```
Where `HP_WEIGHT = 0.2` (tunable, config block). Uses min() so the bump only applies where BOTH are high (a place with high heat but clean air gets no bump). Document the rationale.

## Part 4 — Wire into risk + AC effectiveness

- Add `air_pollution` to the hazard set used in overall/max risk.
- In the AC_EFFECTIVENESS config from the urban fix, set `air_pollution: 0.2` (infrastructure barely mitigates PM2.5 exposure — same logic that fixed Delhi).
- Pollution feeds the overall risk and the max-risk view, and (next brief) the burden-day count.

## Part 5 — Validation (print)

Print before/after for benchmark hexes:
| Hex | pm25 | pollution_hazard | heat before | heat after (compound) | overall risk before | after |
| Delhi core | ~100 | ~10 | … | ↑ | … | ↑↑ |
| Mumbai | ~40 | ~7.6 | … | … | … | ↑ |
| Rural Kerala | ~15 | ~3 | … | ≈ | … | ≈ |
| Jaisalmer | ~30 | ~5.6 | high | slight ↑ | … | ↑ |

Sanity:
1. Delhi's overall risk should rise further (pollution now counted) — this is the point.
2. Clean-air rural areas barely move.
3. Heat-pollution compound only bumps hexes high in both.

---

## Acceptance criteria

- [ ] `air_pollution_score()` in formulas.py with WHO-anchored breakpoints + tests
- [ ] `pm25_annual` + `air_pollution_hazard` per hex (real or mock)
- [ ] Heat-pollution compound term (min-based, only where both high), tunable weight
- [ ] air_pollution added to hazard set + AC_EFFECTIVENESS = 0.2
- [ ] Delhi/Indo-Gangetic risk rises; clean rural areas unaffected
- [ ] Before/after table for 4 benchmark hexes printed
- [ ] Existing tests pass; other severity formulas unchanged

---

## Rules for Claude Code

1. air_pollution_score is a new pure function; don't touch other severity formulas.
2. Pollution feeds RISK and (later) burden-days, but NOT WASH cascade rules (it's not a WASH hazard).
3. Heat-pollution compound uses min() — only bumps where BOTH are high. No double-counting.
4. AC effectiveness for pollution = 0.2 (consistent with the urban-heat fix logic).
5. MOCK MODE if PM2.5 raster missing.
6. Weights in a tunable config block.
7. Print the before/after table, then stop.

---

## END OF BRIEF 1/4
