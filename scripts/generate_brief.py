"""
Generate one-page district policy brief PDF.
Usage:
  python scripts/generate_brief.py --district "Araria" --state "Bihar"
  python scripts/generate_brief.py --state "Bihar" --all
"""
import argparse
import json
import os
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

ROOT      = Path(__file__).resolve().parent.parent
RANKINGS  = ROOT / "client/public/data/district_rankings.json"
GAP_FILE  = ROOT / "client/public/data/gap_rankings.json"
SHOW_FUTURE_2050 = False  # flip to True after CMIP6 pipeline fix (post-demo)
OUT_DIR   = ROOT / "reports/briefs"

TIER_COLOR = {"critical": colors.red, "high": colors.orange, "moderate": colors.goldenrod, "low": colors.green}


def fmt(n):
    if n >= 1e6: return f"{n/1e6:.1f}M"
    if n >= 1e3: return f"{n/1e3:,.0f}K"
    return f"{n:,.0f}"


def load_data():
    with open(RANKINGS) as f:
        rankings = {r["district"]: r for r in json.load(f)}
    gap = {}
    if GAP_FILE.exists():
        with open(GAP_FILE) as f:
            gap = {r["district"]: r for r in json.load(f)}
    return rankings, gap


def generate_brief(district_name: str, ranking: dict, gap_data: dict | None, out_path: Path):
    r = ranking
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("Title", parent=styles["Heading1"], fontSize=16, spaceAfter=2*mm, textColor=colors.HexColor("#1a1a2e"))
    subtitle_style = ParagraphStyle("Sub", parent=styles["Normal"], fontSize=9, textColor=colors.gray, spaceAfter=3*mm)
    section_style = ParagraphStyle("Section", parent=styles["Heading2"], fontSize=11, spaceBefore=4*mm, spaceAfter=2*mm, textColor=colors.HexColor("#2d3748"))
    body_style = ParagraphStyle("Body", parent=styles["Normal"], fontSize=8.5, leading=11, spaceAfter=1.5*mm)
    small_style = ParagraphStyle("Small", parent=styles["Normal"], fontSize=7.5, leading=9, textColor=colors.gray)
    bold_style = ParagraphStyle("Bold", parent=body_style, fontName="Helvetica-Bold")

    doc = SimpleDocTemplate(str(out_path), pagesize=A4,
                            leftMargin=15*mm, rightMargin=15*mm, topMargin=12*mm, bottomMargin=12*mm)
    story = []

    # ── Header ────────────────────────────────────────────────────────────
    tier = r.get("priority_tier", "moderate")
    tier_color = TIER_COLOR.get(tier, colors.gray)
    risk = r.get("risk_score", 0)
    rank = r.get("rank", "—")
    total_districts = 713

    story.append(Paragraph(f"<b>{r['district']}</b>, {r['state']}", title_style))
    story.append(Paragraph(
        f"Overall Risk: <b>{risk:.1f}/10</b> · National Rank: <b>{rank}/{total_districts}</b> · "
        f"Priority: <font color='{tier_color}'><b>{tier.upper()}</b></font>",
        subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0")))

    # ── Section 1: Climate Threat ─────────────────────────────────────────
    story.append(Paragraph("1. THE CLIMATE THREAT", section_style))
    dominant = r.get("dominant_hazard", "flood")
    dom_score = r.get("dominant_hazard_score", 0)
    story.append(Paragraph(f"<b>Dominant hazard:</b> {dominant.upper()} ({dom_score:.1f}/10)", body_style))

    # Burden days (if present in ranking or gap data)
    disruption = r.get("wash_disruption_days", 0)
    if disruption:
        story.append(Paragraph(f"<b>WASH disruption:</b> ~{disruption:.0f} days/year of climate-driven WASH stress", body_style))

    # Future projection (gated — CMIP6 pipeline under revision)
    if SHOW_FUTURE_2050 and gap_data:
        fr = gap_data.get("future_risk_ssp585_2050", 0)
        esc = gap_data.get("risk_escalation", 0)
        if fr > 0:
            direction = "rises" if esc > 0.3 else "remains stable"
            story.append(Paragraph(f"<b>2050 outlook (SSP5-8.5):</b> Risk {direction} to {fr:.1f}/10. "
                                   f"Capacity gap: {gap_data.get('capacity_gap', 0):.1f}.", body_style))

    # ── Section 2: Who Is At Risk ─────────────────────────────────────────
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph("2. WHO IS AT RISK", section_style))

    pop = r.get("population_at_risk", 0)
    children = r.get("children_under5_at_risk", 0)
    elderly = r.get("elderly_at_risk", 0)

    demo_data = [
        ["Total Population", fmt(pop)],
        ["Children Under 5", fmt(children)],
        ["Elderly 60+", fmt(elderly)],
    ]
    demo_table = Table(demo_data, colWidths=[50*mm, 30*mm])
    demo_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (1, 0), (1, -1), 11),
        ("TEXTCOLOR", (1, 0), (1, 0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR", (1, 1), (1, 1), colors.red),
        ("TEXTCOLOR", (1, 2), (1, 2), colors.HexColor("#d97706")),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(demo_table)

    # ── Section 3: Why ────────────────────────────────────────────────────
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph("3. WHY THIS DISTRICT", section_style))
    explanation = r.get("explanation", "Risk driven by climate hazards and vulnerability factors.")
    story.append(Paragraph(explanation, body_style))

    vulns = r.get("top_vulnerabilities", [])
    if vulns:
        vuln_text = " · ".join(vulns[:3])
        story.append(Paragraph(f"<b>Key vulnerabilities:</b> {vuln_text}", body_style))

    ac = r.get("adaptive_capacity", 0)
    san = r.get("wash_sanitation_pct", 0)
    story.append(Paragraph(f"Adaptive capacity: {ac:.2f} · Sanitation coverage: {san:.0f}%", small_style))

    # ── Section 4: Recommended Actions ────────────────────────────────────
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph("4. RECOMMENDED RESILIENCE ACTIONS", section_style))

    recs = r.get("recommendations", {})
    for inst, emoji, label in [("school", "🏫", "Schools"), ("anganwadi", "👶", "Anganwadis"), ("household", "🏠", "Households")]:
        rec = recs.get(inst, {})
        measures = rec.get("measures", ["Assessment needed"])[:2]
        schemes = rec.get("schemes", [])
        measure_text = " ".join(f"({i+1}) {m}" for i, m in enumerate(measures))
        scheme_text = " · ".join(schemes) if schemes else "—"
        story.append(Paragraph(f"<b>{label}:</b> {measure_text}", body_style))
        story.append(Paragraph(f"<i>Funded by: {scheme_text}</i>", small_style))

    # ── Footer ────────────────────────────────────────────────────────────
    story.append(Spacer(1, 4*mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0")))
    story.append(Paragraph(
        f"Risk per ClimResWASH methodology, validated against observed health outcomes "
        f"(heat–anaemia r=0.41, NFHS-5) and historical events (Mumbai Floods 2005, Kerala Floods 2018, "
        f"Cyclone Amphan 2020, Marathwada Drought 2016, Delhi Heatwave 2023). See methodology report.",
        ParagraphStyle("Footer", parent=small_style, fontSize=6.5, textColor=colors.lightgrey)))
    story.append(Paragraph(
        f"Data: NFHS-5 (WASH), CHIRPS/ERA5 (climate), WorldPop (population), ESA WorldCover (land use), "
        f"WRIS (groundwater) · Generated by <b>ClimResWASH</b> · {datetime.now().strftime('%d %B %Y')} · "
        f"Model estimates — complement with ground assessment.",
        ParagraphStyle("Footer2", parent=small_style, fontSize=6.5, textColor=colors.lightgrey)))

    doc.build(story)


def main():
    parser = argparse.ArgumentParser(description="Generate district policy brief PDF")
    parser.add_argument("--district", type=str, help="District name")
    parser.add_argument("--state", type=str, help="State name")
    parser.add_argument("--all", action="store_true", help="Generate for all districts in state")
    args = parser.parse_args()

    rankings, gap = load_data()
    print(f"Loaded {len(rankings)} districts")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if args.all and args.state:
        state_districts = [r for r in rankings.values() if r["state"] == args.state]
        state_dir = OUT_DIR / args.state.lower().replace(" ", "_")
        state_dir.mkdir(parents=True, exist_ok=True)
        print(f"Generating {len(state_districts)} briefs for {args.state}...")
        for r in state_districts:
            slug = r["district"].lower().replace(" ", "_").replace("/", "_")
            out = state_dir / f"{slug}.pdf"
            gap_d = gap.get(r["district"])
            generate_brief(r["district"], r, gap_d, out)
        print(f"  Saved to {state_dir}/")
    elif args.district:
        r = rankings.get(args.district)
        if not r:
            print(f"District '{args.district}' not found")
            return
        slug = f"{r['state'].lower().replace(' ', '_')}_{r['district'].lower().replace(' ', '_')}"
        out = OUT_DIR / f"{slug}.pdf"
        gap_d = gap.get(args.district)
        generate_brief(args.district, r, gap_d, out)
        print(f"  Generated: {out}")
    else:
        # Generate 3 samples
        samples = [
            ("Araria", "Bihar"),
            ("Jaisalmer", "Rajasthan"),
            ("North West", "Delhi"),
        ]
        for dist, state in samples:
            r = rankings.get(dist)
            if not r:
                print(f"  {dist} not found, skipping")
                continue
            slug = f"{state.lower().replace(' ', '_')}_{dist.lower().replace(' ', '_')}"
            out = OUT_DIR / f"{slug}.pdf"
            gap_d = gap.get(dist)
            generate_brief(dist, r, gap_d, out)
            print(f"  Generated: {out} ({r.get('risk_score', 0):.1f} risk, {r.get('dominant_hazard', '?')})")

        print(f"\n3 sample briefs generated in {OUT_DIR}/")


if __name__ == "__main__":
    main()
