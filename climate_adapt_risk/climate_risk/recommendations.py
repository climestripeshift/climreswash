"""Rule-based adaptation recommendations derived from district risk profile.

Generates prioritised, category-tagged actions from the DistrictRisk output
and raw WASH/health indicator values. All thresholds are evidence-referenced
(NITI Aayog SDG baseline, NDMA guidelines, WHO WASH targets).

This module is pure logic — no data, no coefficients. Safe to extend.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Literal

Priority = Literal["Critical", "High", "Medium", "Low"]
Category = Literal["WASH", "DRR", "Policy", "Health"]

_PRIORITY_ORDER = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}


@dataclass
class Recommendation:
    category: Category
    priority: Priority
    action: str
    rationale: str
    indicator: str


def generate_recommendations(
    *,
    risk_score: float,
    effective_drought: float,
    effective_flood: float,
    hazard_norm: float,
    water_access: float,
    toilet_coverage: float,
    hw_facility: float,
    imr: float,
    stunting: float,
    wasting: float,
    mmr: float,
    population: int,
) -> list[dict]:
    """Return a sorted list of adaptation recommendations.

    All float parameters that are percentages are expected in [0, 100].
    Risk and hazard inputs are in [0, 1].
    """
    recs: list[Recommendation] = []

    # ── WASH ─────────────────────────────────────────────────────────────────
    if water_access < 40:
        recs.append(Recommendation(
            category="WASH", priority="Critical",
            action="Emergency multi-village water scheme (piped/borewell with solar pump)",
            rationale="Below 40% water access creates acute vulnerability in every hazard scenario",
            indicator=f"Water access: {water_access:.0f}%",
        ))
    elif water_access < 65:
        recs.append(Recommendation(
            category="WASH", priority="High",
            action="Construct community rainwater harvesting tanks (10 kL per 50 households)",
            rationale="Water gap amplifies drought-season WASH stress; storage buffers the impact",
            indicator=f"Water access: {water_access:.0f}%",
        ))

    if toilet_coverage < 40:
        recs.append(Recommendation(
            category="WASH", priority="Critical",
            action="Build elevated pour-flush latrines with flood-resistant soak pits (ODF+ design)",
            rationale="Sub-40% sanitation risks epidemic faecal-oral disease after any flood event",
            indicator=f"Sanitation: {toilet_coverage:.0f}%",
        ))
    elif toilet_coverage < 65:
        recs.append(Recommendation(
            category="WASH", priority="High",
            action="Accelerate SBM-G Phase II with twin-pit designs resilient to seasonal flooding",
            rationale="Sanitation gap heightens waterborne disease burden during flood seasons",
            indicator=f"Sanitation: {toilet_coverage:.0f}%",
        ))

    if hw_facility < 30:
        recs.append(Recommendation(
            category="WASH", priority="High",
            action="Install tippy-tap handwashing stations at all Anganwadis, schools, and subcentres",
            rationale="Below 30% handwashing facility coverage drives under-5 diarrhoea mortality",
            indicator=f"Handwashing facility: {hw_facility:.0f}%",
        ))
    elif hw_facility < 55:
        recs.append(Recommendation(
            category="WASH", priority="Medium",
            action="Expand WASH in Schools programme; integrate with midday meal handwashing protocol",
            rationale="Moderate facility gap; targeting schools maximises reach per rupee spent",
            indicator=f"Handwashing facility: {hw_facility:.0f}%",
        ))

    # ── DRR — drought ─────────────────────────────────────────────────────────
    if effective_drought > 0.55:
        recs.append(Recommendation(
            category="DRR", priority="Critical",
            action="Deploy SPEI-6 drought early warning system with automated SMS alert to block DDMA",
            rationale="High effective drought stress requires advance trigger to mobilise water tankers",
            indicator=f"Drought stress index: {effective_drought:.2f}",
        ))
        recs.append(Recommendation(
            category="DRR", priority="High",
            action="Promote drought-tolerant varieties (pearl millet, sorghum) through ATMA block programme",
            rationale="Livelihood exposure to drought is reduced by agronomic adaptation",
            indicator=f"Drought stress index: {effective_drought:.2f}",
        ))
    elif effective_drought > 0.30:
        recs.append(Recommendation(
            category="DRR", priority="Medium",
            action="Establish village-level water security plan with community storage mapping",
            rationale="Moderate drought exposure warrants community-level contingency planning",
            indicator=f"Drought stress index: {effective_drought:.2f}",
        ))

    # ── DRR — flood ───────────────────────────────────────────────────────────
    if effective_flood > 0.55:
        recs.append(Recommendation(
            category="DRR", priority="Critical",
            action="Construct multipurpose flood shelters elevated ≥2 m above HFL (1 per 5,000 population)",
            rationale="Very high flood runoff requires safe evacuation infrastructure before first warning",
            indicator=f"Flood runoff index: {effective_flood:.2f}",
        ))
        recs.append(Recommendation(
            category="DRR", priority="High",
            action="Install real-time water-level sensors on priority drains with CWC API integration",
            rationale="Automated stage readings enable 6-hour advance warning for vulnerable wards",
            indicator=f"Flood runoff index: {effective_flood:.2f}",
        ))
    elif effective_flood > 0.30:
        recs.append(Recommendation(
            category="DRR", priority="Medium",
            action="Map and reinforce earthen embankments on high-priority river reaches",
            rationale="Moderate flood runoff is partially mitigated by structural bund reinforcement",
            indicator=f"Flood runoff index: {effective_flood:.2f}",
        ))

    # ── DRR — compound / heat ─────────────────────────────────────────────────
    if hazard_norm > 0.65:
        recs.append(Recommendation(
            category="DRR", priority="High",
            action="Form and train Community Emergency Response Teams (CERTs) with biannual mock drills",
            rationale="Elevated compound hazard requires local first-response capacity across hazard types",
            indicator=f"Compound hazard: {hazard_norm:.2f}",
        ))

    if hazard_norm > 0.50:
        recs.append(Recommendation(
            category="DRR", priority="Medium",
            action="Set up shaded community cooling centres (panchayat bhawan) for heatwave / dust events",
            rationale="Compound hazard includes heat stress; cooling centres cut mortality for vulnerable groups",
            indicator=f"Compound hazard: {hazard_norm:.2f}",
        ))

    # ── Policy ────────────────────────────────────────────────────────────────
    if risk_score > 0.75:
        recs.append(Recommendation(
            category="Policy", priority="Critical",
            action="Request NDRF pre-positioning of rescue boats, relief kits, and water purification units",
            rationale="Very high composite risk qualifies district for national pre-positioning under NDMA norms",
            indicator=f"Composite risk: {risk_score:.2f}",
        ))
        recs.append(Recommendation(
            category="Policy", priority="High",
            action="Designate district as priority under PMKSY Har Khet Ko Pani + Per Drop More Crop",
            rationale="Extreme vulnerability warrants fast-track access to flagship irrigation/water schemes",
            indicator=f"Composite risk: {risk_score:.2f}",
        ))
    elif risk_score > 0.55:
        recs.append(Recommendation(
            category="Policy", priority="High",
            action="Access SDRF (State Disaster Response Fund) for climate-proofing public infrastructure",
            rationale="High composite risk justifies state-level disaster finance; trigger SDRF application",
            indicator=f"Composite risk: {risk_score:.2f}",
        ))

    if risk_score > 0.40:
        recs.append(Recommendation(
            category="Policy", priority="Medium",
            action="Conduct participatory multi-hazard vulnerability mapping with block DDMA and GPs",
            rationale="Risk profile warrants formal planning documentation feeding into district DMP",
            indicator=f"Composite risk: {risk_score:.2f}",
        ))
        recs.append(Recommendation(
            category="Policy", priority="Medium",
            action="Integrate climate risk scores into district Annual Development Plan (ADP) allocations",
            rationale="Budget alignment to risk ensures convergence across MGNREGS, PMGSY, and JJM",
            indicator=f"Composite risk: {risk_score:.2f}",
        ))

    # ── Health system ─────────────────────────────────────────────────────────
    if imr > 55:
        recs.append(Recommendation(
            category="Health", priority="Critical",
            action="Pre-position ORS + zinc at every ASHA/ANM level; activate diarrhoea surveillance protocol",
            rationale="IMR above 55 signals acute under-5 mortality risk whenever WASH systems are disrupted",
            indicator=f"IMR: {imr:.0f}/1,000 live births",
        ))
    elif imr > 35:
        recs.append(Recommendation(
            category="Health", priority="High",
            action="Strengthen IMNCI case management at subcentres; ensure functional ORT corners",
            rationale="Elevated IMR requires improved first-level case management capacity",
            indicator=f"IMR: {imr:.0f}/1,000 live births",
        ))

    if stunting > 35:
        recs.append(Recommendation(
            category="Health", priority="High",
            action="Converge POSHAN 2.0 ICDS with MAM/SAM treatment; launch Kitchen Garden programme",
            rationale="High stunting worsens mortality from hazard-linked disease outbreaks; chronic deficit",
            indicator=f"Stunting: {stunting:.0f}%",
        ))
    elif stunting > 20:
        recs.append(Recommendation(
            category="Health", priority="Medium",
            action="Scale up supplementary nutrition through AWC take-home rations during lean season",
            rationale="Moderate stunting indicates seasonal nutritional gap worsened by drought events",
            indicator=f"Stunting: {stunting:.0f}%",
        ))

    if mmr > 200:
        recs.append(Recommendation(
            category="Health", priority="High",
            action="Strengthen obstetric emergency transport (108 ambulance coverage) and CEmONC facilities",
            rationale="High MMR reflects weak maternal infrastructure disproportionately stressed during disasters",
            indicator=f"MMR: {mmr:.0f}/100,000 live births",
        ))

    if wasting > 15:
        recs.append(Recommendation(
            category="Health", priority="Medium",
            action="Establish community-based management of acute malnutrition (CMAM) at block level",
            rationale="High acute wasting raises case-fatality rates during waterborne disease outbreaks",
            indicator=f"Wasting: {wasting:.0f}%",
        ))

    recs.sort(key=lambda r: (_PRIORITY_ORDER[r.priority], r.category))

    return [
        {
            "category": r.category,
            "priority": r.priority,
            "action": r.action,
            "rationale": r.rationale,
            "indicator": r.indicator,
        }
        for r in recs
    ]
