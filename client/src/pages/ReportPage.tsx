import { useMemo } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { technologyContent } from "@/lib/technologyContent";
import { SHOW_FUTURE_2050 } from "@/lib/featureFlags";

// ── Constants ────────────────────────────────────────────────────────────────

const RISK_TO_TECH_HAZARD: Record<string, string> = {
  flood_risk: "Flood", heat_risk: "Heatwave", cyclone_risk: "Cyclone",
  drought_risk: "Drought", wetbulb_risk: "Heatwave", coldwave_risk: "Cold Wave",
  flashflood_risk: "Flash Flood", sealevel_risk: "Coastal Flooding", landslide_risk: "Rocky Terrain",
};

const HAZARD_META: Record<string, { icon: string; label: string; color: string }> = {
  flood_risk:      { icon: "🌊", label: "Pluvial Flood",   color: "#3b82f6" },
  heat_risk:       { icon: "🔥", label: "Heatwave",        color: "#ef4444" },
  cyclone_risk:    { icon: "🌀", label: "Cyclone",         color: "#8b5cf6" },
  drought_risk:    { icon: "☀️", label: "Drought",         color: "#f59e0b" },
  wetbulb_risk:    { icon: "💧", label: "Wet-Bulb Heat",   color: "#ec4899" },
  landslide_risk:  { icon: "🏔️", label: "Landslide",      color: "#78716c" },
  coldwave_risk:   { icon: "❄️", label: "Cold Wave",       color: "#06b6d4" },
  flashflood_risk: { icon: "⚡", label: "Flash Flood",     color: "#6366f1" },
  sealevel_risk:   { icon: "🌊", label: "Sea Level Rise",  color: "#0ea5e9" },
  fire_risk:       { icon: "🔥", label: "Forest Fire",     color: "#f97316" },
};

const CASCADE_ACTIONS: Record<string, string> = {
  flood_pit_toilet: "Replace pit toilets with sealed septic tanks or DEWATS. Chlorinate all water sources within 48h of flooding.",
  flood_open_defecation: "Deploy mobile toilet units. Distribute ORS packets. Chlorinate drinking water. Set up diarrhoea treatment centres.",
  drought_water_scarcity: "Deploy water tankers. Monitor bore well levels. Activate rainwater harvesting. Restrict non-essential water use.",
  heat_no_electricity: "Open public cooling shelters. Deploy mobile medical units with IV fluids. Issue heat advisory via SMS.",
  cyclone_poor_sanitation: "Pre-position ORS, water purification tablets, temporary latrines. Plan sanitation restoration within 72h.",
  wetbulb_no_health: "Deploy mobile health units to high wet-bulb areas. Stock IV fluids and cooling equipment. Restrict outdoor labour.",
  landslide_remote: "Pre-position rescue equipment at block HQ. Establish helicopter landing zones. Activate community first responders.",
  flood_low_literacy: "Deliver early warnings via voice messages. Set up child-safe evacuation points. Deploy ASHA workers for house-to-house alerts.",
  drought_poverty: "Activate MGNREGA drought works. Distribute drought-resistant seeds. Set up fodder camps. Expedite crop insurance payouts.",
  coldwave_exposure: "Distribute blankets and warm clothing. Open 24/7 night shelters. Deploy hot meal distribution. Alert hospitals for hypothermia cases.",
};

const CATEGORY_META: Record<string, { icon: string; label: string; bg: string; border: string; text: string }> = {
  sanitation: { icon: "🚽", label: "Sanitation",   bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af" },
  water:      { icon: "💧", label: "Water Supply", bg: "#ecfeff", border: "#a5f3fc", text: "#0e7490" },
  waste:      { icon: "♻️", label: "Liquid Waste", bg: "#f0fdf4", border: "#bbf7d0", text: "#166534" },
  adaptation: { icon: "🌱", label: "Adaptation",   bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
};

const INST_META: Record<string, { icon: string; label: string }> = {
  school: { icon: "🏫", label: "Schools" },
  anganwadi: { icon: "🌸", label: "Anganwadis" },
  household: { icon: "🏠", label: "Households" },
};

const TIER_META: Record<string, { label: string; color: string }> = {
  critical: { label: "Critical",  color: "#dc2626" },
  high:     { label: "High",      color: "#ea580c" },
  moderate: { label: "Moderate",  color: "#d97706" },
  low:      { label: "Low",       color: "#16a34a" },
};

// Hex-data state name → NFHS-6 fact-sheet state name (mirrors compute_nfhs_trends.py HEX_TO_NFHS)
const NFHS6_STATE_ALIAS: Record<string, string> = {
  "Andaman & Nicobar Island": "Andaman & Nicobar Islands",
  "Dadra & Nagar Haveli": "Dadra & Nagar Haveli and Daman & Diu",
  "Daman & Diu": "Dadra & Nagar Haveli and Daman & Diu",
};

const NFHS6_TREND_META: Record<string, string> = {
  water: "Improved Water Access",
  stunting: "Child Stunting",
  wasting: "Child Wasting",
  severe_wasting: "Severe Wasting",
  underweight: "Child Underweight",
  diarrhoea: "Diarrhoea Prevalence (children)",
  mhm: "Hygienic Menstrual Protection",
};

function fmt(n: number) {
  return n >= 1e7 ? `${(n / 1e7).toFixed(1)} Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)} L` : n.toLocaleString();
}

function riskColor(v: number) {
  return v >= 7 ? "#dc2626" : v >= 5 ? "#ea580c" : v >= 3 ? "#d97706" : "#16a34a";
}

function riskLabel(v: number) {
  return v >= 7 ? "EXTREME" : v >= 5 ? "HIGH" : v >= 3 ? "MODERATE" : "LOW";
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280", borderBottom: "1px solid #e5e7eb", paddingBottom: 4, marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function HazardBar({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  const pct = Math.min(100, (value / 10) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>{icon}</span>
      <span style={{ fontSize: 11, width: 110, color: "#374151" }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: "#f3f4f6", borderRadius: 9999, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 9999, background: color, width: `${pct}%` }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, width: 28, textAlign: "right", color }}>{value.toFixed(1)}</span>
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || "#111827", lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function NfhsFullProfile({ data }: {
  data: { state: string; categories: Record<string, { indicator: string; nfhs5: number; nfhs4: number | null }[]> };
}) {
  const categories = Object.entries(data.categories);
  const total = categories.reduce((s, [, v]) => s + v.length, 0);
  return (
    <Section title={`NFHS-5 Full Profile — ${total} indicators across ${categories.length} categories`}>
      <style>{`
        @media print {
          .nfhs-full-profile details summary { display: none; }
          .nfhs-full-profile details > div { display: block !important; }
        }
      `}</style>
      <div className="nfhs-full-profile">
        {categories.map(([category, indicators], i) => (
          <details key={category} open={i === 0} style={{ marginBottom: 8, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            <summary style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#374151", background: "#f9fafb", cursor: "pointer" }}>
              {category} <span style={{ fontWeight: 400, color: "#9ca3af" }}>({indicators.length})</span>
            </summary>
            <div style={{ padding: "4px 10px 8px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr style={{ color: "#9ca3af", textAlign: "left" }}>
                    <th style={{ fontWeight: 600, padding: "2px 6px 2px 0" }}>Indicator</th>
                    <th style={{ fontWeight: 600, padding: "2px 6px", textAlign: "right", width: 60 }}>NFHS-5</th>
                    <th style={{ fontWeight: 600, padding: "2px 0", textAlign: "right", width: 60 }}>NFHS-4</th>
                  </tr>
                </thead>
                <tbody>
                  {indicators.map((ind, j) => (
                    <tr key={j} style={{ borderTop: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "3px 6px 3px 0", color: "#374151" }}>{ind.indicator}</td>
                      <td style={{ padding: "3px 6px", textAlign: "right", fontWeight: 700, color: "#111827" }}>{ind.nfhs5}</td>
                      <td style={{ padding: "3px 0", textAlign: "right", color: "#9ca3af" }}>{ind.nfhs4 ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </Section>
  );
}

function Nfhs6StateTrend({ districtName, row }: { districtName: string; row: any }) {
  return (
    <Section title={`NFHS-6 Trends (state-level) — ${row.state}${row.small_sample ? " · small sample, wide CI" : ""}`}>
      <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 10, lineHeight: 1.5 }}>
        NFHS-6 fact sheets publish state totals only, not district breakdowns — the figures below describe{" "}
        <strong style={{ color: "#6b7280" }}>{row.state}</strong> as a whole, not {districtName} specifically.
        Sanitation, anaemia, clean fuel and handwashing aren't published in NFHS-6, so those indicators above stay NFHS-5.
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ color: "#9ca3af", textAlign: "left" }}>
            <th style={{ fontWeight: 600, padding: "2px 6px 4px 0" }}>Indicator</th>
            <th style={{ fontWeight: 600, padding: "2px 6px 4px", textAlign: "right", width: 60 }}>NFHS-5</th>
            <th style={{ fontWeight: 600, padding: "2px 6px 4px", textAlign: "right", width: 60 }}>NFHS-6</th>
            <th style={{ fontWeight: 600, padding: "2px 0 4px", textAlign: "right", width: 64 }}>Change</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(NFHS6_TREND_META).map(([key, label]) => {
            const cell = row[key];
            if (!cell) return null;
            return (
              <tr key={key} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={{ padding: "4px 6px 4px 0", color: "#374151" }}>{label}</td>
                <td style={{ padding: "4px 6px", textAlign: "right", color: "#9ca3af" }}>{cell.nfhs5}%</td>
                <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, color: "#111827" }}>{cell.nfhs6}%</td>
                <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 700, color: cell.improved ? "#16a34a" : "#dc2626" }}>
                  {cell.delta > 0 ? "+" : ""}{cell.delta}pp
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

// ── Main Report ──────────────────────────────────────────────────────────────

export default function ReportPage() {
  const params = useParams<{ district: string }>();
  const districtName = decodeURIComponent(params.district || "");

  const hexQ = useQuery<any[]>({
    queryKey: ["india-hex-props-raw"],
    queryFn: () => fetch("/data/india_hex_props.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const rankQ = useQuery<any[]>({
    queryKey: ["district-rankings"],
    queryFn: () => fetch("/data/district_rankings.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const gapQ = useQuery<any[]>({
    queryKey: ["gap-rankings"],
    queryFn: () => fetch("/data/gap_rankings.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const nfhs5ExtraQ = useQuery<Record<string, any>>({
    queryKey: ["nfhs5-extra"],
    queryFn: () => fetch("/data/nfhs5_extra.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const nfhs5FullQ = useQuery<Record<string, { state: string; categories: Record<string, { indicator: string; nfhs5: number; nfhs4: number | null }[]> }>>({
    queryKey: ["nfhs5-full-profile"],
    queryFn: () => fetch("/data/nfhs5_full_profile.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const nfhs6TrendsQ = useQuery<any>({
    queryKey: ["nfhs6-trends"],
    queryFn: () => fetch("/data/nfhs_trends.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const jjmQ = useQuery<Record<string, any>>({
    queryKey: ["jjm-district-fhtc"],
    queryFn: () => fetch("/data/jjm_district_fhtc.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const sbmQ = useQuery<Record<string, any>>({
    queryKey: ["sbm-toilet-types"],
    queryFn: () => fetch("/data/sbm_toilet_types.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const wqQ = useQuery<Record<string, any>>({
    queryKey: ["wash-quality"],
    queryFn: () => fetch("/data/wash_quality.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const peersQ = useQuery<Record<string, any[]>>({
    queryKey: ["peer-districts"],
    queryFn: () => fetch("/data/peer_districts.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const schemesQ = useQuery<Record<string, any[]>>({
    queryKey: ["scheme-coverage"],
    queryFn: () => fetch("/data/scheme_coverage.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const report = useMemo(() => {
    if (!hexQ.data || !districtName) return null;
    const hexes = hexQ.data.filter((p: any) => p.district_name === districtName);
    if (!hexes.length) return null;

    const n = hexes.length;
    const state = hexes[0].state;
    const pop = hexes.reduce((s: number, p: any) => s + (p.population || 0), 0);
    const children = hexes.reduce((s: number, p: any) => s + (p.pop_children_under_5 || 0), 0);
    const elderly = hexes.reduce((s: number, p: any) => s + (p.pop_elderly_60plus || 0), 0);
    const women = hexes.reduce((s: number, p: any) => s + (p.pop_women_15_49 || 0), 0);
    const avgRisk = hexes.reduce((s: number, p: any) => s + (p.hex_risk || 0), 0) / n;
    const maxRisk = Math.max(...hexes.map((p: any) => p.hex_risk || 0));
    const cascadeHexes = hexes.filter((p: any) => (p.cascade_count || 0) > 0).length;
    const avgAC = hexes.reduce((s: number, p: any) => s + (p.adaptive_capacity || 0), 0) / n;

    // WASH indicators
    const wash = {
      sanitation: hexes.reduce((s: number, p: any) => s + (p.wash_sanitation_pct || 0), 0) / n,
      water: hexes.reduce((s: number, p: any) => s + (p.wash_water_pct || 0), 0) / n,
      stunting: hexes.reduce((s: number, p: any) => s + (p.wash_stunting_pct || 0), 0) / n,
      wasting: hexes.reduce((s: number, p: any) => s + (p.wash_wasting_pct || 0), 0) / n,
      diarrhoea: hexes.reduce((s: number, p: any) => s + (p.wash_diarrhoea_pct || 0), 0) / n,
      anaemia: hexes.reduce((s: number, p: any) => s + (p.wash_anaemia_pct || 0), 0) / n,
      vaccination: hexes.reduce((s: number, p: any) => s + (p.wash_vaccination_pct || 0), 0) / n,
    };

    const hazards = Object.entries(HAZARD_META).map(([key, meta]) => ({
      key, ...meta,
      avg: hexes.reduce((s: number, p: any) => s + (p[key] || 0), 0) / n,
      max: Math.max(...hexes.map((p: any) => p[key] || 0)),
    })).sort((a, b) => b.avg - a.avg);

    const avgElev = hexes.reduce((s: number, p: any) => s + (p.elevation_mean || 0), 0) / n;
    const avgNdvi = hexes.reduce((s: number, p: any) => s + (p.ndvi_mean || 0), 0) / n;
    const landUse: Record<string, number> = {};
    for (const p of hexes) { const lu = p.land_use || "unknown"; landUse[lu] = (landUse[lu] || 0) + 1; }
    const topLandUse = Object.entries(landUse).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // Cascades
    const activeCascades: string[] = [];
    const topHazard = hazards[0];
    if (topHazard.avg > 3) {
      if (topHazard.key.includes("flood"))     { activeCascades.push("flood_pit_toilet"); activeCascades.push("flood_low_literacy"); }
      if (topHazard.key.includes("drought"))   { activeCascades.push("drought_water_scarcity"); activeCascades.push("drought_poverty"); }
      if (topHazard.key.includes("heat"))      activeCascades.push("heat_no_electricity");
      if (topHazard.key.includes("cyclone"))   activeCascades.push("cyclone_poor_sanitation");
      if (topHazard.key.includes("wetbulb"))   activeCascades.push("wetbulb_no_health");
      if (topHazard.key.includes("coldwave"))  activeCascades.push("coldwave_exposure");
      if (topHazard.key.includes("landslide")) activeCascades.push("landslide_remote");
    }

    // Technology plan
    const activeHazardKeys = hazards
      .filter((h) => h.key in RISK_TO_TECH_HAZARD && h.avg >= 2.5)
      .map((h) => RISK_TO_TECH_HAZARD[h.key]);
    const uniqueActiveHazards = activeHazardKeys.filter((h, i) => activeHazardKeys.indexOf(h) === i);
    const techScores: { slug: string; score: number; coveredHazards: string[] }[] = [];
    for (const [slug, tech] of Object.entries(technologyContent)) {
      if (!tech.hazardSuitability) continue;
      const covered = uniqueActiveHazards.filter((h) => tech.hazardSuitability![h] === "recommended");
      if (covered.length > 0) techScores.push({ slug, score: covered.length, coveredHazards: covered });
    }
    const COST_RANK: Record<string, number> = { Low: 0, Medium: 1, High: 2 };
    techScores.sort((a, b) => b.score - a.score || COST_RANK[technologyContent[a.slug].costLevel] - COST_RANK[technologyContent[b.slug].costLevel]);
    const recommendedTechs = techScores.slice(0, 6);

    return { state, n, pop, children, elderly, women, avgRisk, maxRisk, cascadeHexes, avgAC, wash, hazards, avgElev, avgNdvi, topLandUse, activeCascades, uniqueActiveHazards, recommendedTechs };
  }, [hexQ.data, districtName]);

  const ranking = useMemo(() => rankQ.data?.find((r: any) => r.district === districtName) ?? null, [rankQ.data, districtName]);
  const gap     = useMemo(() => gapQ.data?.find((r: any) => r.district === districtName) ?? null,  [gapQ.data, districtName]);

  const nfhsExtra = useMemo(() =>
    nfhs5ExtraQ.data?.[districtName] ?? null,
  [nfhs5ExtraQ.data, districtName]);

  const nfhsFull = useMemo(() =>
    nfhs5FullQ.data?.[districtName] ?? null,
  [nfhs5FullQ.data, districtName]);

  const nfhs6StateRow = useMemo(() => {
    if (!nfhs6TrendsQ.data || !report) return null;
    const target = NFHS6_STATE_ALIAS[report.state] ?? report.state;
    return nfhs6TrendsQ.data.states.find((s: any) => s.state === target) ?? null;
  }, [nfhs6TrendsQ.data, report]);

  const jjmData = useMemo(() => {
    if (!jjmQ.data) return null;
    return jjmQ.data[districtName.toUpperCase()] ?? null;
  }, [jjmQ.data, districtName]);

  const sbmData = useMemo(() => {
    if (!sbmQ.data || !report) return null;
    const stateKey = `${report.state.toUpperCase()}|${districtName.toUpperCase()}`;
    if (sbmQ.data[stateKey]) return sbmQ.data[stateKey];
    return Object.values(sbmQ.data).find((v: any) => v.district === districtName.toUpperCase()) ?? null;
  }, [sbmQ.data, districtName, report]);

  const wqEntry  = useMemo(() => wqQ.data?.[districtName] ?? null, [wqQ.data, districtName]);
  const peers    = useMemo(() => peersQ.data?.[districtName] ?? [], [peersQ.data, districtName]);
  const schemes  = useMemo(() => schemesQ.data?.[districtName] ?? [], [schemesQ.data, districtName]);

  const isLoading = hexQ.isLoading || rankQ.isLoading || gapQ.isLoading;
  if (isLoading) return <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading report…</div>;
  if (!report)   return <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>District "{districtName}" not found</div>;

  const tier = gap?.priority_tier ? TIER_META[gap.priority_tier] : null;

  return (
    <div style={{ background: "#fff", color: "#111827", minHeight: "100vh" }}>
      {/* Floating print button — hidden in print */}
      <button
        onClick={() => window.print()}
        className="print:hidden"
        style={{
          position: "fixed", top: 16, right: 16, zIndex: 1000,
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 14px", borderRadius: 8,
          border: "1px solid #e5e7eb", background: "#f9fafb",
          fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer",
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        }}
      >
        <Printer size={13} /> Print / PDF
      </button>

      {/* Report body */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "36px 32px 48px", fontFamily: "system-ui, sans-serif" }}>

        {/* ── HEADER ──────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 28, paddingBottom: 20, borderBottom: "2px solid #111827" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280", marginBottom: 4 }}>
                ClimResWASH · District Risk Profile
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, lineHeight: 1.1 }}>{districtName}</h1>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                {report.state}
                {ranking && <span style={{ marginLeft: 8, color: "#9ca3af" }}>· Rank #{ranking.rank} of 713 districts</span>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: riskColor(report.avgRisk), lineHeight: 1 }}>
                {riskLabel(report.avgRisk)}
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                Risk {report.avgRisk.toFixed(1)} / 10
              </div>
              {tier && (
                <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: tier.color, border: `1px solid ${tier.color}`, borderRadius: 20, padding: "2px 10px", display: "inline-block" }}>
                  {tier.label} Priority
                </div>
              )}
            </div>
          </div>
          <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 8 }}>
            Generated {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })} · {report.n} H3 res-5 hexagons (~{report.n * 252} km²)
          </div>
        </div>

        {/* ── AT A GLANCE ─────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 28 }}>
          <MetricCard label="Population" value={fmt(report.pop)} />
          <MetricCard label="Children <5" value={fmt(report.children)} />
          <MetricCard label="Elderly 60+" value={fmt(report.elderly)} />
          <MetricCard label="Avg Risk" value={`${report.avgRisk.toFixed(1)}/10`} color={riskColor(report.avgRisk)} />
          {SHOW_FUTURE_2050 && gap
            ? <MetricCard label="2050 Risk (SSP5)" value={`${gap.future_risk_ssp585_2050?.toFixed(1) ?? "—"}/10`}
                sub={gap.risk_escalation != null ? `${gap.risk_escalation >= 0 ? "+" : ""}${gap.risk_escalation.toFixed(1)} escalation` : undefined}
                color={gap.future_risk_ssp585_2050 >= 5 ? "#dc2626" : "#16a34a"} />
            : <MetricCard label="Adaptive Capacity" value={`${(report.avgAC * 100).toFixed(0)}%`} />
          }
        </div>

        {/* ── HAZARD PROFILE ──────────────────────────────────────────── */}
        <Section title="Hazard Profile — 10 channels">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
            {report.hazards.map((h) => (
              <HazardBar key={h.key} icon={h.icon} label={h.label} value={h.avg} color={h.color} />
            ))}
          </div>
          {report.cascadeHexes > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#dc2626", fontWeight: 600 }}>
              🔗 WASH cascades active in {report.cascadeHexes} of {report.n} hexes — compound risk amplified
            </div>
          )}
        </Section>

        {/* ── WASH INDICATORS ─────────────────────────────────────────── */}
        <Section title="WASH &amp; Health Indicators (NFHS-5)">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {[
              { label: "Safe Sanitation", value: report.wash.sanitation, good: true, unit: "%" },
              { label: "Safe Drinking Water", value: report.wash.water, good: true, unit: "%" },
              { label: "Full Vaccination", value: report.wash.vaccination, good: true, unit: "%" },
              { label: "Stunting (children)", value: report.wash.stunting, good: false, unit: "%" },
              { label: "Wasting (children)", value: report.wash.wasting, good: false, unit: "%" },
              { label: "Diarrhoea prevalence", value: report.wash.diarrhoea, good: false, unit: "%" },
              { label: "Anaemia (women)", value: report.wash.anaemia, good: false, unit: "%" },
              { label: "Adaptive Capacity", value: report.avgAC * 100, good: true, unit: "%" },
              ...(nfhsExtra ? [
                { label: "Menstrual hygiene", value: nfhsExtra.menstrual_hygiene_pct, good: true,  unit: "%" },
                { label: "Clean cooking fuel", value: nfhsExtra.clean_fuel_pct,        good: true,  unit: "%" },
                { label: "ORS use (diarrhoea)", value: nfhsExtra.ors_diarrhoea_pct,   good: true,  unit: "%" },
                { label: "Child marriage",      value: nfhsExtra.child_marriage_pct,   good: false, unit: "%" },
                { label: "Antenatal 4+ visits", value: nfhsExtra.antenatal_4visit_pct, good: true,  unit: "%" },
                { label: "Health insurance",    value: nfhsExtra.health_insurance_pct, good: true,  unit: "%" },
              ] : []),
            ].map(({ label, value, good, unit }) => {
              if (!value) return null;
              const bad = good ? value < 50 : value > 30;
              return (
                <div key={label} style={{ border: `1px solid ${bad ? "#fecaca" : "#e5e7eb"}`, borderRadius: 8, padding: "8px 10px", background: bad ? "#fff5f5" : "#fff" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: bad ? "#dc2626" : "#16a34a" }}>{value.toFixed(1)}{unit}</div>
                  <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{label}</div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── NFHS-5 FULL PROFILE (all indicators, all categories) ─────── */}
        {nfhsFull && <NfhsFullProfile data={nfhsFull} />}

        {/* ── NFHS-6 TRENDS (state-level context) ───────────────────────── */}
        {nfhs6StateRow && <Nfhs6StateTrend districtName={districtName} row={nfhs6StateRow} />}

        {/* ── JJM & SBM FIELD DATA ────────────────────────────────────── */}
        {(jjmData || sbmData) && (
          <Section title="Water Supply & Sanitation — Field Data">
            <div style={{ display: "grid", gridTemplateColumns: sbmData ? "1fr 1fr" : "1fr", gap: 16 }}>
              {jjmData && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#2563eb", marginBottom: 8 }}>🚰 JJM IMIS — Tap Water Coverage</div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1, border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 10px", textAlign: "center", background: "#eff6ff" }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: jjmData.fhtc_pct >= 80 ? "#16a34a" : jjmData.fhtc_pct >= 50 ? "#d97706" : "#dc2626" }}>{jjmData.fhtc_pct?.toFixed(1)}%</div>
                      <div style={{ fontSize: 9, color: "#6b7280" }}>FHTC Coverage</div>
                    </div>
                    <div style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{jjmData.hh_with_tap?.toLocaleString("en-IN")}</div>
                      <div style={{ fontSize: 9, color: "#6b7280" }}>HH with tap</div>
                    </div>
                    <div style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{jjmData.total_hh?.toLocaleString("en-IN")}</div>
                      <div style={{ fontSize: 9, color: "#6b7280" }}>Total HH</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 9, color: "#9ca3af" }}>Source: JJM IMIS (ejalshakti.gov.in) · {jjmData.date}</div>
                </div>
              )}
              {sbmData && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", marginBottom: 8 }}>🚽 SBM Phase 2 — Toilet Type Breakdown</div>
                  {[
                    { label: "Twin pit", pct: sbmData.twin_pit_pct, color: "#22c55e" },
                    { label: "Single pit", pct: sbmData.single_pit_pct, color: "#f97316" },
                    { label: "Septic + soak", pct: sbmData.septic_soak_pct, color: "#3b82f6" },
                    { label: "Septic (no soak)", pct: sbmData.septic_nosoak_pct, color: "#a855f7" },
                    { label: "Others", pct: sbmData.others_pct, color: "#94a3b8" },
                  ].map(({ label, pct, color }) => pct != null && (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: "#6b7280", width: 90, flexShrink: 0 }}>{label}</span>
                      <div style={{ flex: 1, height: 5, background: "#f3f4f6", borderRadius: 9999, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 9999, background: color, width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, width: 36, textAlign: "right" }}>{pct.toFixed(1)}%</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 6, fontSize: 9, color: "#6b7280" }}>
                    Total IHHL: <b>{sbmData.total_ihhl?.toLocaleString("en-IN")}</b> · Source: SBM Phase 2 IMIS · {sbmData.date}
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ── CASCADE INTERVENTIONS ───────────────────────────────────── */}
        {report.activeCascades.length > 0 && (
          <Section title="WASH Cascade Interventions">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {report.activeCascades.map((id) => CASCADE_ACTIONS[id] && (
                <div key={id} style={{ display: "flex", gap: 10, paddingLeft: 12, borderLeft: "3px solid #dc2626" }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", textTransform: "capitalize", marginBottom: 2 }}>
                      {id.replace(/_/g, " ")}
                    </div>
                    <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.5 }}>{CASCADE_ACTIONS[id]}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── INSTITUTION ACTION PLAN ─────────────────────────────────── */}
        {ranking?.recommendations && (
          <Section title="Institution Action Plan">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {(["school", "anganwadi", "household"] as const).map((inst) => {
                const rec = ranking.recommendations[inst];
                if (!rec?.measures?.length) return null;
                const m = INST_META[inst];
                return (
                  <div key={inst} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{m.icon} {m.label}</div>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                      {rec.measures.slice(0, 3).map((measure: string, i: number) => (
                        <li key={i} style={{ display: "flex", gap: 6, marginBottom: 5, fontSize: 10, color: "#374151", lineHeight: 1.4 }}>
                          <span style={{ color: "#9ca3af", flexShrink: 0, marginTop: 1 }}>•</span>
                          <span>{measure}</span>
                        </li>
                      ))}
                    </ul>
                    {rec.schemes?.length > 0 && (
                      <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #f3f4f6" }}>
                        {rec.schemes.map((s: string, i: number) => (
                          <div key={i} style={{ fontSize: 9, color: "#6b7280", marginBottom: 2 }}>💰 {s}</div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── TECHNOLOGY ACTION PLAN ──────────────────────────────────── */}
        {report.recommendedTechs.length > 0 && (
          <Section title={`WASH Technology Plan — active hazards: ${report.uniqueActiveHazards.join(", ")}`}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {report.recommendedTechs.map(({ slug, coveredHazards }) => {
                const tech = technologyContent[slug];
                const cat = CATEGORY_META[tech.category];
                if (!cat) return null;
                return (
                  <div key={slug} style={{ border: `1px solid ${cat.border}`, borderRadius: 10, padding: 12, background: cat.bg }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>{tech.title}</span>
                      <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, color: cat.text, border: `1px solid ${cat.border}`, borderRadius: 20, padding: "2px 8px", background: "#fff" }}>
                        {cat.icon} {cat.label}
                      </span>
                    </div>
                    <p style={{ fontSize: 10, color: "#374151", margin: "0 0 8px", lineHeight: 1.5, WebkitLineClamp: 2, overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical" as any }}>
                      {tech.climateResilience}
                    </p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 10, color: "#6b7280" }}>
                        Cost: <b>{tech.costLevel}</b> · Maint: <b>{tech.maintenanceLevel}</b>
                      </div>
                      <a href={`/technology/${slug}`} target="_blank" rel="noreferrer"
                        style={{ fontSize: 10, color: "#2563eb", textDecoration: "none" }}
                        className="print:hidden">Details →</a>
                    </div>
                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {coveredHazards.map((h) => (
                        <span key={h} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: "#fff", border: `1px solid ${cat.border}`, color: cat.text, fontWeight: 600 }}>
                          ✓ {h}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── WATER QUALITY ───────────────────────────────────────────── */}
        {wqEntry && (wqEntry.contaminants?.length > 0 || wqEntry.improved_water_pct != null) && (
          <Section title="Water Quality">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>CGWB Contamination Flags</div>
                {wqEntry.contaminants?.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {wqEntry.contaminants.map((c: string) => {
                      const colors: Record<string,string> = { fluoride:"#f59e0b", arsenic:"#dc2626", nitrate:"#16a34a", iron:"#ea580c", salinity:"#2563eb" };
                      return (
                        <span key={c} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: colors[c]+"20", border: `1px solid ${colors[c]}50`, color: colors[c] }}>
                          {c.toUpperCase()}
                        </span>
                      );
                    })}
                  </div>
                ) : <div style={{ fontSize: 11, color: "#16a34a", marginBottom: 8 }}>✓ No major contamination flags</div>}
                <div style={{ fontSize: 10, color: "#6b7280" }}>Source: CGWB Annual Report 2023-24</div>
                {wqEntry.contaminants?.includes("arsenic") && (
                  <div style={{ fontSize: 10, color: "#dc2626", marginTop: 6, lineHeight: 1.5 }}>⚠ Arsenic &gt;0.05 mg/L — carcinogenic. Priority: switch to treated piped supply or RO units.</div>
                )}
                {wqEntry.contaminants?.includes("fluoride") && (
                  <div style={{ fontSize: 10, color: "#d97706", marginTop: 6, lineHeight: 1.5 }}>⚠ Fluoride &gt;1.5 mg/L — skeletal/dental fluorosis risk. Test all JJM sources.</div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>NFHS-5 Water Indicators</div>
                {[
                  { label: "Improved water source", val: wqEntry.improved_water_pct, unit: "%" },
                  { label: "Wasting (acute malnutrition)", val: wqEntry.wasting_pct, unit: "%" },
                  { label: "Severe wasting", val: wqEntry.severe_wasting_pct, unit: "%" },
                ].map(({ label, val, unit }) => val != null && (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11 }}>
                    <span style={{ color: "#374151" }}>{label}</span>
                    <span style={{ fontWeight: 700 }}>{val.toFixed(1)}{unit}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* ── PEER DISTRICTS ──────────────────────────────────────────── */}
        {peers.length > 0 && (
          <Section title="Peer District Benchmarks">
            <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 10 }}>
              Same dominant hazard · cross-state · closest risk + adaptive capacity profile
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb", color: "#6b7280", fontSize: 9, textTransform: "uppercase" }}>
                  <th style={{ textAlign: "left", paddingBottom: 6, fontWeight: 700 }}>District / State</th>
                  <th style={{ textAlign: "right", paddingBottom: 6, fontWeight: 700 }}>Risk</th>
                  <th style={{ textAlign: "right", paddingBottom: 6, fontWeight: 700 }}>Sanit %</th>
                  <th style={{ textAlign: "right", paddingBottom: 6, fontWeight: 700 }}>JJM %</th>
                  <th style={{ textAlign: "right", paddingBottom: 6, fontWeight: 700 }}>MHM %</th>
                  <th style={{ textAlign: "right", paddingBottom: 6, fontWeight: 700 }}>Stunting</th>
                </tr>
              </thead>
              <tbody>
                {peers.map((p: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: p.is_best_sanitation ? "#f0fdf4" : "transparent" }}>
                    <td style={{ padding: "5px 0" }}>
                      <span style={{ fontWeight: p.is_best_sanitation ? 700 : 400 }}>{p.district}</span>
                      {p.is_best_sanitation && <span style={{ marginLeft: 6, fontSize: 8, color: "#16a34a", fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: "#dcfce7", border: "1px solid #bbf7d0" }}>BEST SANIT.</span>}
                      <br /><span style={{ color: "#9ca3af", fontSize: 9 }}>{p.state}</span>
                    </td>
                    <td style={{ textAlign: "right", padding: "5px 0" }}>{p.risk?.toFixed(1) ?? "—"}</td>
                    <td style={{ textAlign: "right", padding: "5px 0", fontWeight: 600 }}>{p.wash_sanitation_pct?.toFixed(0) ?? "—"}</td>
                    <td style={{ textAlign: "right", padding: "5px 0" }}>{p.jjm_fhtc_pct?.toFixed(0) ?? "—"}</td>
                    <td style={{ textAlign: "right", padding: "5px 0" }}>{p.menstrual_hygiene_pct?.toFixed(0) ?? "—"}</td>
                    <td style={{ textAlign: "right", padding: "5px 0" }}>{p.stunting_pct?.toFixed(0) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* ── SCHEME COVERAGE ─────────────────────────────────────────── */}
        {schemes.length > 0 && (
          <Section title="Recommended Government Schemes">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {schemes.slice(0, 8).map((s: any, i: number) => (
                <div key={i} style={{
                  border: `1px solid ${s.priority === "critical" ? "#fca5a5" : s.priority === "high" ? "#fde68a" : "#e5e7eb"}`,
                  borderRadius: 8, padding: "8px 10px",
                  background: s.priority === "critical" ? "#fef2f2" : s.priority === "high" ? "#fffbeb" : "#fafafa",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 8, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
                      background: s.priority === "critical" ? "#fee2e2" : s.priority === "high" ? "#fef3c7" : "#f3f4f6",
                      color: s.priority === "critical" ? "#dc2626" : s.priority === "high" ? "#d97706" : "#6b7280",
                    }}>{s.priority.toUpperCase()}</span>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>{s.code}</span>
                  </div>
                  <div style={{ fontSize: 9, color: "#374151", marginBottom: 3, lineHeight: 1.4 }}>{s.rationale}</div>
                  <div style={{ fontSize: 9, color: "#6b7280" }}>{s.ministry}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── TERRAIN ─────────────────────────────────────────────────── */}
        <Section title="Terrain &amp; Land Use">
          <div style={{ display: "flex", gap: 32, fontSize: 12 }}>
            <div><span style={{ color: "#6b7280" }}>Avg elevation: </span><b>{Math.round(report.avgElev)} m</b></div>
            <div><span style={{ color: "#6b7280" }}>Avg NDVI: </span><b>{report.avgNdvi.toFixed(2)}</b></div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ color: "#6b7280" }}>Land use:</span>
              {report.topLandUse.map(([lu, count]) => (
                <span key={lu}><b style={{ textTransform: "capitalize" }}>{lu}</b> ({count} hex)</span>
              ))}
            </div>
          </div>
        </Section>

        {/* ── FOOTER ──────────────────────────────────────────────────── */}
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16, marginTop: 12, fontSize: 9, color: "#9ca3af", lineHeight: 1.7 }}>
          <p style={{ margin: "0 0 4px" }}>
            <b>Data:</b> SRTM 90m (elevation) · MODIS 2023 (NDVI) · ESA WorldCover 2021 (land use) · NFHS-5/DHS (WASH) · NITI Aayog MPI (poverty) · Census 2011 (population) · Open-Meteo/ECMWF (forecast) · CMIP6/NEX-GDDP (future projections)
          </p>
          <p style={{ margin: 0 }}>
            <b>Methodology:</b> ClimResWASH risk formula (IPCC AR6 framework) · Calibrated against 5 real disaster events · {report.n} H3 res-5 hexagons at ~252 km² each · <b>ClimResWASH — Climate-Resilient Water, Sanitation &amp; Hygiene Platform</b>
          </p>
        </div>
      </div>
    </div>
  );
}
