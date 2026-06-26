# Claude Code Brief 4/4 — Public Methodology Page

**Goal:** Publish the model's methodology as a public-facing page — the formula book, data sources, and limitations, rendered for institutional readers. Pure credibility. The content already exists; this is rendering + honesty.

**Scope:** This brief only. A methodology page in the app + a sources/limitations section. No model changes.

---

## Why this matters

No ministry, UN agency, or bank risk committee trusts a black box. A visible methodology — formulas, sources, validation, and honest limitations — is what converts a skeptic to a pilot. It's also intellectually honest: you're asking people to act on these numbers, so the basis must be inspectable.

---

## The page — sections

### 1. The Framework
- IPCC AR6 risk framework: Risk = (Hazard × Exposure × Sensitivity) ÷ Adaptive Capacity
- Aligned to UNICEF CCRR scoring (0–10)
- One clear diagram of the four factors

### 2. Hazards
- The hazard list (flood, heat, drought, wet-bulb, cyclone, air pollution, etc.)
- For each: what it measures, the severity formula (plain), the threshold source (IMD/WHO)
- Severity × Likelihood explained (real 30-yr climatology, CHIRPS/ERA5)
- Duration / chronic-burden explained (why chronic heat ≠ acute flood)

### 3. Exposure
- WorldPop population + demographic disaggregation (children, women, elderly)

### 4. Sensitivity
- Terrain + WASH-infrastructure + groundwater (WRIS)

### 5. Adaptive Capacity
- NFHS-5 indicators + MPI + groundwater penalty
- The hazard-specific AC effectiveness (why good infrastructure reduces flood but not heat risk) — this is a credibility-builder, show it

### 6. The Burden Metric
- The single/multi/total stress-days concept (suffering-time)
- The no-duplication principle

### 7. Future Projections
- CMIP6 / NEX-GDDP, SSP scenarios, delta-change bias correction
- The gap analysis concept

### 8. Validation
- The correlation results: predicted risk vs observed NFHS outcomes
- Honest framing: climate alone predicts climate, not health — which is WHY climate×WASH matters
- State the correlation numbers honestly

### 9. Data Sources (table)
- Every source, its year, its resolution, its license
- NFHS-5 (2019-21), CHIRPS, ERA5, WorldPop, WRIS (Nov 2022), CMIP6, NITI MPI, WashU PM2.5

### 10. Limitations (the honesty section — critical for trust)
State plainly:
- District-level vulnerability data applied to hexes (within-district uniformity)
- NFHS-5 is 2019–21 (newer NFHS-6 district data pending)
- Groundwater is a single snapshot (Nov 2022)
- Burden-day overlap is estimated (independence approximation), not daily-exact
- Adaptive capacity held at present values in projections
- Point estimates, not full probability distributions (no VaR yet)
- Correlation ≠ causation in outcome links
- 30-year record limits extreme-tail estimation

Stating limitations BUILDS trust — it signals you understand the model's boundaries. Institutional reviewers respect this far more than false confidence.

---

## Implementation

- A route/page in the existing app (e.g. `/methodology`)
- Render from the existing formula_book / methodology markdown if present (reuse content)
- Clean, readable, linkable sections (anchor links per section)
- A downloadable PDF version of the methodology for offline circulation
- Link to it from the main map footer and from every district brief

---

## Acceptance criteria

- [ ] Methodology page with all 10 sections
- [ ] Formulas shown in plain, readable form (not code)
- [ ] Data sources table with year/resolution/license
- [ ] Limitations section — honest and complete
- [ ] Validation results stated honestly (including the weak-but-correct framing)
- [ ] Linked from map footer + district briefs
- [ ] Downloadable PDF version
- [ ] Reuses existing methodology content where it exists

---

## Rules for Claude Code

1. Reuse existing formula_book / methodology markdown content — don't rewrite the science, render it.
2. Formulas in plain readable form for non-coders.
3. The limitations section is mandatory and must be honest — it's the trust-builder.
4. State validation results truthfully, including weaknesses.
5. Link from the main app and the district briefs.
6. After the page renders and the PDF generates, stop.

---

## END OF BRIEF 4/4

---

# After these four briefs — STOP building, show a user

Once these land you have: present risk (with air pollution + urban fix), the burden/suffering-days metric, future projections + gap, institution recommendations, a one-page district PDF, and a public methodology page.

That is a complete, demonstrable, defensible v1.

The single most valuable next action is NOT another feature — it's putting this in front of ONE real user (a state WASH department, UNICEF India, NITI Aayog, or a sympathetic academic) and letting their reaction rank what comes next: VaR, daily-data burden, sector cascades (child marriage etc.), the bank/company product, or UDISE+/POSHAN institution counts.

Build these four. Then show a human. Let the user — not instinct — steer Phase 4.
