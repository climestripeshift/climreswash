import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, TrendingUp, Activity, Thermometer, Droplets,
  Search, ExternalLink, ChevronDown, ChevronUp, ChevronsUpDown,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend, Cell,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────

interface RelationshipData {
  title: string; r: number; x_key: string; y_key: string;
  x_label: string; y_label: string; interpretation: string;
  n: number; points: Array<{x:number;y:number;d:string;s:string}>;
}

interface DistrictRow {
  d: string; st: string; hz: string;
  risk: number|null; wb50: number|null; ht50: number|null;
  ana: number|null; stun: number|null;
  jjm: number|null; san: number|null;
  pop: number|null; gap: number|null;
}

interface StateSummary {
  n: number; risk: number|null; anaemia: number|null; stunting: number|null;
  wb50: number|null; ht50: number|null; jjm: number|null; san: number|null;
  critical: number; high: number;
}

interface EscalationDistrict {
  district: string; state: string;
  heat_days_2050: number|null; wet_bulb_days_2050: number|null;
  current_heat_risk: number|null;
  anaemia_pct: number|null; stunting_pct: number|null;
  population: number|null;
}

interface TrendCell { nfhs6: number; nfhs5: number; delta: number; improved: boolean }

interface TrendStateRow {
  state: string; small_sample: boolean;
  water: TrendCell; stunting: TrendCell; wasting: TrendCell;
  severe_wasting: TrendCell; underweight: TrendCell;
  diarrhoea: TrendCell; mhm: TrendCell;
  climate?: Record<string, number>;
}

interface TrendCorrelation {
  label: string; insight: string; x_label: string; y_label: string;
  r: number; n: number;
  points: Array<{state:string; x:number; y:number}>;
}

interface NfhsTrendsData {
  meta: { source: string; note: string; indicators: Record<string,string>; small_sample_states: string[] };
  national: Record<string, TrendCell>;
  states: TrendStateRow[];
  correlations: TrendCorrelation[];
  highlights: Record<string, {
    improvers: Array<{state:string; delta:number; nfhs6:number}>;
    regressors: Array<{state:string; delta:number; nfhs6:number}>;
  }>;
}

interface RajGwDistrict {
  district: string; population: number;
  jjm_fhtc_pct: number|null; gw_stress_score: number;
  lat: number; lon: number;
  annual_rainfall_mm: number; monsoon_rainfall_mm: number; monsoon_share_pct: number;
}

interface RajGwData {
  meta: { n_districts: number; years: string; rainfall_source: string; gw_stress_source: string; jjm_source: string; scope: string };
  correlations: {
    rainfall_vs_gw_stress: number; monsoon_rainfall_vs_gw_stress: number;
    rainfall_vs_jjm_fhtc: number; gw_stress_vs_jjm_fhtc: number;
    n_districts_missing_jjm_data: number;
  };
  districts: RajGwDistrict[];
}

type TrendIndicator = "water"|"stunting"|"wasting"|"severe_wasting"|"underweight"|"diarrhoea"|"mhm";

const TREND_LABELS: Record<TrendIndicator, string> = {
  water: "Improved water", stunting: "Stunting", wasting: "Wasting",
  severe_wasting: "Severe wasting", underweight: "Underweight",
  diarrhoea: "Diarrhoea", mhm: "Menstrual hygiene",
};
const TREND_ICONS: Record<TrendIndicator, string> = {
  water:"🚰", stunting:"📏", wasting:"⚠️", severe_wasting:"🚨",
  underweight:"⚖️", diarrhoea:"🦠", mhm:"🩸",
};

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
  escalation_districts: EscalationDistrict[];
  ac_drivers: Record<string, {label:string;r:number}>;
  all_districts: DistrictRow[];
  state_summaries: Record<string, StateSummary>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

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
  "#facc15","#38bdf8","#f472b6","#4ade80","#818cf8","#fb7185",
];

const ALL_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
  "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka",
  "Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram",
  "Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana",
  "Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Jammu & Kashmir","Ladakh","Delhi",
];
const STATE_COLOR: Record<string,string> = {};
ALL_STATES.forEach((s,i) => { STATE_COLOR[s] = SCATTER_COLORS[i % SCATTER_COLORS.length]; });

const HZ_BADGE: Record<string,string> = {
  flood:"🌊", wetbulb:"🌡️", drought:"🏜️", coldwave:"❄️", landslide:"⛰️",
  heat:"🔥", pollution:"🏭",
};

const FMT_POP = (n: number) =>
  n >= 1e7 ? `${(n/1e7).toFixed(1)}Cr` : n >= 1e5 ? `${(n/1e5).toFixed(1)}L` : `${Math.round(n/1e3)}K`;

const fmt1 = (v: number|null, unit="") => v != null ? `${v.toFixed(1)}${unit}` : "—";
const fmt0 = (v: number|null, unit="") => v != null ? `${v.toFixed(0)}${unit}` : "—";

type SortKey = "wb50"|"ht50"|"risk"|"ana"|"stun"|"jjm"|"san"|"pop";

function SortIcon({ col, active, dir }: {col: SortKey; active: SortKey; dir: "asc"|"desc"}) {
  if (col !== active) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return dir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />;
}

// ── Scatter Card ────────────────────────────────────────────────────────────

function ScatterCard({ rel, filterState, highlightDistrict }: {
  rel: RelationshipData; filterState: string; highlightDistrict: string;
}) {
  const badge = rBadge(rel.r);
  const { highlighted, statePoints, others } = useMemo(() => {
    const hl: typeof rel.points = [], sp: typeof rel.points = [], ot: typeof rel.points = [];
    for (const pt of rel.points) {
      const isHL = highlightDistrict && pt.d.toLowerCase().includes(highlightDistrict.toLowerCase());
      const isSt = filterState && filterState !== "All India" && pt.s === filterState;
      if (isHL) hl.push(pt);
      else if (isSt) sp.push(pt);
      else ot.push(pt);
    }
    return { highlighted: hl, statePoints: sp, others: ot };
  }, [rel.points, filterState, highlightDistrict]);

  const showingFiltered = filterState && filterState !== "All India";
  const displayPoints = showingFiltered ? statePoints : others;

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
            <XAxis type="number" dataKey="x" name={rel.x_label}
              label={{ value: rel.x_label, position:"insideBottom", offset:-8, fontSize:10, fill:"currentColor", opacity:0.5 }}
              tick={{fontSize:9, fill:"currentColor", opacity:0.5}} />
            <YAxis type="number" dataKey="y" name={rel.y_label}
              label={{ value: rel.y_label, angle:-90, position:"insideLeft", offset:8, fontSize:10, fill:"currentColor", opacity:0.5 }}
              tick={{fontSize:9, fill:"currentColor", opacity:0.5}} />
            <Tooltip cursor={{strokeDasharray:"3 3"}} content={({payload}) => {
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
            }} />
            {showingFiltered && <Scatter data={others} fill="#6b7280" opacity={0.15} r={2} />}
            <Scatter data={displayPoints} opacity={0.65} r={3}
              fill={showingFiltered ? STATE_COLOR[filterState] || "#60a5fa" : "#60a5fa"} />
            {highlighted.length > 0 && <Scatter data={highlighted} fill="#ef4444" opacity={1} r={6} />}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{rel.interpretation}</p>
      {highlighted.length > 0 && (
        <div className="text-[10px] rounded bg-red-500/10 border border-red-500/20 px-2 py-1 text-red-400">
          🔴 {highlighted.map(p => `${p.d}: ${rel.x_label}=${p.x}, ${rel.y_label}=${p.y}`).join(" · ")}
        </div>
      )}
    </div>
  );
}

// ── State Summary Banner ────────────────────────────────────────────────────

function StateSummaryBanner({ state, summary }: { state: string; summary: StateSummary }) {
  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-3 h-3 rounded-full" style={{ background: STATE_COLOR[state] || "#60a5fa" }} />
        <span className="text-sm font-bold">{state}</span>
        <span className="text-xs text-muted-foreground">— {summary.n} districts</span>
        {summary.critical > 0 && (
          <span className="ml-auto text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5">
            {summary.critical} critical risk
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-center">
        {[
          { label:"Avg risk", val: fmt1(summary.risk,"/10"), color: (summary.risk||0)>6?"text-red-400":(summary.risk||0)>4?"text-orange-400":"text-green-400" },
          { label:"Anaemia", val: fmt0(summary.anaemia,"%"), color:(summary.anaemia||0)>65?"text-red-400":"text-foreground" },
          { label:"Stunting", val: fmt0(summary.stunting,"%"), color:(summary.stunting||0)>35?"text-orange-400":"text-foreground" },
          { label:"WB 2050", val: fmt1(summary.wb50," d/yr"), color:(summary.wb50||0)>50?"text-orange-400":"text-foreground" },
          { label:"Heat 2050", val: fmt1(summary.ht50," d/yr"), color:"text-foreground" },
          { label:"JJM", val: fmt0(summary.jjm,"%"), color:(summary.jjm||0)<60?"text-red-400":"text-green-400" },
          { label:"Sanitation", val: fmt0(summary.san,"%"), color:(summary.san||0)<70?"text-orange-400":"text-green-400" },
        ].map(s => (
          <div key={s.label} className="text-xs">
            <div className={`text-sm font-bold font-mono ${s.color}`}>{s.val}</div>
            <div className="text-muted-foreground text-[10px] leading-tight">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const { data, isLoading } = useQuery<InsightsData>({
    queryKey: ["insights"],
    queryFn: () => fetch("/data/insights.json").then(r => r.json()),
    staleTime: Infinity,
  });

  const { data: trends } = useQuery<NfhsTrendsData>({
    queryKey: ["nfhs-trends"],
    queryFn: () => fetch("/data/nfhs_trends.json").then(r => r.json()),
    staleTime: Infinity,
  });

  const { data: rajGw } = useQuery<RajGwData>({
    queryKey: ["rajasthan-gw"],
    queryFn: () => fetch("/data/rajasthan_gw_rainfall_jjm.json").then(r => r.json()),
    staleTime: Infinity,
  });

  const [activeSection, setActiveSection]   = useState("relationships");
  const [filterState, setFilterState]       = useState("All India");
  const [districtSearch, setDistrictSearch] = useState("");
  const [tableSearch, setTableSearch]       = useState("");
  const [sortKey, setSortKey]               = useState<SortKey>("wb50");
  const [sortDir, setSortDir]               = useState<"asc"|"desc">("desc");
  const [hazardFilter, setHazardFilter]     = useState("all");
  const [trendIndicator, setTrendIndicator] = useState<TrendIndicator>("stunting");

  // Hooks must be called unconditionally — before early return
  const rByTitle = useMemo(() => {
    const m: Record<string, number> = {};
    for (const rel of (data?.relationships ?? [])) m[rel.title] = rel.r;
    return m;
  }, [data?.relationships]);

  const trendBarData = useMemo(() => {
    if (!trends) return [];
    return trends.states
      .map(row => ({
        state: row.state + (row.small_sample ? " †" : ""),
        delta: row[trendIndicator].delta,
        improved: row[trendIndicator].improved,
        nfhs5: row[trendIndicator].nfhs5,
        nfhs6: row[trendIndicator].nfhs6,
      }))
      .sort((a, b) => a.delta - b.delta);
  }, [trends, trendIndicator]);

  // Adapt trend correlations to the ScatterCard shape ({x,y,d,s} points)
  const trendScatters = useMemo(() => {
    if (!trends) return [];
    return trends.correlations.map(c => ({
      title: c.label, r: c.r, n: c.n,
      x_key: "x", y_key: "y",
      x_label: c.x_label, y_label: c.y_label,
      interpretation: `${c.insight} (n=${c.n} states; small-sample states excluded)`,
      points: c.points.map(p => ({ x: p.x, y: p.y, d: p.state, s: p.state })),
    } as RelationshipData));
  }, [trends]);

  const rajGwScatters = useMemo(() => {
    if (!rajGw) return [];
    const jjmDistricts = rajGw.districts.filter(d => d.jjm_fhtc_pct != null);
    return [
      {
        title: "Rainfall vs Groundwater Stress", r: rajGw.correlations.rainfall_vs_gw_stress,
        n: rajGw.districts.length, x_key: "x", y_key: "y",
        x_label: "Annual rainfall (mm)", y_label: "GW stress (0-1)",
        interpretation: `10-yr mean rainfall (Open-Meteo ERA5) vs WRIS well-depth stress score, n=${rajGw.districts.length} Rajasthan districts. Strong negative — natural recharge drives groundwater health almost on its own.`,
        points: rajGw.districts.map(d => ({ x: d.annual_rainfall_mm, y: d.gw_stress_score, d: d.district, s: "Rajasthan" })),
      } as RelationshipData,
      {
        title: "Groundwater Stress vs JJM Tap Coverage", r: rajGw.correlations.gw_stress_vs_jjm_fhtc,
        n: jjmDistricts.length, x_key: "x", y_key: "y",
        x_label: "GW stress (0-1)", y_label: "JJM tap coverage (%)",
        interpretation: `n=${jjmDistricts.length} districts with JJM data (${rajGw.correlations.n_districts_missing_jjm_data} excluded — no data in pipeline). Near-zero correlation — scheme rollout doesn't track aquifer sustainability.`,
        points: jjmDistricts.map(d => ({ x: d.gw_stress_score, y: d.jjm_fhtc_pct as number, d: d.district, s: "Rajasthan" })),
      } as RelationshipData,
    ];
  }, [rajGw]);

  const filteredDistricts = useMemo(() => {
    let rows = data?.all_districts ?? [];
    if (filterState !== "All India") rows = rows.filter(r => r.st === filterState);
    if (hazardFilter !== "all") rows = rows.filter(r => r.hz === hazardFilter);
    if (tableSearch) rows = rows.filter(r =>
      r.d.toLowerCase().includes(tableSearch.toLowerCase()) ||
      r.st.toLowerCase().includes(tableSearch.toLowerCase())
    );
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? (sortDir === "desc" ? -Infinity : Infinity);
      const bv = b[sortKey] ?? (sortDir === "desc" ? -Infinity : Infinity);
      return sortDir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
  }, [data?.all_districts, filterState, hazardFilter, tableSearch, sortKey, sortDir]);

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        Loading insights…
      </div>
    );
  }

  const { summary, relationships, hazard_groups, future_national,
          top_wetbulb_states, ac_drivers, all_districts, state_summaries } = data;

  const climateRelationships = relationships.slice(0, 8);
  const washRelationships    = relationships.slice(8);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  // ── Future bar data ────────────────────────────────────────────────────────
  const futureBarData = [
    { scenario:"Today",      heat: 1.2,  wetbulb: 0 },
    { scenario:"SSP2 2030",  heat: future_national.heat_days.ssp245_2030 ?? 0, wetbulb: future_national.wet_bulb_days.ssp245_2030 ?? 0 },
    { scenario:"SSP2 2050",  heat: future_national.heat_days.ssp245_2050 ?? 0, wetbulb: future_national.wet_bulb_days.ssp245_2050 ?? 0 },
    { scenario:"SSP5 2030",  heat: future_national.heat_days.ssp585_2030 ?? 0, wetbulb: future_national.wet_bulb_days.ssp585_2030 ?? 0 },
    { scenario:"SSP5 2050",  heat: future_national.heat_days.ssp585_2050 ?? 0, wetbulb: future_national.wet_bulb_days.ssp585_2050 ?? 0 },
  ];

  const hazardBarData = Object.entries(hazard_groups)
    .filter(([,v]) => v.n > 10)
    .map(([hz, v]) => ({
      name: ({flood:"🌊 Flood",wetbulb:"🌡️ Wet-bulb",drought:"🏜️ Drought",coldwave:"❄️ Cold Wave",landslide:"⛰️ Landslide",heat:"🔥 Heat",pollution:"🏭 Pollution"} as Record<string,string>)[hz] ?? hz,
      Anaemia: v.anaemia ?? 0, Stunting: v.stunting ?? 0, Wasting: v.wasting ?? 0, n: v.n,
    })).sort((a,b) => b.Anaemia - a.Anaemia);

  const acBarData = Object.entries(ac_drivers)
    .map(([k,v]) => ({ label: v.label, r: Math.abs(v.r), raw_r: v.r, key: k }))
    .sort((a,b) => b.r - a.r);

  const stateSummary = filterState !== "All India" ? state_summaries[filterState] : null;

  const sections = [
    { id:"relationships", label:"Climate-Health",    icon:"🔗" },
    { id:"nfhs6",         label:"NFHS-6 Trends",      icon:"📈" },
    { id:"rajgw",         label:"Rajasthan Groundwater", icon:"🕳️" },
    { id:"wash",          label:"WASH-Health",        icon:"💧" },
    { id:"districts",     label:"All Districts",      icon:"🗺️" },
    { id:"future",        label:"Future Projections", icon:"📅" },
    { id:"vulnerability", label:"Social Vulnerability",icon:"⚠️" },
    { id:"resilience",    label:"Resilience Drivers", icon:"🌱" },
  ];

  const thCls = "px-2 py-2 font-semibold text-[10px] uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none";
  const sortable = (key: SortKey, label: string) => (
    <th className={thCls} onClick={() => toggleSort(key)}>
      <span className="flex items-center gap-1 whitespace-nowrap">{label}<SortIcon col={key} active={sortKey} dir={sortDir} /></span>
    </th>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold leading-none">Climate-Social Analysis</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">{summary.districts_analyzed} districts · India-wide statistical relationships</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <ChevronDown className="pointer-events-none absolute right-2 top-1.5 h-3 w-3 text-muted-foreground" />
              <select value={filterState} onChange={e => setFilterState(e.target.value)}
                className="appearance-none pl-2 pr-6 py-1 text-xs rounded-md border border-border bg-muted/40 text-foreground outline-none cursor-pointer">
                <option value="All India">All India</option>
                {ALL_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1.5 h-3 w-3 text-muted-foreground pointer-events-none" />
              <input type="text" placeholder="Find district…" value={districtSearch}
                onChange={e => setDistrictSearch(e.target.value)}
                className="pl-6 pr-3 py-1 text-xs rounded-md border border-border bg-muted/40 text-foreground outline-none w-36 placeholder:text-muted-foreground/60" />
            </div>
            <ThemeToggle />
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 flex gap-0 overflow-x-auto border-t border-border/30">
          {sections.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-1.5 text-xs px-3 py-2.5 border-b-2 whitespace-nowrap transition-colors font-medium ${
                activeSection === s.id
                  ? "border-blue-400 text-blue-400 bg-blue-500/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}>
              <span>{s.icon}</span>{s.label}
            </button>
          ))}
        </div>

        {(filterState !== "All India" || districtSearch) && (
          <div className="max-w-6xl mx-auto px-4 py-1.5 flex items-center gap-3 text-[11px] bg-blue-500/5 border-b border-blue-500/10">
            <span className="text-blue-400 font-semibold">Filtering:</span>
            {filterState !== "All India" && (
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: STATE_COLOR[filterState] || "#60a5fa" }} />
                {filterState}
              </span>
            )}
            {districtSearch && <span className="text-red-400">🔴 highlighting "{districtSearch}"</span>}
            <button onClick={() => { setFilterState("All India"); setDistrictSearch(""); }}
              className="ml-auto text-muted-foreground hover:text-foreground underline">Clear</button>
          </div>
        )}
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* ── Stat banner / state summary ────────────────────────────── */}
        {stateSummary ? (
          <StateSummaryBanner state={filterState} summary={stateSummary} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon:<Activity className="w-4 h-4"/>, label:"Women with Anaemia", value:`${summary.national_anaemia_pct}%`, sub:`${summary.high_anaemia_districts} districts >70%`, color:"text-red-400" },
              { icon:<TrendingUp className="w-4 h-4"/>, label:"Children Stunted", value:`${summary.national_stunting_pct}%`, sub:`${summary.high_stunting_districts} districts >40%`, color:"text-orange-400" },
              { icon:<Thermometer className="w-4 h-4"/>, label:"Heat Days 2050 (SSP5)", value:`${summary.heat_days_2050_mean}/yr`, sub:"national avg per district", color:"text-yellow-500" },
              { icon:<Droplets className="w-4 h-4"/>, label:"Wet-Bulb Days 2050", value:`${summary.wet_bulb_days_2050_mean}/yr`, sub:`${summary.wetbulb_high_districts} districts at-risk`, color:"text-blue-400" },
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
        )}

        {/* ── TAB: Climate-Health Links ─────────────────────────────── */}
        {activeSection === "relationships" && (
          <section className="space-y-5">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <h2 className="text-sm font-bold text-amber-400 mb-2">Key findings from {summary.districts_analyzed} districts</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                {[
                  { icon:"🌡️", text:<><strong className="text-foreground">Heat → Anaemia (r={rByTitle["Heat Stress & Anaemia in Women"] != null ? `${rByTitle["Heat Stress & Anaemia in Women"]>0?"+":""}${rByTitle["Heat Stress & Anaemia in Women"].toFixed(2)}` : "+0.26"})</strong> — heat impairs iron absorption. Hotter districts show 6-8pp more anaemia.</> },
                  { icon:"🏭", text:<><strong className="text-foreground">PM2.5 → Anaemia (r={rByTitle["Air Pollution & Anaemia"] != null ? `${rByTitle["Air Pollution & Anaemia"]>0?"+":""}${rByTitle["Air Pollution & Anaemia"].toFixed(2)}` : "+0.28"})</strong> — chronic inflammation from air pollution suppresses haemoglobin synthesis.</> },
                  { icon:"🩸", text:<><strong className="text-foreground">MHM → Antenatal (r={rByTitle["Menstrual Hygiene & Antenatal Care"] != null ? `${rByTitle["Menstrual Hygiene & Antenatal Care"]>0?"+":""}${rByTitle["Menstrual Hygiene & Antenatal Care"].toFixed(2)}` : "+0.48"})</strong> — strongest link. Same access barrier underlies both.</> },
                  { icon:"🌡️", text:<><strong className="text-foreground">Heat → MHM (r={rByTitle["Heat Risk & Menstrual Hygiene Coverage"] != null ? `${rByTitle["Heat Risk & Menstrual Hygiene Coverage"]>0?"+":""}${rByTitle["Heat Risk & Menstrual Hygiene Coverage"].toFixed(2)}` : "−0.13"})</strong> — hotter districts restrict women's mobility and access to washing spaces.</> },
                  { icon:"💧", text:<><strong className="text-foreground">Disruption → Stunting</strong> — repeated climate events compound into chronic child undernutrition.</> },
                  { icon:"💍", text:<><strong className="text-foreground">High child marriage + low MHM: 27.6% antenatal</strong> vs 60.5% elsewhere — 2.2× gap.</> },
                ].map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="mt-0.5 shrink-0">{f.icon}</span><span>{f.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="text-muted-foreground mr-1 self-center">Correlation strength:</span>
              {[["Strong ≥0.40","text-red-400"],["Moderate 0.25–0.40","text-orange-400"],["Weak 0.15–0.25","text-yellow-500"],["Negligible <0.15","text-muted-foreground"]].map(([l,c]) => (
                <span key={l} className={`px-2 py-0.5 border border-border rounded-full bg-card font-semibold ${c}`}>{l}</span>
              ))}
            </div>

            {filterState !== "All India" && (
              <p className="text-xs text-blue-400 border border-blue-500/20 bg-blue-500/5 rounded px-3 py-1.5">
                Showing <strong>{filterState}</strong> in colour · others greyed.
                {districtSearch && ` "${districtSearch}" marked in red.`}
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {climateRelationships.map(rel => (
                <ScatterCard key={rel.title} rel={rel} filterState={filterState} highlightDistrict={districtSearch} />
              ))}
            </div>
          </section>
        )}

        {/* ── TAB: NFHS-6 Trends ────────────────────────────────────── */}
        {activeSection === "nfhs6" && (
          <section className="space-y-5">
            {!trends ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Loading NFHS-6 trend data…</div>
            ) : (
              <>
                <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-4 space-y-1.5">
                  <h2 className="text-sm font-bold text-violet-400">NFHS-5 (2019-21) → NFHS-6 (2023-24): what changed</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    State-level trends from the NFHS-6 fact sheets (provisional, released May 2026). The 2023-24 fieldwork
                    spans the <strong className="text-foreground">2023-24 El Niño</strong> — making the wasting and diarrhoea
                    shifts a real-world read on the climate-WASH cascades this platform models.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    ⚠️ NFHS-6 fact sheets do not publish <strong>sanitation, anaemia, clean fuel or handwashing</strong> —
                    those indicators elsewhere on this platform remain NFHS-5. Manipur was not surveyed.
                    † = small-sample state/UT (wide confidence intervals).
                  </p>
                </div>

                {/* National headline cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {(Object.keys(TREND_LABELS) as TrendIndicator[]).map(ind => {
                    const n = trends.national[ind];
                    const color = n.delta === 0 ? "text-muted-foreground" : n.improved ? "text-green-400" : "text-red-400";
                    return (
                      <div key={ind} className="rounded-lg border border-border bg-card p-2.5 text-center">
                        <div className="text-base leading-none mb-1">{TREND_ICONS[ind]}</div>
                        <div className="text-sm font-bold font-mono">{n.nfhs5}% → {n.nfhs6}%</div>
                        <div className={`text-xs font-semibold font-mono ${color}`}>
                          {n.delta > 0 ? "▲" : n.delta < 0 ? "▼" : "—"} {Math.abs(n.delta).toFixed(1)}pp
                        </div>
                        <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{TREND_LABELS[ind]}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Indicator picker + movers */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Indicator:</span>
                  {(Object.keys(TREND_LABELS) as TrendIndicator[]).map(ind => (
                    <button key={ind} onClick={() => setTrendIndicator(ind)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        trendIndicator === ind
                          ? "border-violet-400 text-violet-400 bg-violet-500/10 font-semibold"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}>
                      {TREND_ICONS[ind]} {TREND_LABELS[ind]}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { title:"Fastest improvers", rows: trends.highlights[trendIndicator]?.improvers ?? [], cls:"border-green-500/20 bg-green-500/5", txt:"text-green-400" },
                    { title:"Going backwards", rows: trends.highlights[trendIndicator]?.regressors ?? [], cls:"border-red-500/20 bg-red-500/5", txt:"text-red-400" },
                  ].map(panel => (
                    <div key={panel.title} className={`rounded-xl border p-4 ${panel.cls}`}>
                      <h3 className={`text-sm font-semibold mb-2 ${panel.txt}`}>{panel.title} — {TREND_LABELS[trendIndicator]}</h3>
                      <div className="space-y-1.5">
                        {panel.rows.map(r => (
                          <div key={r.state} className="flex items-center justify-between text-xs">
                            <span>{r.state}</span>
                            <span className="font-mono">
                              <span className={`font-semibold ${panel.txt}`}>{r.delta > 0 ? "+" : ""}{r.delta.toFixed(1)}pp</span>
                              <span className="text-muted-foreground ml-2">now {r.nfhs6}%</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Per-state delta chart */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold mb-1">
                    Change in {TREND_LABELS[trendIndicator].toLowerCase()}, NFHS-5 → NFHS-6 (percentage points)
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    {trendIndicator === "water" || trendIndicator === "mhm"
                      ? "Positive (green) = coverage improved."
                      : "Negative (green) = prevalence fell — improvement."} † = small sample, interpret with caution.
                  </p>
                  <div style={{ height: Math.max(300, trendBarData.length * 17) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trendBarData} layout="vertical" margin={{top:4,right:24,bottom:4,left:150}}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                        <XAxis type="number" tick={{fontSize:10,fill:"currentColor",opacity:0.5}} unit="pp" />
                        <YAxis dataKey="state" type="category" tick={{fontSize:10,fill:"currentColor"}} width={145} interval={0} />
                        <Tooltip content={({payload}) => {
                          if (!payload?.length) return null;
                          const p = payload[0].payload;
                          return (
                            <div className="bg-card border border-border rounded px-2.5 py-1.5 text-xs shadow-lg">
                              <div className="font-semibold">{p.state}</div>
                              <div className="font-mono">{p.nfhs5}% → {p.nfhs6}% ({p.delta > 0 ? "+" : ""}{p.delta}pp)</div>
                            </div>
                          );
                        }} />
                        <Bar dataKey="delta" radius={[0,3,3,0]}>
                          {trendBarData.map(entry => (
                            <Cell key={entry.state} fill={entry.improved ? "#4ade80" : "#f87171"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Climate × NFHS-6 correlations */}
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                  <h3 className="text-sm font-bold text-amber-400 mb-1">Climate exposure × NFHS-6 outcomes</h3>
                  <p className="text-xs text-muted-foreground">
                    Each point is a state ({trendScatters[0]?.n ?? 27} large-sample states). Climate axes come from this
                    platform's hex grid aggregated to state level; health axes from NFHS-6. The strongest links:
                    menstrual hygiene access vs stunting (r={trends.correlations[0]?.r.toFixed(2)}), humid-heat vs child
                    underweight, and — the trend signal — hotter and groundwater-stressed states saw wasting <em>worsen</em> between surveys.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {trendScatters.map(rel => (
                    <ScatterCard key={rel.title} rel={rel} filterState={filterState} highlightDistrict={districtSearch} />
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {/* ── TAB: Rajasthan Groundwater ────────────────────────────── */}
        {activeSection === "rajgw" && (
          <section className="space-y-5">
            {!rajGw ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Loading Rajasthan groundwater data…</div>
            ) : (
              <>
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-1.5">
                  <h2 className="text-sm font-bold text-cyan-400">Rajasthan: does rainfall explain groundwater stress, and does that drive JJM rollout?</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    All {rajGw.meta.n_districts} Rajasthan districts · {rajGw.meta.years} mean annual rainfall from the{" "}
                    <strong className="text-foreground">Open-Meteo ERA5 archive</strong> (real precipitation, not a hazard-frequency
                    proxy) at population-weighted district centroids, correlated against <strong className="text-foreground">WRIS</strong>{" "}
                    observation-well groundwater stress and <strong className="text-foreground">JJM IMIS</strong> tap-water coverage.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Scope: {rajGw.meta.scope}.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label:"Rain → GW stress", r: rajGw.correlations.rainfall_vs_gw_stress, desc:"annual rainfall" },
                    { label:"Monsoon → GW stress", r: rajGw.correlations.monsoon_rainfall_vs_gw_stress, desc:"Jun-Sep only" },
                    { label:"Rain → JJM coverage", r: rajGw.correlations.rainfall_vs_jjm_fhtc, desc:"rainfall vs taps" },
                    { label:"GW stress → JJM coverage", r: rajGw.correlations.gw_stress_vs_jjm_fhtc, desc:"stress vs taps" },
                  ].map(c => {
                    const badge = rBadge(c.r);
                    return (
                      <div key={c.label} className="rounded-lg border border-border bg-card p-2.5 text-center">
                        <div className={badge.cls + " mx-auto w-fit"}>{badge.label}</div>
                        <div className="text-[11px] font-medium mt-1.5 leading-tight">{c.label}</div>
                        <div className="text-[10px] text-muted-foreground">{c.desc}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {rajGwScatters.map(rel => (
                    <ScatterCard key={rel.title} rel={rel} filterState="All India" highlightDistrict={districtSearch} />
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <h3 className="text-sm font-semibold text-emerald-400 mb-1.5">🚰 The canal-recharge outlier</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Ganganagar (267mm/yr) and Hanumangarh (337mm/yr) get arid-zone rainfall — similar to Bikaner or Churu — but
                      their groundwater stress is far lower (0.49 and 0.68 vs 1.00) and their JJM coverage is the highest in the
                      state (89–91%). The Indira Gandhi Canal is doing real artificial recharge here, visible even without
                      MGNREGS data: rainfall alone underpredicts their groundwater health.
                    </p>
                  </div>
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <h3 className="text-sm font-semibold text-amber-400 mb-1.5">⚠️ Data gap, not zero coverage</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Jalor, Dhaulpur and Chittaurgarh have no JJM record at all in the pipeline — every hex in these districts
                      is null, not 0%. They're correctly excluded from the JJM correlations above rather than counted as
                      zero coverage, which would have distorted the result.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-border">
                    <h3 className="text-sm font-semibold">All 33 districts, sorted by groundwater stress (worst first)</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="border-b border-border">
                        <tr>
                          <th className={thCls + " text-left pl-3"}>District</th>
                          <th className={thCls + " text-right"}>Pop</th>
                          <th className={thCls + " text-right"}>GW stress</th>
                          <th className={thCls + " text-right"}>JJM tap %</th>
                          <th className={thCls + " text-right"}>Annual rain</th>
                          <th className={thCls + " text-right pr-3"}>Monsoon rain</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rajGw.districts.map(d => (
                          <tr key={d.district} className="border-b border-border/30 hover:bg-muted/20">
                            <td className="px-3 py-1.5 font-medium whitespace-nowrap">{d.district}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-muted-foreground text-[10px]">{FMT_POP(d.population)}</td>
                            <td className={`px-2 py-1.5 text-right font-mono ${d.gw_stress_score >= 0.9 ? "text-red-400 font-semibold" : d.gw_stress_score >= 0.5 ? "text-orange-400" : "text-green-400"}`}>
                              {d.gw_stress_score.toFixed(2)}
                            </td>
                            <td className={`px-2 py-1.5 text-right font-mono ${d.jjm_fhtc_pct == null ? "text-muted-foreground" : d.jjm_fhtc_pct < 50 ? "text-red-400" : d.jjm_fhtc_pct < 75 ? "text-yellow-500" : "text-green-400"}`}>
                              {d.jjm_fhtc_pct != null ? `${d.jjm_fhtc_pct.toFixed(1)}%` : "— no data"}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">{d.annual_rainfall_mm.toFixed(0)} mm</td>
                            <td className="px-2 py-1.5 text-right font-mono pr-3">{d.monsoon_rainfall_mm.toFixed(0)} mm</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* ── TAB: WASH-Health ─────────────────────────────────────── */}
        {activeSection === "wash" && (
          <section className="space-y-5">
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <h2 className="text-sm font-bold text-blue-400 mb-2">WASH coverage → health outcomes</h2>
              <p className="text-xs text-muted-foreground">Direct measurable impact of JJM, SBM, and Ujjwala on stunting and anaemia across 710 districts. Use these to prioritise interventions in the All Districts tab.</p>
            </div>

            {filterState !== "All India" && (
              <p className="text-xs text-blue-400 border border-blue-500/20 bg-blue-500/5 rounded px-3 py-1.5">
                Showing <strong>{filterState}</strong> in colour.{districtSearch && ` "${districtSearch}" marked in red.`}
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {washRelationships.map(rel => (
                <ScatterCard key={rel.title} rel={rel} filterState={filterState} highlightDistrict={districtSearch} />
              ))}
            </div>
          </section>
        )}

        {/* ── TAB: All Districts ────────────────────────────────────── */}
        {activeSection === "districts" && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-40">
                <Search className="absolute left-2 top-1.5 h-3 w-3 text-muted-foreground pointer-events-none" />
                <input type="text" placeholder="Search any district or state…"
                  value={tableSearch} onChange={e => setTableSearch(e.target.value)}
                  className="w-full pl-6 pr-3 py-1 text-xs rounded-md border border-border bg-muted/40 text-foreground outline-none placeholder:text-muted-foreground/60" />
              </div>
              <div className="relative">
                <ChevronDown className="pointer-events-none absolute right-2 top-1.5 h-3 w-3 text-muted-foreground" />
                <select value={hazardFilter} onChange={e => setHazardFilter(e.target.value)}
                  className="appearance-none pl-2 pr-6 py-1 text-xs rounded-md border border-border bg-muted/40 text-foreground outline-none cursor-pointer">
                  <option value="all">All hazards</option>
                  {(["flood","wetbulb","coldwave","drought","landslide"] as const).map(h => (
                    <option key={h} value={h}>{HZ_BADGE[h]} {({flood:"Flood",wetbulb:"Wet-Bulb",coldwave:"Cold Wave",drought:"Drought",landslide:"Landslide"} as Record<string,string>)[h]}</option>
                  ))}
                </select>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">{filteredDistricts.length} of {all_districts.length}</span>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-border">
                    <tr>
                      <th className={thCls + " text-left pl-3"}>#</th>
                      <th className={thCls + " text-left"}>District</th>
                      <th className={thCls + " text-left"}>State</th>
                      <th className={thCls + " text-left"}>Hz</th>
                      {sortable("risk","Risk")}
                      {sortable("wb50","WB 2050")}
                      {sortable("ht50","Heat 2050")}
                      {sortable("ana","Anaemia")}
                      {sortable("stun","Stunting")}
                      {sortable("jjm","JJM")}
                      {sortable("san","Sanit.")}
                      {sortable("pop","Pop")}
                      <th className={thCls + " text-right pr-3"}>Links</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDistricts.slice(0, 100).map((row, i) => {
                      const isHL = districtSearch && row.d.toLowerCase().includes(districtSearch.toLowerCase());
                      return (
                        <tr key={row.d} className={`border-b border-border/30 ${isHL ? "bg-red-500/10" : "hover:bg-muted/20"}`}>
                          <td className="px-3 py-1.5 text-muted-foreground text-[10px]">{i+1}</td>
                          <td className="px-2 py-1.5 font-medium whitespace-nowrap">{row.d}</td>
                          <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap text-[10px]">{row.st}</td>
                          <td className="px-2 py-1.5 text-base leading-none" title={row.hz}>{HZ_BADGE[row.hz] ?? "—"}</td>
                          <td className={`px-2 py-1.5 text-right font-mono ${(row.risk||0)>7?"text-red-400 font-semibold":(row.risk||0)>5?"text-orange-400":""}`}>
                            {fmt1(row.risk)}
                          </td>
                          <td className={`px-2 py-1.5 text-right font-mono font-semibold ${(row.wb50||0)>60?"text-orange-400":(row.wb50||0)>40?"text-yellow-500":""}`}>
                            {fmt0(row.wb50)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                            {fmt0(row.ht50)}
                          </td>
                          <td className={`px-2 py-1.5 text-right font-mono ${(row.ana||0)>65?"text-red-400 font-semibold":""}`}>
                            {row.ana != null ? `${row.ana.toFixed(0)}%` : "—"}
                          </td>
                          <td className={`px-2 py-1.5 text-right font-mono ${(row.stun||0)>35?"text-orange-400":""}`}>
                            {row.stun != null ? `${row.stun.toFixed(0)}%` : "—"}
                          </td>
                          <td className={`px-2 py-1.5 text-right font-mono ${(row.jjm||0)<50?"text-red-400":(row.jjm||0)<75?"text-yellow-500":"text-green-400"}`}>
                            {row.jjm != null ? `${row.jjm.toFixed(0)}%` : "—"}
                          </td>
                          <td className={`px-2 py-1.5 text-right font-mono ${(row.san||0)<60?"text-red-400":(row.san||0)<80?"text-yellow-500":""}`}>
                            {row.san != null ? `${row.san.toFixed(0)}%` : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-muted-foreground text-[10px]">
                            {row.pop ? FMT_POP(row.pop) : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right pr-3">
                            <div className="flex items-center gap-1.5 justify-end">
                              <Link href={`/wash-assess?district=${encodeURIComponent(row.d)}`}
                                className="text-[10px] text-emerald-400 hover:text-emerald-300 whitespace-nowrap">Assess</Link>
                              <Link href={`/report/${encodeURIComponent(row.d)}`}
                                className="text-[10px] text-blue-400 hover:text-blue-300">
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredDistricts.length > 100 && (
                <div className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border bg-muted/20">
                  Showing top 100 of {filteredDistricts.length} · narrow with search or state filter
                </div>
              )}
            </div>

            <div className="text-[10px] text-muted-foreground flex flex-wrap gap-4 mt-1">
              <span><span className="text-red-400 font-semibold">Red</span> = critical threshold exceeded</span>
              <span><span className="text-orange-400">Orange</span> = elevated concern</span>
              <span><span className="text-green-400">Green</span> = good coverage</span>
              <span>WB 2050 = wet-bulb days/yr under SSP5-8.5</span>
            </div>
          </section>
        )}

        {/* ── TAB: Future Projections ───────────────────────────────── */}
        {activeSection === "future" && (
          <section className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label:"SSP2-4.5 (moderate)", icon:"🟡", desc:"~2.7°C by 2100. Current NDC commitments roughly track this.", color:"border-yellow-500/30 bg-yellow-500/5" },
                { label:"SSP5-8.5 (high emissions)", icon:"🔴", desc:"~4.4°C by 2100. Upper-bound planning scenario.", color:"border-red-500/30 bg-red-500/5" },
              ].map(s => (
                <div key={s.label} className={`rounded-lg border p-3 text-xs ${s.color}`}>
                  <div className="font-semibold text-sm">{s.icon} {s.label}</div>
                  <p className="text-muted-foreground mt-1">{s.desc}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-1">Heat & Wet-Bulb Days — National Average</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Wet-bulb days hit <strong className="text-foreground">{future_national.wet_bulb_days.ssp585_2050} d/yr</strong> nationally under SSP5-8.5 by 2050.
                Flood-disruption days: <strong className="text-foreground">{future_national.flood_days.ssp585_2050} d/yr</strong>. Severe-heat days: <strong className="text-foreground">{future_national.severe_heat.ssp585_2050} d/yr</strong>.
              </p>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={futureBarData} margin={{top:4,right:16,bottom:4,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                    <XAxis dataKey="scenario" tick={{fontSize:11,fill:"currentColor",opacity:0.7}} />
                    <YAxis tick={{fontSize:10,fill:"currentColor",opacity:0.5}} unit=" d" />
                    <Tooltip formatter={(v:number,name:string) => [`${(v as number).toFixed(1)} d/yr`, name]}
                      contentStyle={{background:"var(--background)",border:"1px solid var(--border)",borderRadius:"8px",fontSize:"12px"}} />
                    <Legend wrapperStyle={{fontSize:"12px"}} />
                    <Bar dataKey="heat" name="Heat Days" fill="#f87171" radius={[3,3,0,0]} />
                    <Bar dataKey="wetbulb" name="Wet-Bulb Days" fill="#fb923c" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label:"Flood days 2050", val:`${future_national.flood_days.ssp585_2050} d/yr`, sub:"SSP5-8.5 national avg", color:"text-blue-400 border-blue-500/20 bg-blue-500/5" },
                { label:"Severe heat 2050", val:`${future_national.severe_heat.ssp585_2050} d/yr`, sub:"SSP5-8.5 national avg", color:"text-red-400 border-red-500/20 bg-red-500/5" },
                { label:"SSP2 wet-bulb 2050", val:`${future_national.wet_bulb_days.ssp245_2050} d/yr`, sub:"lower-bound scenario", color:"text-yellow-500 border-yellow-500/20 bg-yellow-500/5" },
                { label:"SSP2 flood 2050", val:`${future_national.flood_days.ssp245_2050 ?? "—"} d/yr`, sub:"SSP2-4.5 2050", color:"text-teal-400 border-teal-500/20 bg-teal-500/5" },
              ].map(s => (
                <div key={s.label} className={`rounded-lg border p-3 text-center ${s.color}`}>
                  <div className="text-xl font-bold">{s.val}</div>
                  <div className="text-xs font-medium mt-0.5">{s.label}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-1">States: Wet-Bulb Days by 2050 (SSP5-8.5)</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top_wetbulb_states} layout="vertical" margin={{top:4,right:16,bottom:4,left:120}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                    <XAxis type="number" tick={{fontSize:10,fill:"currentColor",opacity:0.5}} unit=" d" />
                    <YAxis dataKey="state" type="category" tick={{fontSize:11,fill:"currentColor"}} width={115} />
                    <Tooltip formatter={(v:number) => [`${(v as number).toFixed(1)} d/yr`,"Wet-bulb days"]}
                      contentStyle={{background:"var(--background)",border:"1px solid var(--border)",borderRadius:"8px",fontSize:"12px"}} />
                    <Bar dataKey="wb_days_585_2050" radius={[0,3,3,0]}>
                      {top_wetbulb_states.map(entry => (
                        <Cell key={entry.state}
                          fill={filterState !== "All India" && entry.state === filterState ? "#ef4444" : "#fb923c"}
                          opacity={filterState !== "All India" && entry.state !== filterState ? 0.35 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {data.escalation_districts && data.escalation_districts.length > 0 && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <h3 className="text-sm font-semibold text-red-400 mb-1">
                  ⚠️ High Escalation Districts — {data.escalation_districts.length} districts with &gt;20 heat days/yr by 2050
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Districts where SSP5-8.5 2050 heat exceeds 20 days/yr AND wet-bulb days are highest — sorted by wet-bulb severity.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-border">
                      <tr>
                        {["District","State","Heat d/yr 2050","Wet-Bulb d/yr 2050","Anaemia %","Stunting %","Population"].map(h => (
                          <th key={h} className="text-left px-2 py-1.5 font-semibold text-[10px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.escalation_districts.slice(0,20).map((r, i) => (
                        <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="px-2 py-1.5 font-medium whitespace-nowrap">{r.district}</td>
                          <td className="px-2 py-1.5 text-muted-foreground text-[10px] whitespace-nowrap">{r.state}</td>
                          <td className="px-2 py-1.5 font-mono text-red-400 font-semibold">{r.heat_days_2050?.toFixed(1) ?? "—"}</td>
                          <td className={`px-2 py-1.5 font-mono font-semibold ${(r.wet_bulb_days_2050??0)>100?"text-orange-400":"text-yellow-500"}`}>{r.wet_bulb_days_2050?.toFixed(1) ?? "—"}</td>
                          <td className={`px-2 py-1.5 font-mono ${(r.anaemia_pct??0)>65?"text-red-400":""}`}>{r.anaemia_pct != null ? `${r.anaemia_pct.toFixed(1)}%` : "—"}</td>
                          <td className={`px-2 py-1.5 font-mono ${(r.stunting_pct??0)>35?"text-orange-400":""}`}>{r.stunting_pct != null ? `${r.stunting_pct.toFixed(1)}%` : "—"}</td>
                          <td className="px-2 py-1.5 font-mono text-muted-foreground text-[10px]">{r.population ? FMT_POP(r.population) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.escalation_districts.length > 20 && (
                    <div className="px-2 py-2 text-[10px] text-muted-foreground border-t border-border bg-muted/10">
                      Showing 20 of {data.escalation_districts.length} escalation districts
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── TAB: Social Vulnerability ─────────────────────────────── */}
        {activeSection === "vulnerability" && (
          <section className="space-y-5">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-1">Anaemia, Stunting & Wasting by Dominant Hazard</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Wet-bulb heat districts show the highest anaemia (66.4%) — heat+humidity impairs iron absorption. Flood districts have the highest stunting — repeated waterborne contamination compounds into chronic undernutrition.
              </p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hazardBarData} margin={{top:4,right:16,bottom:40,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                    <XAxis dataKey="name" tick={{fontSize:10,fill:"currentColor",opacity:0.7}} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{fontSize:10,fill:"currentColor",opacity:0.5}} unit="%" />
                    <Tooltip formatter={(v:number, name:string) => [`${(v as number).toFixed(1)}%`, name]}
                      contentStyle={{background:"var(--background)",border:"1px solid var(--border)",borderRadius:"8px",fontSize:"12px"}} />
                    <Legend wrapperStyle={{fontSize:"12px"}} />
                    <Bar dataKey="Anaemia" fill="#f87171" radius={[3,3,0,0]} />
                    <Bar dataKey="Stunting" fill="#fb923c" radius={[3,3,0,0]} />
                    <Bar dataKey="Wasting" fill="#facc15" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { title:"Anaemia burden", icon:"🩸", stat:`${summary.national_anaemia_pct}%`, desc:"of Indian women 15-49 have anaemia", detail:`${summary.high_anaemia_districts} districts exceed 70%`, color:"text-red-400", bg:"bg-red-500/5 border-red-500/20" },
                { title:"Child stunting", icon:"📏", stat:`${summary.national_stunting_pct}%`, desc:"of children under 5 are stunted nationally", detail:`${summary.high_stunting_districts} districts exceed 40%`, color:"text-orange-400", bg:"bg-orange-500/5 border-orange-500/20" },
                { title:"WASH disruption", icon:"💧", stat:`${summary.national_disruption_days} days`, desc:"average annual WASH disruption per district", detail:"Compound climate-WASH impact days", color:"text-blue-400", bg:"bg-blue-500/5 border-blue-500/20" },
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

            <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-4 space-y-3">
              <h3 className="text-sm font-semibold">The MHM–Antenatal Chain</h3>
              <p className="text-xs text-muted-foreground">
                Strongest social relationship: MHM coverage predicts antenatal care (r={rByTitle["Menstrual Hygiene & Antenatal Care"] != null ? `${rByTitle["Menstrual Hygiene & Antenatal Care"]>0?"+":""}${rByTitle["Menstrual Hygiene & Antenatal Care"].toFixed(2)}` : "+0.47"}). Districts with high child marriage (&gt;35%) AND low MHM (&lt;50%) show only <strong className="text-pink-400">27.6%</strong> antenatal coverage — vs <strong className="text-foreground">60.5%</strong> elsewhere.
              </p>
              <div className="grid grid-cols-2 gap-3 text-center">
                {[
                  { label:"High child marriage + low MHM", value:"27.6%", color:"text-pink-400" },
                  { label:"Other districts", value:"60.5%", color:"text-green-400" },
                ].map(s => (
                  <div key={s.label} className="rounded-lg bg-background/50 p-3">
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">antenatal coverage</div>
                    <div className="text-xs font-medium mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── TAB: Resilience Drivers ───────────────────────────────── */}
        {activeSection === "resilience" && (
          <section className="space-y-5">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-4">What Predicts Adaptive Capacity? (correlation with AC index)</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={acBarData} layout="vertical" margin={{top:4,right:40,bottom:4,left:160}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                    <XAxis type="number" tick={{fontSize:10,fill:"currentColor",opacity:0.5}} domain={[0,1]} />
                    <YAxis dataKey="label" type="category" tick={{fontSize:11,fill:"currentColor"}} width={155} />
                    <Tooltip formatter={(_v:number, _n:string, props:any) => {
                        const raw = props?.payload?.raw_r;
                        return [`r = ${raw >= 0 ? "+" : ""}${raw?.toFixed(2)}`, "Correlation with AC"];
                      }}
                      contentStyle={{background:"var(--background)",border:"1px solid var(--border)",borderRadius:"8px",fontSize:"12px"}} />
                    <Bar dataKey="r" fill="#60a5fa" radius={[0,3,3,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { title:"⚡ Electrification — top AC predictor", body:"Electricity enables cold chain, medical equipment, information access, and economic activity. Rural electrification (SAUBHAGYA) directly builds climate resilience.", color:"text-yellow-400 border-yellow-500/20 bg-yellow-500/5" },
                { title:"📚 Literacy — the multiplier", body:"Enables health-seeking, early warning uptake, financial inclusion. Districts with low female literacy show worse outcomes across ALL WASH indicators simultaneously.", color:"text-blue-400 border-blue-500/20 bg-blue-500/5" },
                { title:"💉 Vaccination — proxy for system reach", body:"High vaccination = functional supply chains, community trust, and health worker reach. Low vaccination = low surge capacity during climate-driven disease outbreaks.", color:"text-teal-400 border-teal-500/20 bg-teal-500/5" },
                { title:"🚿 JJM tap water — WASH resilience floor", body:"FHTC reduces women's time burden (2–4 hrs/day), protects water quality during floods, eliminates drought water insecurity. Highest direct WASH contributor to AC.", color:"text-green-400 border-green-500/20 bg-green-500/5" },
              ].map(c => (
                <div key={c.title} className={`rounded-xl border p-4 space-y-2 ${c.color}`}>
                  <h4 className="text-sm font-semibold">{c.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{c.body}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <h3 className="text-sm font-semibold text-blue-400 mb-3">Program Sequencing</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {[
                  { tier:"1 — Build floor", color:"border-green-500/30 bg-green-500/5", items:["JJM FHTC expansion (highest WASH AC driver)","Electrification in dark/partial villages","ORS + basic health worker training"] },
                  { tier:"2 — Raise capacity", color:"border-yellow-500/30 bg-yellow-500/5", items:["Female literacy programs","MHM + menstrual hygiene supply","Antenatal outreach in low-MHM clusters"] },
                  { tier:"3 — Climate-proof", color:"border-red-500/30 bg-red-500/5", items:["Twin-pit retrofit in flood zones","PM Ujjwala for anaemia + pollution","Heat-safe WASH for wet-bulb zones"] },
                ].map(t => (
                  <div key={t.tier} className={`rounded-lg border p-3 ${t.color}`}>
                    <div className="font-semibold mb-2">{t.tier}</div>
                    <ul className="space-y-1">
                      {t.items.map(it => (
                        <li key={it} className="flex items-start gap-1.5 text-muted-foreground">
                          <span className="mt-0.5 shrink-0">→</span><span>{it}</span>
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
