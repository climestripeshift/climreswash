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

  const [tab, setTab]               = useState<"districts"|"states"|"cascade">("districts");
  const [search, setSearch]         = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [sortKey, setSortKey]       = useState<SortKey>("score");
  const [sortDir, setSortDir]       = useState<"desc"|"asc">("desc");

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
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 font-semibold">UNICEF BRIEF</span>
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

            {/* UNICEF intervention windows */}
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
              <h3 className="text-sm font-bold text-green-400 mb-3">UNICEF Pre-positioning Windows</h3>
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
