import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from "recharts";
import {
  ArrowLeft, AlertTriangle, Users, Baby, Droplets,
  ChevronDown, ChevronUp, ChevronsUpDown, Search, ExternalLink,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

// ── Types ──────────────────────────────────────────────────────────────────

interface ElNinoDistrict {
  district: string; state: string;
  score: number; level: "critical"|"high"|"moderate"|"low";
  drought: number; heat: number; gw_stress: number; sanitation: number;
  stunting_pct: number; wasting_pct: number; anaemia_pct: number;
  burden_ch: number;
  population: number; children_u5: number; elderly: number;
}

interface StateSummary {
  state: string; n_districts: number; critical: number; high_or_critical: number;
  population: number; children_u5: number;
  avg_score: number; avg_drought: number; avg_stunting: number; avg_wasting: number;
}

interface ElNinoSummary {
  total_districts: number; critical_districts: number; high_districts: number;
  pop_critical: number; pop_high: number;
  children_critical: number; children_high: number;
  avg_stunting_critical: number; avg_wasting_critical: number;
  avg_sanitation_critical: number; avg_score_critical: number;
}

interface ElNinoData {
  summary: ElNinoSummary;
  districts: ElNinoDistrict[];
  state_summaries: StateSummary[];
}

interface EnsoStatus {
  source: string;
  latest_oni: { season: string; year: number; oni: number } | null;
  latest_classification: string | null;
  recent_seasons: { season: string; year: number; oni: number }[];
  alert_status: string | null;
  synopsis: string | null;
  next_update: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const LEVEL_STYLE: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high:     "bg-orange-500/20 text-orange-400 border-orange-500/30",
  moderate: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  low:      "bg-muted text-muted-foreground border-border",
};

const LEVEL_BAR_FILL: Record<string, string> = {
  critical: "#f87171",
  high:     "#fb923c",
  moderate: "#fbbf24",
  low:      "#6b7280",
};

const FMT_POP = (n: number) =>
  n >= 1e7 ? `${(n/1e7).toFixed(1)} Cr` :
  n >= 1e5 ? `${(n/1e5).toFixed(1)} L` :
  `${Math.round(n/1e3)} K`;

const fmt1 = (v: number|null, u="") => v != null ? `${v.toFixed(1)}${u}` : "—";
const fmt0 = (v: number|null, u="") => v != null ? `${v.toFixed(0)}${u}` : "—";

type SortKey = "score"|"drought"|"stunting_pct"|"wasting_pct"|"population"|"sanitation";

function SortIcon({ col, active, dir }: { col: SortKey; active: SortKey; dir: "asc"|"desc" }) {
  if (col !== active) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return dir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />;
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function ElNinoPage() {
  const { data, isLoading } = useQuery<ElNinoData>({
    queryKey: ["elnino"],
    queryFn: () => fetch("/data/elnino.json").then(r => r.json()),
    staleTime: Infinity,
  });
  const { data: enso } = useQuery<EnsoStatus>({
    queryKey: ["enso-status"],
    queryFn: () => fetch("/data/enso_status.json").then(r => r.json()),
    staleTime: 60 * 60 * 1000,
  });

  const [tab, setTab]               = useState<"districts"|"states"|"cascade"|"safeguard">("safeguard");
  const [search, setSearch]         = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [sortKey, setSortKey]       = useState<SortKey>("score");
  const [sortDir, setSortDir]       = useState<"desc"|"asc">("desc");
  const [safeguardSearch, setSafeguardSearch] = useState("");

  // Hooks before early return
  const filtered = useMemo(() => {
    let rows = data?.districts ?? [];
    if (levelFilter !== "all") rows = rows.filter(r => r.level === levelFilter);
    if (search) rows = rows.filter(r =>
      r.district.toLowerCase().includes(search.toLowerCase()) ||
      r.state.toLowerCase().includes(search.toLowerCase())
    );
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? (sortDir === "desc" ? -Infinity : Infinity);
      const bv = b[sortKey] ?? (sortDir === "desc" ? -Infinity : Infinity);
      return sortDir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
  }, [data?.districts, levelFilter, search, sortKey, sortDir]);

  // Safeguard tab's district lookup -- top text match, plus a priority action
  // derived from whichever of this district's own risk factors is worst
  // (not a generic checklist -- a low-sanitation district and a high-heat
  // district need different first moves).
  const safeguardMatch = useMemo(() => {
    if (!safeguardSearch.trim() || !data?.districts.length) return null;
    const q = safeguardSearch.toLowerCase();
    const exact = data.districts.find(d => d.district.toLowerCase() === q);
    const partial = data.districts.find(d => d.district.toLowerCase().includes(q) || d.state.toLowerCase().includes(q));
    const d = exact ?? partial;
    if (!d) return null;
    const drivers = [
      { key: "sanitation", value: 100 - d.sanitation, label: "Sanitation gap", action: "Toilets are the first thing to fail when water runs short — plan now: minimal-water/dry options (ash, sand, twin-pit), not a return to open defecation." },
      { key: "wasting", value: d.wasting_pct, label: "Child wasting baseline", action: "Already-high wasting means little buffer left — get children screened at the Anganwadi now, before the lean season, not after." },
      { key: "heat", value: d.heat, label: "Heat risk", action: "Pre-monsoon heat will spike 1.5–2.5°C above normal here — plan now to avoid outdoor work/travel 12–4pm and know the heat stroke warning signs." },
      { key: "drought", value: d.drought, label: "Drought risk", action: "This district is structurally monsoon-dependent — store water now, before scarcity, and identify a backup source before taps run low." },
    ].sort((a, b) => b.value - a.value);
    return { district: d, topDriver: drivers[0] };
  }, [safeguardSearch, data?.districts]);

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        Loading El Niño analysis…
      </div>
    );
  }

  const { summary, state_summaries } = data;

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  const thCls = "px-2 py-2 font-semibold text-[10px] uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none";
  const sortable = (k: SortKey, label: string) => (
    <th className={thCls} onClick={() => toggleSort(k)}>
      <span className="flex items-center gap-1 whitespace-nowrap">
        {label}<SortIcon col={k} active={sortKey} dir={sortDir} />
      </span>
    </th>
  );

  // State bar chart data — top 12 by avg_score
  const stateBarData = state_summaries.slice(0, 12).map(s => ({
    state: s.state.length > 14 ? s.state.slice(0, 13) + "…" : s.state,
    fullState: s.state,
    score: s.avg_score,
    critical: s.critical,
    pop_m: +(s.population / 1e6).toFixed(1),
    children_l: +(s.children_u5 / 1e5).toFixed(1),
    level: s.critical > 0 ? "critical" : s.high_or_critical > 0 ? "high" : "moderate",
  }));

  const TABS = [
    { id:"safeguard", label:"Safeguard Yourself", icon:"🛡️" },
    { id:"districts", label:"Critical Districts", icon:"🗺️" },
    { id:"states",    label:"State Exposure",     icon:"📊" },
    { id:"cascade",   label:"WASH Cascade",       icon:"⛓️" },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xl">🌀</span>
              <h1 className="text-base font-bold leading-none">El Niño Impact Readiness</h1>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 font-semibold">IMPACT BRIEF</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Compound drought · heat · WASH vulnerability in {summary.total_districts} Indian districts
            </p>
          </div>
          <ThemeToggle />
        </div>

        <div className="max-w-6xl mx-auto px-4 flex gap-0 overflow-x-auto border-t border-border/30">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 text-xs px-3 py-2.5 border-b-2 whitespace-nowrap transition-colors font-medium ${
                tab === t.id
                  ? "border-orange-400 text-orange-400 bg-orange-500/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* ── Live NOAA status (real, current -- not the hypothetical below) ── */}
        {enso?.latest_oni && (
          <div className="rounded-xl border-2 border-red-500/40 bg-red-500/5 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg">🔴</span>
                <span className="text-sm font-bold text-red-400">
                  {enso.alert_status ?? "ENSO Status"}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 font-semibold">
                  ONI {enso.latest_oni.oni > 0 ? "+" : ""}{enso.latest_oni.oni.toFixed(2)} · {enso.latest_classification}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {enso.latest_oni.season} {enso.latest_oni.year}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                NOAA CPC · next update {enso.next_update ?? "TBD"}
              </span>
            </div>
            {enso.synopsis && (
              <p className="text-xs font-medium leading-relaxed">{enso.synopsis}</p>
            )}
            {enso.recent_seasons && enso.recent_seasons.length > 1 && (
              <div className="flex items-end gap-1 h-10 pt-1">
                {enso.recent_seasons.map((s, i) => {
                  const h = Math.min(100, Math.abs(s.oni) / 2 * 100);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${s.season} ${s.year}: ${s.oni > 0 ? "+" : ""}${s.oni.toFixed(2)}`}>
                      <div className="w-full flex items-end h-7">
                        <div
                          className={`w-full rounded-sm ${s.oni >= 0.5 ? "bg-red-400" : s.oni <= -0.5 ? "bg-blue-400" : "bg-muted-foreground/30"}`}
                          style={{ height: `${Math.max(8, h)}%` }}
                        />
                      </div>
                      <span className="text-[8px] text-muted-foreground">{s.season}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-[9px] text-muted-foreground italic">
              Source: NOAA Climate Prediction Center — Oceanic Niño Index (Niño-3.4 SST anomaly, 3-month running mean) + ENSO Diagnostic Discussion.
              Everything below this — district scores, cascade timeline — is a structural vulnerability assessment; this banner is the only live signal on whether an event is actually occurring.
            </p>
          </div>
        )}

        {/* ── What is El Niño (always shown) ──────────────────────────── */}
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 space-y-2">
          <h2 className="text-sm font-bold text-orange-400">What El Niño does to India's WASH</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
            {[
              { icon:"🌧️", title:"Weakens monsoon", body:"El Niño suppresses the SW monsoon by 10–30%. Central & western India receive 20–40% less rainfall in strong El Niño years (2015-16, 2023)." },
              { icon:"🌡️", title:"Amplifies pre-monsoon heat", body:"April–June temperatures rise 1.5–2.5°C above normal. Wet-bulb risk escalates. Children and elderly face heat stress before the drought peaks." },
              { icon:"💧", title:"Collapses WASH infrastructure", body:"JJM taps run dry as groundwater falls. Open defecation resumes. Waterborne disease spikes within 60–90 days of monsoon failure." },
            ].map(c => (
              <div key={c.title} className="flex gap-2">
                <span className="text-lg shrink-0">{c.icon}</span>
                <div><div className="font-semibold text-foreground mb-0.5">{c.title}</div>{c.body}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Crisis stat cards ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              icon: <AlertTriangle className="w-4 h-4"/>,
              label: "Critical Districts",
              value: summary.critical_districts.toString(),
              sub: `${summary.high_districts} including high-risk`,
              color: "text-red-400", bg: "border-red-500/20 bg-red-500/5",
            },
            {
              icon: <Users className="w-4 h-4"/>,
              label: "People at Risk",
              value: FMT_POP(summary.pop_high),
              sub: `${FMT_POP(summary.pop_critical)} in critical zones`,
              color: "text-orange-400", bg: "border-orange-500/20 bg-orange-500/5",
            },
            {
              icon: <Baby className="w-4 h-4"/>,
              label: "Children Under 5",
              value: FMT_POP(summary.children_high),
              sub: `in high/critical risk districts`,
              color: "text-yellow-500", bg: "border-yellow-500/20 bg-yellow-500/5",
            },
            {
              icon: <Droplets className="w-4 h-4"/>,
              label: "Avg Sanitation Gap",
              value: `${(100 - summary.avg_sanitation_critical).toFixed(0)}%`,
              sub: "of critical districts lack sanitation",
              color: "text-blue-400", bg: "border-blue-500/20 bg-blue-500/5",
            },
          ].map(s => (
            <div key={s.label} className={`rounded-lg border p-3 flex gap-3 items-start ${s.bg}`}>
              <div className={`mt-0.5 ${s.color}`}>{s.icon}</div>
              <div>
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs font-medium leading-tight">{s.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Critical health baseline (critical zone only) ────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label:"Child Stunting", value:`${summary.avg_stunting_critical}%`, sub:"avg in critical districts", color:"text-orange-400 border-orange-500/20 bg-orange-500/5" },
            { label:"Child Wasting", value:`${summary.avg_wasting_critical}%`, sub:"acute malnutrition baseline", color:"text-red-400 border-red-500/20 bg-red-500/5" },
            { label:"El Niño Risk Score", value:`${summary.avg_score_critical}/10`, sub:"avg of critical districts", color:"text-yellow-500 border-yellow-500/20 bg-yellow-500/5" },
          ].map(s => (
            <div key={s.label} className={`rounded-lg border p-3 text-center ${s.color}`}>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs font-medium mt-0.5">{s.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ── TAB: Safeguard Yourself (household/community level) ────────── */}
        {tab === "safeguard" && (
          <section className="space-y-5">
            {/* District lookup */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-bold mb-1">Find your district</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Type your district or state to see its risk level and the single biggest thing to act on first.
              </p>
              <div className="relative">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input type="text" placeholder="e.g. Latur, Jaisalmer, Marathwada…"
                  value={safeguardSearch} onChange={e => setSafeguardSearch(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 text-sm rounded-md border border-border bg-muted/40 text-foreground outline-none placeholder:text-muted-foreground/60" />
              </div>
              {safeguardSearch.trim() && (
                safeguardMatch ? (
                  <div className={`mt-3 rounded-lg border p-3 ${LEVEL_STYLE[safeguardMatch.district.level]}`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <span className="font-bold text-sm">{safeguardMatch.district.district}</span>
                        <span className="text-xs text-muted-foreground ml-2">{safeguardMatch.district.state}</span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${LEVEL_STYLE[safeguardMatch.district.level]}`}>
                        {safeguardMatch.district.level} risk
                      </span>
                    </div>
                    <div className="mt-2 flex items-start gap-2 text-xs">
                      <span className="text-lg shrink-0">⚠️</span>
                      <div>
                        <div className="font-semibold">Priority: {safeguardMatch.topDriver.label}</div>
                        <p className="text-muted-foreground mt-0.5">{safeguardMatch.topDriver.action}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Link href={`/wash-assess?district=${encodeURIComponent(safeguardMatch.district.district)}`}
                        className="text-[11px] px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                        WASH Assess this district →
                      </Link>
                      <Link href={`/report/${encodeURIComponent(safeguardMatch.district.district)}`}
                        className="text-[11px] px-2 py-1 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 font-medium">
                        Full district report →
                      </Link>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground italic">No match — try a shorter name or the state.</p>
                )
              )}
            </div>

            {/* Household/community checklist */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-bold mb-3">What to do now — household &amp; community level</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { icon: "💧", title: "Water", color: "border-blue-500/20 bg-blue-500/5", items: [
                    "Store water now, before scarcity — clean, covered containers, replaced every few days.",
                    "Know a backup source (a second bore well, tanker contact, community source) before your main one runs low.",
                    "Purify stored/uncertain water: boil for 1 minute, or chlorinate, before drinking.",
                    "If you can, set up rainwater harvesting before the monsoon — every extra day of storage matters when the monsoon is weak.",
                  ]},
                  { icon: "🚻", title: "Sanitation & Hygiene", color: "border-emerald-500/20 bg-emerald-500/5", items: [
                    "Keep using your toilet even as water gets scarce — pit toilets work with ash/sand instead of water flushing.",
                    "Don't let water scarcity push the household back to open defecation — it's the single biggest driver of the diarrhoea spike that follows.",
                    "Handwashing with minimal water still works — a tippy-tap (a hanging container with a small hole) uses a fraction of what a tap does.",
                    "If your community toilet block has no water, report it — a non-functional toilet is worse than none, since people assume it's usable.",
                  ]},
                  { icon: "🧒", title: "Child Health & Nutrition", color: "border-orange-500/20 bg-orange-500/5", items: [
                    "Get children weighed at the Anganwadi now, before the lean season — early wasting is treatable, late wasting is a hospital case.",
                    "Keep ORS packets at home; know the recipe (6 tsp sugar + ½ tsp salt in 1L clean water) if you run out.",
                    "Don't delay care-seeking for diarrhoea or fever — dehydration in a small child can turn serious within a day.",
                    "Continue breastfeeding through the drought period — it's the most water-secure food a baby can get.",
                  ]},
                  { icon: "🌡️", title: "Heat Safety", color: "border-red-500/20 bg-red-500/5", items: [
                    "Avoid outdoor work or travel between 12–4pm during the pre-monsoon heat spike (Apr–Jun).",
                    "Watch for heat stroke signs: confusion, hot dry skin, no sweating, high body temperature — it's a medical emergency, cool the person immediately and get help.",
                    "Elderly, infants, and outdoor workers (farmers, construction, vendors) are highest-risk — check on them specifically.",
                    "Light, loose, light-colored clothing and staying hydrated matter more than usual once heat and water scarcity overlap.",
                  ]},
                ].map(c => (
                  <div key={c.title} className={`rounded-lg border p-3 ${c.color}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{c.icon}</span>
                      <span className="font-semibold text-sm">{c.title}</span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      {c.items.map((it, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-0.5 shrink-0 text-foreground/40">•</span><span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Where to get help */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-bold mb-2">Where to get help</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {[
                  { icon: "👩‍⚕️", title: "ASHA worker", body: "Your village's first point of contact for health, nutrition screening, and referrals — don't wait for a crisis to reach out." },
                  { icon: "🏥", title: "Anganwadi Centre / PHC", body: "Growth monitoring for children under 5, ORS/zinc supplies, and the nearest escalation point for anything beyond first aid." },
                  { icon: "🚰", title: "JJM helpline", body: "For piped water supply failures — report a dry tap early so repair/tanker support can be scheduled before it becomes a village-wide shortage." },
                ].map(h => (
                  <div key={h.title} className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex items-center gap-2 mb-1"><span className="text-base">{h.icon}</span><span className="font-semibold">{h.title}</span></div>
                    <p className="text-muted-foreground">{h.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── TAB: Critical Districts ──────────────────────────────────── */}
        {tab === "districts" && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-40">
                <Search className="absolute left-2 top-1.5 h-3 w-3 text-muted-foreground pointer-events-none" />
                <input type="text" placeholder="Search district or state…"
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-6 pr-3 py-1 text-xs rounded-md border border-border bg-muted/40 text-foreground outline-none placeholder:text-muted-foreground/60" />
              </div>
              <div className="relative">
                <ChevronDown className="pointer-events-none absolute right-2 top-1.5 h-3 w-3 text-muted-foreground" />
                <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
                  className="appearance-none pl-2 pr-6 py-1 text-xs rounded-md border border-border bg-muted/40 text-foreground outline-none cursor-pointer">
                  <option value="all">All levels</option>
                  <option value="critical">🔴 Critical</option>
                  <option value="high">🟠 High</option>
                  <option value="moderate">🟡 Moderate</option>
                  <option value="low">⚪ Low</option>
                </select>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">{filtered.length} of {data.districts.length}</span>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 text-[11px]">
              {[["🔴","Critical ≥4.0","text-red-400"],["🟠","High ≥2.5","text-orange-400"],["🟡","Moderate ≥1.2","text-yellow-500"],["⚪","Low <1.2","text-muted-foreground"]].map(([icon,label,cls])=>(
                <span key={label} className="flex items-center gap-1">
                  <span>{icon}</span><span className={cls as string}>{label}</span>
                </span>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-border">
                    <tr>
                      <th className={thCls + " text-left pl-3"}>#</th>
                      <th className={thCls + " text-left"}>District</th>
                      <th className={thCls + " text-left"}>State</th>
                      <th className={thCls}>Risk</th>
                      {sortable("score","El Niño Score")}
                      {sortable("drought","Drought")}
                      <th className={thCls}>Heat</th>
                      {sortable("sanitation","Sanitation")}
                      {sortable("stunting_pct","Stunting")}
                      {sortable("wasting_pct","Wasting")}
                      {sortable("population","Population")}
                      <th className={thCls}>Children U5</th>
                      <th className={thCls + " text-right pr-3"}>Links</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 150).map((row, i) => (
                      <tr key={row.district} className="border-b border-border/30 hover:bg-muted/20">
                        <td className="px-3 py-1.5 text-muted-foreground text-[10px]">{i+1}</td>
                        <td className="px-2 py-1.5 font-medium whitespace-nowrap">{row.district}</td>
                        <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap text-[10px]">{row.state}</td>
                        <td className="px-2 py-1.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${LEVEL_STYLE[row.level]}`}>
                            {row.level}
                          </span>
                        </td>
                        <td className={`px-2 py-1.5 text-right font-mono font-bold ${row.score>=4?"text-red-400":row.score>=2.5?"text-orange-400":row.score>=1.2?"text-yellow-500":"text-muted-foreground"}`}>
                          {row.score.toFixed(1)}
                        </td>
                        <td className={`px-2 py-1.5 text-right font-mono ${row.drought>=5?"text-red-400":row.drought>=3?"text-orange-400":""}`}>
                          {row.drought.toFixed(1)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                          {row.heat.toFixed(1)}
                        </td>
                        <td className={`px-2 py-1.5 text-right font-mono ${row.sanitation<50?"text-red-400":row.sanitation<70?"text-orange-400":""}`}>
                          {fmt0(row.sanitation, "%")}
                        </td>
                        <td className={`px-2 py-1.5 text-right font-mono ${row.stunting_pct>35?"text-orange-400":""}`}>
                          {fmt1(row.stunting_pct, "%")}
                        </td>
                        <td className={`px-2 py-1.5 text-right font-mono ${row.wasting_pct>20?"text-red-400":row.wasting_pct>15?"text-orange-400":""}`}>
                          {fmt1(row.wasting_pct, "%")}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-muted-foreground text-[10px]">
                          {FMT_POP(row.population)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-[10px] text-muted-foreground">
                          {FMT_POP(row.children_u5)}
                        </td>
                        <td className="px-2 py-1.5 text-right pr-3">
                          <div className="flex items-center gap-1.5 justify-end">
                            <Link href={`/wash-assess?district=${encodeURIComponent(row.district)}`}
                              className="text-[10px] text-emerald-400 hover:text-emerald-300 whitespace-nowrap">Assess</Link>
                            <Link href={`/report/${encodeURIComponent(row.district)}`}
                              className="text-[10px] text-blue-400 hover:text-blue-300">
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length > 150 && (
                <div className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border bg-muted/20">
                  Showing 150 of {filtered.length} · narrow with search or level filter
                </div>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground">
              El Niño score = drought risk (p90) × 0.45 + heat risk × 0.20 + groundwater stress × 0.15 + WASH gap × 0.20.
              Scores reflect structural drought/heat vulnerability — Marathwada and similar monsoon-dependent drought zones
              are captured in the <Link href="/grid" className="text-blue-400 underline">drought layer on /grid</Link> and individual <Link href="/report/Latur" className="text-blue-400 underline">district reports</Link>.
            </p>
          </section>
        )}

        {/* ── TAB: State Exposure ──────────────────────────────────────── */}
        {tab === "states" && (
          <section className="space-y-5">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-1">Average El Niño Score by State</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Rajasthan, Gujarat and Punjab are structurally most exposed — arid zones where monsoon failure directly collapses WASH.
              </p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stateBarData} layout="vertical" margin={{top:4,right:50,bottom:4,left:110}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                    <XAxis type="number" domain={[0, 4]} tick={{fontSize:10,fill:"currentColor",opacity:0.5}} />
                    <YAxis dataKey="state" type="category" tick={{fontSize:11,fill:"currentColor"}} width={105} />
                    <Tooltip
                      contentStyle={{background:"var(--background)",border:"1px solid var(--border)",borderRadius:"8px",fontSize:"12px"}}
                      formatter={(v: number, _n: string, props: any) => {
                        const d = props?.payload;
                        return [`${v.toFixed(2)} (${d?.critical} critical districts, ${d?.pop_m}M people)`, "El Niño score"];
                      }}
                      labelFormatter={(l: string) => l}
                    />
                    <Bar dataKey="score" radius={[0,3,3,0]}>
                      {stateBarData.map(entry => (
                        <Cell key={entry.state} fill={LEVEL_BAR_FILL[entry.level]} opacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* State summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {state_summaries.slice(0, 8).map(s => (
                <div key={s.state} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">{s.state}</span>
                    <div className="flex items-center gap-1.5">
                      {s.critical > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-semibold">
                          {s.critical} critical
                        </span>
                      )}
                      {s.high_or_critical > s.critical && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                          {s.high_or_critical - s.critical} high
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                    {[
                      { l:"Score", v:`${s.avg_score.toFixed(1)}`, c:s.avg_score>=2.5?"text-red-400":s.avg_score>=1.5?"text-orange-400":"text-foreground" },
                      { l:"Districts", v:`${s.n_districts}`, c:"text-foreground" },
                      { l:"Population", v:FMT_POP(s.population), c:"text-foreground" },
                      { l:"Children U5", v:FMT_POP(s.children_u5), c:"text-yellow-500" },
                    ].map(x => (
                      <div key={x.l}>
                        <div className={`font-bold font-mono ${x.c}`}>{x.v}</div>
                        <div className="text-muted-foreground">{x.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Population Exposed by State (High + Critical)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={state_summaries.filter(s => s.high_or_critical > 0).slice(0,10).map(s=>({
                      state: s.state.length>14 ? s.state.slice(0,13)+"…" : s.state,
                      pop_m: +(s.population/1e6).toFixed(1),
                      ch_l: +(s.children_u5/1e5).toFixed(1),
                    }))}
                    margin={{top:4,right:16,bottom:40,left:0}}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08}/>
                    <XAxis dataKey="state" tick={{fontSize:10,fill:"currentColor",opacity:0.7}} angle={-20} textAnchor="end" height={50}/>
                    <YAxis tick={{fontSize:10,fill:"currentColor",opacity:0.5}} unit="M"/>
                    <Tooltip
                      contentStyle={{background:"var(--background)",border:"1px solid var(--border)",borderRadius:"8px",fontSize:"12px"}}
                      formatter={(v:number, name:string) => [`${v} ${name==="pop_m"?"million people":"lakh children"}`, name==="pop_m"?"Population":"Children U5"]}
                    />
                    <Legend wrapperStyle={{fontSize:"11px"}}/>
                    <Bar dataKey="pop_m" name="Population (M)" fill="#fb923c" radius={[3,3,0,0]}/>
                    <Bar dataKey="ch_l" name="Children U5 (L)" fill="#facc15" radius={[3,3,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        )}

        {/* ── TAB: WASH Cascade ───────────────────────────────────────── */}
        {tab === "cascade" && (
          <section className="space-y-5">
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
              <h3 className="text-sm font-bold text-orange-400 mb-3">The El Niño → Child Wasting Chain</h3>
              <div className="space-y-1">
                {[
                  { step:"1", icon:"🌀", title:"El Niño onset (Oct–Dec)", body:"NOAA declares El Niño advisory. India's IMD forecasts below-normal monsoon for Jun–Sep following year.", color:"border-blue-500/20 bg-blue-500/5", time:"Month 0" },
                  { step:"2", icon:"🌡️", title:"Pre-monsoon heat spike (Apr–Jun)", body:"Temperature 1.5–2.5°C above normal. Wet-bulb risk escalates in already-critical districts. Water demand spikes before supply drops.", color:"border-yellow-500/20 bg-yellow-500/5", time:"Month 6" },
                  { step:"3", icon:"🌧️", title:"Monsoon failure (Jul–Sep)", body:"Rainfall 20–40% below normal in Rajasthan, Gujarat, Marathwada. Kharif crop failure. Reservoirs fill to 40–60% capacity.", color:"border-orange-500/20 bg-orange-500/5", time:"Month 9" },
                  { step:"4", icon:"💧", title:"WASH infrastructure collapse (Sep–Oct)", body:"JJM taps run dry as groundwater table drops. ODF villages revert to open defecation. Waterborne disease burden rises — diarrhoea prevalence increases 2–3×.", color:"border-red-500/20 bg-red-500/5", time:"Month 12" },
                  { step:"5", icon:"🧒", title:"Child wasting spike (Oct–Jan)", body:"Wasting increases 8–15 percentage points above baseline within 60–90 days of WASH collapse. Anaemia worsens. Stunting locks in irreversibly if episode lasts >3 months.", color:"border-red-600/30 bg-red-500/10", time:"Month 15" },
                ].map(s => (
                  <div key={s.step} className={`rounded-lg border p-3 flex gap-3 ${s.color}`}>
                    <div className="text-xl shrink-0">{s.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{s.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground">{s.time}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{s.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Intervention windows */}
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
              <h3 className="text-sm font-bold text-green-400 mb-3">Pre-positioning Windows</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {[
                  { window:"On advisory (Month 0–3)", color:"border-blue-500/30 bg-blue-500/5", items:[
                    "Identify the 44 high/critical districts using this platform",
                    "Pre-position ORS, zinc tablets, RUTF therapeutic food",
                    "Survey JJM FHTC operational status in critical zones",
                  ]},
                  { window:"Pre-monsoon (Month 4–6)", color:"border-yellow-500/30 bg-yellow-500/5", items:[
                    "Deploy water trucking contracts for top 10 critical districts",
                    "Activate ASHA/AWW outreach for wasting screening",
                    "Coordinate with SBM-G for emergency toilet sealing in drought zones",
                  ]},
                  { window:"During drought (Month 9–15)", color:"border-red-500/30 bg-red-500/5", items:[
                    "Real-time wasting surveillance in flagged districts",
                    "Scale CMAM (community management of acute malnutrition)",
                    "Activate JJM emergency repair and tanker support",
                  ]},
                ].map(t => (
                  <div key={t.window} className={`rounded-lg border p-3 ${t.color}`}>
                    <div className="font-semibold mb-2 text-[11px] uppercase tracking-wide">{t.window}</div>
                    <ul className="space-y-1.5">
                      {t.items.map(it => (
                        <li key={it} className="flex items-start gap-1.5 text-muted-foreground">
                          <span className="mt-0.5 shrink-0 text-green-400">→</span><span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Link out */}
            <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">Explore district-level drill-down</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  View drought + heat + WASH layers for any district on the hex grid, or pull a full WASH Assessment Report.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link href="/grid"
                  className="text-xs px-3 py-1.5 rounded-md bg-orange-500 text-white font-medium hover:bg-orange-600 transition-colors">
                  Open Grid →
                </Link>
                <Link href="/insights"
                  className="text-xs px-3 py-1.5 rounded-md border border-border bg-muted/40 text-foreground font-medium hover:bg-muted/60 transition-colors">
                  Insights
                </Link>
              </div>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
