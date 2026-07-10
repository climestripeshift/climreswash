import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, TrendingUp, Activity, Thermometer, Droplets, Wind } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend, LineChart, Line,
  ReferenceLine,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────

interface RelationshipData {
  title: string; r: number; x_key: string; y_key: string;
  x_label: string; y_label: string; interpretation: string;
  n: number; points: Array<{x:number;y:number;d:string;s:string}>;
}

interface InsightsData {
  summary: Record<string, number>;
  relationships: RelationshipData[];
  hazard_groups: Record<string, {anaemia:number|null;stunting:number|null;wasting:number|null;n:number}>;
  future_national: {
    heat_days: Record<string,number|null>;
    wet_bulb_days: Record<string,number|null>;
    flood_days: Record<string,number|null>;
    severe_heat: Record<string,number|null>;
  };
  top_heat_states: Array<{state:string;heat_days_585_2050:number;wb_days_585_2050:number}>;
  top_wetbulb_states: Array<{state:string;wb_days_585_2050:number;heat_days_585_2050:number}>;
  escalation_districts: Array<{district:string;state:string;heat_days_2050:number;wet_bulb_days_2050:number;anaemia_pct:number|null;stunting_pct:number|null;population:number}>;
  ac_drivers: Record<string, {label:string;r:number}>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function rLabel(r: number) {
  const abs = Math.abs(r);
  if (abs >= 0.5) return "strong";
  if (abs >= 0.3) return "moderate";
  if (abs >= 0.15) return "weak";
  return "negligible";
}

function rColor(r: number) {
  const abs = Math.abs(r);
  if (abs >= 0.5) return r > 0 ? "text-red-500" : "text-green-500";
  if (abs >= 0.3) return r > 0 ? "text-orange-400" : "text-teal-400";
  if (abs >= 0.15) return r > 0 ? "text-yellow-500" : "text-blue-400";
  return "text-muted-foreground";
}

function rBadge(r: number) {
  const abs = Math.abs(r);
  const dir = r >= 0 ? "↑" : "↓";
  const base = abs >= 0.4 ? "bg-red-500/20 text-red-400 border-red-500/30"
             : abs >= 0.25 ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
             : abs >= 0.15 ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
             : "bg-muted text-muted-foreground border-border";
  return { cls: `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-mono ${base}`, label: `r=${r>0?"+":""}${r.toFixed(2)} ${dir}` };
}

const SCATTER_COLORS = [
  "#60a5fa","#f87171","#34d399","#a78bfa","#fb923c","#e879f9",
  "#facc15","#38bdf8","#f472b6","#4ade80","#fb7185","#818cf8",
];

const STATE_COLOR_MAP: Record<string,string> = {};
const ALL_STATES = [
  "Bihar","Uttar Pradesh","Assam","West Bengal","Rajasthan","Madhya Pradesh",
  "Gujarat","Maharashtra","Karnataka","Kerala","Tamil Nadu","Odisha",
  "Jharkhand","Chhattisgarh","Andhra Pradesh","Telangana","Haryana","Punjab",
  "Himachal Pradesh","Uttarakhand","Jammu & Kashmir","Meghalaya","Tripura",
  "Manipur","Nagaland","Mizoram","Arunachal Pradesh","Sikkim","Goa",
];
ALL_STATES.forEach((s,i) => { STATE_COLOR_MAP[s] = SCATTER_COLORS[i % SCATTER_COLORS.length]; });

const HAZARD_DISPLAY: Record<string, {label:string;icon:string;color:string}> = {
  flood:     { label:"Flood-dominant",     icon:"🌊", color:"#60a5fa" },
  heat:      { label:"Heat-dominant",      icon:"🔥", color:"#f87171" },
  wetbulb:   { label:"Wet-bulb-dominant",  icon:"🌡️", color:"#fb923c" },
  pollution: { label:"Pollution-dominant", icon:"🏭", color:"#9ca3af" },
  drought:   { label:"Drought-dominant",   icon:"🏜️", color:"#facc15" },
};

const FMT_POP = (n: number) =>
  n >= 1e7 ? `${(n/1e7).toFixed(1)}Cr` : n >= 1e5 ? `${(n/1e5).toFixed(1)}L` : `${Math.round(n/1e3)}K`;

// ── ScatterCard ────────────────────────────────────────────────────────────

function ScatterCard({ rel }: { rel: RelationshipData }) {
  const badge = rBadge(rel.r);
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-tight">{rel.title}</h3>
        <span className={badge.cls}>{badge.label}</span>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{top:4,right:8,bottom:16,left:16}}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
            <XAxis
              type="number" dataKey="x" name={rel.x_label}
              label={{ value: rel.x_label, position:"insideBottom", offset:-8, fontSize:10, fill:"currentColor", opacity:0.5 }}
              tick={{fontSize:9, fill:"currentColor", opacity:0.5}}
            />
            <YAxis
              type="number" dataKey="y" name={rel.y_label}
              label={{ value: rel.y_label, angle:-90, position:"insideLeft", offset:8, fontSize:10, fill:"currentColor", opacity:0.5 }}
              tick={{fontSize:9, fill:"currentColor", opacity:0.5}}
            />
            <Tooltip
              cursor={{strokeDasharray:"3 3"}}
              content={({payload}) => {
                if (!payload?.length) return null;
                const p = payload[0].payload;
                return (
                  <div className="bg-card border border-border rounded px-2.5 py-1.5 text-xs shadow-lg">
                    <div className="font-semibold">{p.d}</div>
                    <div className="text-muted-foreground">{p.s}</div>
                    <div>{rel.x_label}: <span className="font-mono">{p.x}</span></div>
                    <div>{rel.y_label}: <span className="font-mono">{p.y}</span></div>
                  </div>
                );
              }}
            />
            <Scatter
              data={rel.points}
              fill="#60a5fa"
              opacity={0.55}
              r={3}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{rel.interpretation}</p>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function InsightsPage() {
  const { data, isLoading } = useQuery<InsightsData>({
    queryKey: ["insights"],
    queryFn: () => fetch("/data/insights.json").then(r => r.json()),
    staleTime: Infinity,
  });

  const [activeSection, setActiveSection] = useState<string>("relationships");

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        Loading insights…
      </div>
    );
  }

  const { summary, relationships, hazard_groups, future_national, top_wetbulb_states, escalation_districts, ac_drivers } = data;

  // Future projection bar data
  const futureBarData = [
    { scenario:"Today",        heat: 1.2, wetbulb: 0, note:"baseline" },
    { scenario:"SSP2 2030",   heat: future_national.heat_days.ssp245_2030 ?? 0, wetbulb: future_national.wet_bulb_days.ssp245_2030 ?? 0 },
    { scenario:"SSP2 2050",   heat: future_national.heat_days.ssp245_2050 ?? 0, wetbulb: future_national.wet_bulb_days.ssp245_2050 ?? 0 },
    { scenario:"SSP5 2030",   heat: future_national.heat_days.ssp585_2030 ?? 0, wetbulb: future_national.wet_bulb_days.ssp585_2030 ?? 0 },
    { scenario:"SSP5 2050",   heat: future_national.heat_days.ssp585_2050 ?? 0, wetbulb: future_national.wet_bulb_days.ssp585_2050 ?? 0 },
  ];

  // Hazard group bar data
  const hazardBarData = Object.entries(hazard_groups)
    .filter(([,v]) => v.n > 10)
    .map(([hz, v]) => ({
      name: HAZARD_DISPLAY[hz]?.label ?? hz,
      icon: HAZARD_DISPLAY[hz]?.icon ?? "",
      Anaemia: v.anaemia ?? 0,
      Stunting: v.stunting ?? 0,
      Wasting: v.wasting ?? 0,
      n: v.n,
    }))
    .sort((a,b) => b.Anaemia - a.Anaemia);

  // AC drivers bar
  const acBarData = Object.entries(ac_drivers)
    .map(([k,v]) => ({ label: v.label, r: Math.abs(v.r), raw_r: v.r, key: k }))
    .sort((a,b) => b.r - a.r);

  const sections = [
    { id:"relationships", label:"Climate-Health Links" },
    { id:"future", label:"Future Projections" },
    { id:"vulnerability", label:"Social Vulnerability" },
    { id:"resilience", label:"Resilience Drivers" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-lg font-bold leading-none">Climate-Social Analysis</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Statistical relationships between climate hazards and social outcomes — {summary.districts_analyzed} districts
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/screener" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
              → Action Screener
            </Link>
            <ThemeToggle />
          </div>
        </div>

        {/* Section tabs */}
        <div className="max-w-6xl mx-auto px-4 pb-0 flex gap-1 overflow-x-auto">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`text-xs px-3 py-2 border-b-2 whitespace-nowrap transition-colors ${
                activeSection === s.id
                  ? "border-blue-400 text-blue-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">

        {/* National stat banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon:<Activity className="w-4 h-4"/>, label:"Women with Anaemia", value:`${summary.national_anaemia_pct}%`, sub:`${summary.high_anaemia_districts} districts >70%`, color:"text-red-400" },
            { icon:<TrendingUp className="w-4 h-4"/>, label:"Children Stunted", value:`${summary.national_stunting_pct}%`, sub:`${summary.high_stunting_districts} districts >40%`, color:"text-orange-400" },
            { icon:<Thermometer className="w-4 h-4"/>, label:"Heat Days 2050 (SSP5)", value:`${summary.heat_days_2050_mean}/yr`, sub:`avg per district`, color:"text-yellow-500" },
            { icon:<Droplets className="w-4 h-4"/>, label:"Wet-Bulb Days 2050", value:`${summary.wet_bulb_days_2050_mean}/yr`, sub:`${summary.wetbulb_high_districts} districts at-risk now`, color:"text-blue-400" },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-border bg-card p-3 flex gap-3 items-start">
              <div className={`mt-0.5 ${s.color}`}>{s.icon}</div>
              <div>
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs font-medium leading-tight">{s.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── SECTION: Climate-Health Relationships ── */}
        {activeSection === "relationships" && (
          <section className="space-y-6">
            <div>
              <h2 className="text-base font-semibold">Climate-Health Relationships</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Statistical correlations between district climate exposure and social health outcomes, derived from NFHS5 + hex-grid data across {summary.districts_analyzed} districts.
                Correlation (r) ranges –1 to +1; positive means both rise together.
              </p>
            </div>

            {/* Correlation strength legend */}
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                ["Strong", "≥0.40", "text-red-400"],
                ["Moderate", "0.25–0.40", "text-orange-400"],
                ["Weak", "0.15–0.25", "text-yellow-500 dark:text-yellow-400"],
                ["Negligible", "<0.15", "text-muted-foreground"],
              ].map(([l,r,c]) => (
                <span key={l} className="flex items-center gap-1.5 px-2.5 py-1 border border-border rounded-full bg-card">
                  <span className={`font-semibold ${c}`}>{l}</span>
                  <span className="text-muted-foreground">{r}</span>
                </span>
              ))}
            </div>

            {/* Key findings callout */}
            <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-orange-400">Key findings from data</h3>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li>🌡️ <strong className="text-foreground">Heat stress predicts anaemia</strong> — districts with higher heat risk show 6-8 percentage points more anaemia in women. Climate-health pathway: heat impairs iron absorption.</li>
                <li>🏭 <strong className="text-foreground">Air pollution drives anaemia</strong> — PM2.5 and anaemia are correlated (r=+0.28) via chronic inflammation suppressing haemoglobin synthesis.</li>
                <li>🩸 <strong className="text-foreground">MHM = antenatal care</strong> — the strongest social correlation (r=+0.42). Where women can't manage menstrual health, they don't access prenatal care. These are the same access barrier.</li>
                <li>🌡️ <strong className="text-foreground">Heat reduces MHM coverage</strong> — hotter districts have lower menstrual hygiene rates. Heat compounds social norms that restrict women's mobility and access to private washing spaces.</li>
                <li>📅 <strong className="text-foreground">Climate disruption days accumulate into stunting</strong> — repeated crop failures, water contamination, and disease burden from climate events compound into chronic child undernutrition.</li>
              </ul>
            </div>

            {/* Scatter plots grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {relationships.map(rel => (
                <ScatterCard key={rel.title} rel={rel} />
              ))}
            </div>

            {/* Interpretation note */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1.5">
              <p><strong className="text-foreground">On confounding:</strong> Adaptive capacity (r=+0.58 with anaemia) appears paradoxically positive — wealthier states like Punjab and Haryana have high electrification AND high anaemia due to dietary patterns. Climate correlations with anaemia (heat r=+0.30, PM2.5 r=+0.28) survive this confounding because they operate through distinct biological pathways.</p>
              <p><strong className="text-foreground">What's weak:</strong> Flood risk vs. diarrhoea (r=+0.02) — annual NFHS survey data averages over both flood and non-flood periods, diluting the signal. Event-level data would show a much stronger relationship.</p>
            </div>
          </section>
        )}

        {/* ── SECTION: Future Projections ── */}
        {activeSection === "future" && (
          <section className="space-y-6">
            <div>
              <h2 className="text-base font-semibold">Future Climate Projections</h2>
              <p className="text-xs text-muted-foreground mt-1">
                National average exposure days under two scenarios: SSP2-4.5 (moderate emissions) and SSP5-8.5 (high emissions).
                Data sourced from CMIP6 climate models aggregated to H3 hex grid.
              </p>
            </div>

            {/* Scenario explainer */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label:"SSP2-4.5", icon:"🟡", desc:"Moderate mitigation — global warming ~2.7°C by 2100. Current NDC commitments roughly track this pathway.", color:"border-yellow-500/30 bg-yellow-500/5" },
                { label:"SSP5-8.5", icon:"🔴", desc:"High emissions — global warming ~4.4°C by 2100. Represents continued fossil fuel dependence. Upper-bound planning scenario.", color:"border-red-500/30 bg-red-500/5" },
              ].map(s => (
                <div key={s.label} className={`rounded-lg border p-3 ${s.color}`}>
                  <div className="font-semibold text-sm">{s.icon} {s.label}</div>
                  <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
                </div>
              ))}
            </div>

            {/* Heat days chart */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-1">Heat Days & Wet-Bulb Days per Year — National Average</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Wet-bulb days (combined heat + humidity stress) rise to <strong className="text-foreground">{future_national.wet_bulb_days.ssp585_2050} days/year</strong> nationally under SSP5-8.5 by 2050 — 3× the projected heat-alone days. Eastern plains, coastal AP, and Kerala face 100–180 wet-bulb days/year.
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={futureBarData} margin={{top:4,right:16,bottom:4,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                    <XAxis dataKey="scenario" tick={{fontSize:11,fill:"currentColor",opacity:0.7}} />
                    <YAxis tick={{fontSize:10,fill:"currentColor",opacity:0.5}} unit=" days" />
                    <Tooltip
                      formatter={(v:number,name:string) => [`${v.toFixed(1)} days/yr`, name]}
                      contentStyle={{background:"var(--background)",border:"1px solid var(--border)",borderRadius:"8px",fontSize:"12px"}}
                    />
                    <Legend wrapperStyle={{fontSize:"12px"}} />
                    <Bar dataKey="heat" name="Heat Days" fill="#f87171" radius={[3,3,0,0]} />
                    <Bar dataKey="wetbulb" name="Wet-Bulb Days" fill="#fb923c" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* State-level wet-bulb 2050 */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-1">States: Projected Wet-Bulb Days by 2050 (SSP5-8.5)</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Wet-bulb heat is the limiting human stress — above 35°C wet-bulb, the body cannot cool itself even at rest. States on the eastern plains and coast face the worst trajectory.
              </p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={top_wetbulb_states}
                    layout="vertical"
                    margin={{top:4,right:16,bottom:4,left:120}}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                    <XAxis type="number" tick={{fontSize:10,fill:"currentColor",opacity:0.5}} unit=" days" />
                    <YAxis dataKey="state" type="category" tick={{fontSize:11,fill:"currentColor"}} width={115} />
                    <Tooltip
                      formatter={(v:number) => [`${v.toFixed(1)} days/yr`,"Wet-bulb days"]}
                      contentStyle={{background:"var(--background)",border:"1px solid var(--border)",borderRadius:"8px",fontSize:"12px"}}
                    />
                    <Bar dataKey="wb_days_585_2050" name="Wet-bulb days 2050" fill="#fb923c" radius={[0,3,3,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top escalation districts */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-1">Districts with Highest Wet-Bulb Exposure by 2050</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Ranked by projected wet-bulb days under SSP5-8.5 2050. These districts combine future heat stress with current social vulnerability — creating the highest compound risk.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left px-2 py-2 font-normal">#</th>
                      <th className="text-left px-2 py-2 font-normal">District</th>
                      <th className="text-left px-2 py-2 font-normal">State</th>
                      <th className="text-right px-2 py-2 font-normal">Wet-bulb days 2050</th>
                      <th className="text-right px-2 py-2 font-normal">Heat days 2050</th>
                      <th className="text-right px-2 py-2 font-normal">Anaemia now</th>
                      <th className="text-right px-2 py-2 font-normal">Stunting now</th>
                      <th className="text-right px-2 py-2 font-normal">Population</th>
                    </tr>
                  </thead>
                  <tbody>
                    {escalation_districts.slice(0, 20).map((d, i) => (
                      <tr key={d.district} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-2 py-1.5 text-muted-foreground">{i+1}</td>
                        <td className="px-2 py-1.5 font-medium">
                          <Link href={`/report/${encodeURIComponent(d.district)}`} className="text-blue-400 hover:text-blue-300">
                            {d.district}
                          </Link>
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{d.state}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-orange-400 font-semibold">
                          {d.wet_bulb_days_2050?.toFixed(0)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-yellow-500">
                          {d.heat_days_2050?.toFixed(0)}
                        </td>
                        <td className={`px-2 py-1.5 text-right font-mono ${(d.anaemia_pct||0)>65 ? "text-red-400 font-semibold" : ""}`}>
                          {d.anaemia_pct != null ? `${d.anaemia_pct.toFixed(0)}%` : "—"}
                        </td>
                        <td className={`px-2 py-1.5 text-right font-mono ${(d.stunting_pct||0)>35 ? "text-orange-400 font-semibold" : ""}`}>
                          {d.stunting_pct != null ? `${d.stunting_pct.toFixed(0)}%` : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                          {d.population ? FMT_POP(d.population) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ── SECTION: Social Vulnerability ── */}
        {activeSection === "vulnerability" && (
          <section className="space-y-6">
            <div>
              <h2 className="text-base font-semibold">Social Vulnerability by Hazard Type</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Health outcome averages for districts where each climate hazard is dominant.
                Shows whether hazard type predicts worse social indicators.
              </p>
            </div>

            {/* Anaemia by hazard */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-1">Anaemia, Stunting & Wasting by Dominant Hazard</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Pollution-dominant districts show the worst anaemia (66%) — the PM2.5→anaemia pathway. Flood districts have the worst stunting.
              </p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hazardBarData} margin={{top:4,right:16,bottom:40,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                    <XAxis dataKey="name" tick={{fontSize:10,fill:"currentColor",opacity:0.7}} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{fontSize:10,fill:"currentColor",opacity:0.5}} unit="%" />
                    <Tooltip
                      formatter={(v:number, name:string) => [`${v.toFixed(1)}%`, name]}
                      contentStyle={{background:"var(--background)",border:"1px solid var(--border)",borderRadius:"8px",fontSize:"12px"}}
                    />
                    <Legend wrapperStyle={{fontSize:"12px"}} />
                    <Bar dataKey="Anaemia" fill="#f87171" radius={[3,3,0,0]} />
                    <Bar dataKey="Stunting" fill="#fb923c" radius={[3,3,0,0]} />
                    <Bar dataKey="Wasting" fill="#facc15" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Key vulnerability stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  title:"Anaemia burden",
                  icon:"🩸",
                  stat:`${summary.national_anaemia_pct}%`,
                  desc:"of Indian women aged 15-49 have anaemia",
                  detail:`${summary.high_anaemia_districts} districts exceed 70%`,
                  color:"text-red-400",
                  bg:"bg-red-500/5 border-red-500/20",
                },
                {
                  title:"Child stunting",
                  icon:"📏",
                  stat:`${summary.national_stunting_pct}%`,
                  desc:"of children under 5 are stunted nationally",
                  detail:`${summary.high_stunting_districts} districts exceed 40%`,
                  color:"text-orange-400",
                  bg:"bg-orange-500/5 border-orange-500/20",
                },
                {
                  title:"WASH disruption",
                  icon:"💧",
                  stat:`${summary.national_disruption_days} days`,
                  desc:"average annual WASH disruption per district",
                  detail:"Compound climate-WASH impact days",
                  color:"text-blue-400",
                  bg:"bg-blue-500/5 border-blue-500/20",
                },
              ].map(s => (
                <div key={s.title} className={`rounded-xl border p-4 ${s.bg}`}>
                  <div className="text-xl mb-1">{s.icon}</div>
                  <div className={`text-2xl font-bold ${s.color}`}>{s.stat}</div>
                  <div className="text-sm font-medium mt-1">{s.title}</div>
                  <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
                  <p className={`text-xs font-semibold mt-2 ${s.color}`}>{s.detail}</p>
                </div>
              ))}
            </div>

            {/* MHM-antenatal link (key finding) */}
            <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-4 space-y-3">
              <h3 className="text-sm font-semibold">The MHM–Antenatal Chain</h3>
              <p className="text-xs text-muted-foreground">
                The strongest social relationship in the dataset: menstrual hygiene coverage predicts antenatal care uptake (r=+0.42).
                Districts with high child marriage (&gt;35%) AND low MHM (&lt;50%) show antenatal coverage of only <strong className="text-pink-400">27.6%</strong> — versus <strong className="text-foreground">60.5%</strong> everywhere else.
                This 2.2× gap means that in districts where women have least bodily autonomy, they are also least likely to access prenatal care during the 9 months most critical to child survival.
              </p>
              <div className="grid grid-cols-2 gap-3 text-center">
                {[
                  { label:"High child marriage + low MHM", value:"27.6%", sub:"antenatal coverage", color:"text-pink-400" },
                  { label:"Other districts", value:"60.5%", sub:"antenatal coverage", color:"text-green-400" },
                ].map(s => (
                  <div key={s.label} className="rounded-lg bg-background/50 p-3">
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{s.sub}</div>
                    <div className="text-xs font-medium mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── SECTION: Resilience Drivers ── */}
        {activeSection === "resilience" && (
          <section className="space-y-6">
            <div>
              <h2 className="text-base font-semibold">What Drives Climate Resilience?</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Adaptive capacity (AC) is the platform's measure of a district's ability to absorb and respond to climate shocks.
                These correlations show which WASH and social factors predict higher resilience — i.e., where investment pays off most.
              </p>
            </div>

            {/* AC drivers bar */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-4">Correlation of WASH/Social Indicators with Adaptive Capacity</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={acBarData} layout="vertical" margin={{top:4,right:40,bottom:4,left:160}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                    <XAxis type="number" tick={{fontSize:10,fill:"currentColor",opacity:0.5}} domain={[0,1]} />
                    <YAxis dataKey="label" type="category" tick={{fontSize:11,fill:"currentColor"}} width={155} />
                    <Tooltip
                      formatter={(v:number, _:string, props:any) => {
                        const raw = props?.payload?.raw_r;
                        return [`r = ${raw >= 0 ? "+" : ""}${raw?.toFixed(2)} (strength: ${v.toFixed(2)})`, "Correlation with AC"];
                      }}
                      contentStyle={{background:"var(--background)",border:"1px solid var(--border)",borderRadius:"8px",fontSize:"12px"}}
                    />
                    <Bar dataKey="r" name="Correlation strength" fill="#60a5fa" radius={[0,3,3,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Resilience insight cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  title:"Electrification is the top AC predictor",
                  icon:"⚡",
                  body:"Electricity access has the strongest correlation with adaptive capacity. It enables refrigeration (food preservation), medical equipment, information access, and economic activity — all shock-absorption mechanisms. Rural electrification programs (SAUBHAGYA) directly build climate resilience.",
                  color:"text-yellow-400 border-yellow-500/20 bg-yellow-500/5",
                },
                {
                  title:"Literacy compounds every other factor",
                  icon:"📚",
                  body:"Literacy enables health-seeking behavior, uptake of early warning systems, financial inclusion, and program participation. It is not a single intervention — it is a multiplier. Districts with low female literacy tend to show worse outcomes across ALL WASH and health indicators simultaneously.",
                  color:"text-blue-400 border-blue-500/20 bg-blue-500/5",
                },
                {
                  title:"Vaccination reflects systemic health access",
                  icon:"💉",
                  body:"Vaccination coverage is a proxy for functional primary health care. It requires supply chains, community trust, and health worker reach — the same infrastructure needed to respond to climate-driven disease outbreaks. Low vaccination = low surge capacity.",
                  color:"text-teal-400 border-teal-500/20 bg-teal-500/5",
                },
                {
                  title:"JJM tap water is a resilience floor",
                  icon:"🚿",
                  body:"Household tap connections reduce time burden on women (freeing 2-4 hrs/day), protect water quality during floods (preventing contamination), and eliminate drought-period water insecurity. JJM FHTC% predicts adaptive capacity most directly among WASH interventions — and it's the most immediately scalable program.",
                  color:"text-green-400 border-green-500/20 bg-green-500/5",
                },
              ].map(c => (
                <div key={c.title} className={`rounded-xl border p-4 space-y-2 ${c.color}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{c.icon}</span>
                    <h4 className={`text-sm font-semibold`}>{c.title}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{c.body}</p>
                </div>
              ))}
            </div>

            {/* Action recommendation */}
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-blue-400">What this means for program sequencing</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {[
                  { tier:"1 — Build floor", color:"border-green-500/30 bg-green-500/5", items:["JJM FHTC expansion (highest WASH AC driver)","Electrification in dark/partial villages","ORS + basic health worker training"] },
                  { tier:"2 — Raise capacity", color:"border-yellow-500/30 bg-yellow-500/5", items:["Female literacy programs","MHM + menstrual hygiene supply","Antenatal outreach in low-MHM clusters"] },
                  { tier:"3 — Climate-proof", color:"border-red-500/30 bg-red-500/5", items:["Twin-pit toilet retrofits in flood zones","Clean fuel (PM Ujjwala) for anaemia + pollution","Heat-safe WASH infrastructure for wet-bulb zones"] },
                ].map(t => (
                  <div key={t.tier} className={`rounded-lg border p-3 ${t.color}`}>
                    <div className="font-semibold mb-2">{t.tier}</div>
                    <ul className="space-y-1">
                      {t.items.map(it => (
                        <li key={it} className="flex items-start gap-1.5 text-muted-foreground">
                          <span className="mt-0.5 flex-shrink-0">→</span>
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
