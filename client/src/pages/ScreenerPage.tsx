import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, ChevronUp, ChevronDown, ExternalLink, Filter, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

// ── Types ──────────────────────────────────────────────────────────────────

interface District {
  district: string;
  state: string;
  risk: number;
  dominant_hazard: string;
  priority_tier: string;
  capacity_gap: number;
  risk_escalation: number;
  future_risk_2050: number;
  jjm_fhtc_pct: number | null;
  twin_pit_pct: number | null;
  menstrual_hygiene_pct: number | null;
  clean_fuel_pct: number | null;
  child_marriage_pct: number | null;
  antenatal_4visit_pct: number | null;
  ors_diarrhoea_pct: number | null;
  health_insurance_pct: number | null;
  total_ihhl: number | null;
  people_at_risk: number | null;
  people_at_risk_2050: number | null;
  gaps: string[];
  gap_count: number;
  interventions: string[];
  primary_intervention: string | null;
  gap_score: number;
}

type SortKey = "gap_score" | "risk" | "gap_count" | "district" | "state";
type SortDir = "asc" | "desc";

// ── Constants ──────────────────────────────────────────────────────────────

const HAZARD_ICON: Record<string, string> = {
  flood: "🌊", "wet-bulb": "🌡️", drought: "🏜️", heat: "🔥",
  cyclone: "🌀", landslide: "⛰️", "cold wave": "❄️",
};

const TIER_COLOR: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high:     "bg-orange-500/20 text-orange-400 border-orange-500/30",
  moderate: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  low:      "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30",
};

const GAP_META: Record<string, { label: string; icon: string; color: string }> = {
  "flood-toilet":   { label: "Flood toilet", icon: "🚽", color: "bg-red-500/15 text-red-500 border-red-500/30" },
  "water-gap":      { label: "Water access", icon: "💧", color: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  "MHM":            { label: "Menstrual hygiene", icon: "🩸", color: "bg-pink-500/15 text-pink-500 border-pink-500/30" },
  "clean-fuel":     { label: "Clean fuel", icon: "🔥", color: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
  "child-marriage": { label: "Child marriage", icon: "💍", color: "bg-purple-500/15 text-purple-500 border-purple-500/30" },
  "antenatal":      { label: "Antenatal care", icon: "🏥", color: "bg-teal-500/15 text-teal-500 border-teal-500/30" },
  "ORS":            { label: "ORS coverage", icon: "💊", color: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30" },
};

const ALL_GAPS = Object.keys(GAP_META);

const ALL_HAZARDS = ["flood", "wet-bulb", "drought", "heat", "cold wave", "cyclone", "landslide"];

const PAGE_SIZE = 50;

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtPop = (n: number | null) =>
  !n ? "—" : n >= 1e7 ? `${(n/1e7).toFixed(1)}Cr` : n >= 1e5 ? `${(n/1e5).toFixed(1)}L` : `${(n/1e3).toFixed(0)}K`;

const fmtPct = (v: number | null) => v == null ? "—" : `${v.toFixed(0)}%`;

function riskColor(r: number) {
  if (r >= 8) return "text-red-500 font-bold";
  if (r >= 6) return "text-orange-500 font-semibold";
  if (r >= 4) return "text-yellow-600 dark:text-yellow-400";
  return "text-green-600 dark:text-green-400";
}

function pctColor(v: number | null, low: number, good = 80) {
  if (v == null) return "text-muted-foreground";
  if (v >= good) return "text-green-600 dark:text-green-400";
  if (v < low) return "text-red-500 font-semibold";
  return "text-yellow-600 dark:text-yellow-400";
}

function exportCSV(rows: District[]) {
  const headers = [
    "District","State","Risk","Hazard","Priority Tier","JJM FHTC %",
    "Twin-pit %","MHM %","Clean Fuel %","Child Marriage %","Antenatal %",
    "ORS %","Gap Count","Gaps","Primary Intervention","People at Risk 2050",
  ];
  const lines = rows.map(r => [
    r.district, r.state, r.risk, r.dominant_hazard, r.priority_tier,
    r.jjm_fhtc_pct ?? "", r.twin_pit_pct ?? "", r.menstrual_hygiene_pct ?? "",
    r.clean_fuel_pct ?? "", r.child_marriage_pct ?? "", r.antenatal_4visit_pct ?? "",
    r.ors_diarrhoea_pct ?? "", r.gap_count, r.gaps.join("; "),
    r.primary_intervention ?? "", r.people_at_risk_2050 ?? "",
  ].map(v => `"${v}"`).join(","));
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "district_wash_gaps.csv";
  a.click();
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ScreenerPage() {
  const { data: matrix = [], isLoading } = useQuery<District[]>({
    queryKey: ["decision-matrix"],
    queryFn: () => fetch("/data/decision_matrix.json").then(r => r.json()),
    staleTime: Infinity,
  });

  // Filters
  const [stateFilter, setStateFilter]   = useState("");
  const [hazardFilter, setHazardFilter] = useState("");
  const [tierFilter, setTierFilter]     = useState("");
  const [gapFilter, setGapFilter]       = useState<string[]>([]);
  const [minGaps, setMinGaps]           = useState(0);
  const [minRisk, setMinRisk]           = useState(0);
  const [search, setSearch]             = useState("");
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [page, setPage]                 = useState(1);

  // Sort
  const [sortKey, setSortKey]   = useState<SortKey>("gap_score");
  const [sortDir, setSortDir]   = useState<SortDir>("desc");

  const states = useMemo(() => {
    const s = new Set(matrix.map(d => d.state));
    return Array.from(s).sort();
  }, [matrix]);

  const filtered = useMemo(() => {
    let rows = matrix;
    if (stateFilter)  rows = rows.filter(r => r.state === stateFilter);
    if (hazardFilter) rows = rows.filter(r => r.dominant_hazard === hazardFilter);
    if (tierFilter)   rows = rows.filter(r => r.priority_tier === tierFilter);
    if (gapFilter.length > 0) rows = rows.filter(r => gapFilter.every(g => r.gaps.includes(g)));
    if (minGaps > 0)  rows = rows.filter(r => r.gap_count >= minGaps);
    if (minRisk > 0)  rows = rows.filter(r => r.risk >= minRisk);
    if (search)       rows = rows.filter(r =>
      r.district.toLowerCase().includes(search.toLowerCase()) ||
      r.state.toLowerCase().includes(search.toLowerCase())
    );

    // Sort
    return [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = av as number, bn = bv as number;
      return sortDir === "asc" ? an - bn : bn - an;
    });
  }, [matrix, stateFilter, hazardFilter, tierFilter, gapFilter, minGaps, minRisk, search, sortKey, sortDir]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const totalPeople = useMemo(() =>
    filtered.reduce((s, r) => s + (r.people_at_risk_2050 ?? 0), 0),
  [filtered]);

  const criticalCount = filtered.filter(r => r.priority_tier === "critical").length;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronDown className="w-3 h-3 opacity-30" />;
    return sortDir === "desc"
      ? <ChevronDown className="w-3 h-3 text-blue-400" />
      : <ChevronUp className="w-3 h-3 text-blue-400" />;
  }

  function toggleGap(g: string) {
    setGapFilter(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
    setPage(1);
  }

  const hasFilters = stateFilter || hazardFilter || tierFilter || gapFilter.length > 0 || minGaps > 0 || minRisk > 0 || search;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-lg font-bold leading-none">District Action Screener</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cross-filter WASH gaps × climate risk to identify intervention priorities
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => exportCSV(filtered)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border hover:bg-muted transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV ({filtered.length})
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 py-4 space-y-4">
        {/* Stats banner */}
        {!isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Districts shown", value: filtered.length.toLocaleString(), color: "text-foreground" },
              { label: "Critical priority", value: criticalCount.toLocaleString(), color: "text-red-500" },
              { label: "2050 people at risk", value: fmtPop(totalPeople), color: "text-orange-500" },
              { label: "Avg gap score", value: filtered.length ? (filtered.reduce((s,r) => s+r.gap_score,0)/filtered.length).toFixed(1) : "—", color: "text-blue-400" },
            ].map(s => (
              <div key={s.label} className="rounded-lg border border-border bg-card px-4 py-3">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="w-3.5 h-3.5" />
            Filters
            {hasFilters && (
              <button
                onClick={() => {
                  setStateFilter(""); setHazardFilter(""); setTierFilter("");
                  setGapFilter([]); setMinGaps(0); setMinRisk(0); setSearch(""); setPage(1);
                }}
                className="ml-auto flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                <X className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Search */}
            <input
              type="text"
              placeholder="Search district or state…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="border border-border bg-background rounded px-3 py-1.5 text-sm w-52 focus:outline-none focus:border-blue-400"
            />

            {/* State */}
            <select
              value={stateFilter}
              onChange={e => { setStateFilter(e.target.value); setPage(1); }}
              className="border border-border bg-background rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
            >
              <option value="">All states</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            {/* Hazard */}
            <select
              value={hazardFilter}
              onChange={e => { setHazardFilter(e.target.value); setPage(1); }}
              className="border border-border bg-background rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
            >
              <option value="">All hazards</option>
              {ALL_HAZARDS.map(h => (
                <option key={h} value={h}>{HAZARD_ICON[h] ?? ""} {h.charAt(0).toUpperCase() + h.slice(1)}</option>
              ))}
            </select>

            {/* Priority tier */}
            <select
              value={tierFilter}
              onChange={e => { setTierFilter(e.target.value); setPage(1); }}
              className="border border-border bg-background rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
            >
              <option value="">All tiers</option>
              {["critical","high","moderate","low"].map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>

            {/* Min risk */}
            <select
              value={minRisk}
              onChange={e => { setMinRisk(Number(e.target.value)); setPage(1); }}
              className="border border-border bg-background rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
            >
              <option value={0}>Any risk</option>
              <option value={4}>Risk ≥ 4</option>
              <option value={5}>Risk ≥ 5</option>
              <option value={6}>Risk ≥ 6</option>
              <option value={7}>Risk ≥ 7</option>
              <option value={8}>Risk ≥ 8</option>
            </select>

            {/* Min gaps */}
            <select
              value={minGaps}
              onChange={e => { setMinGaps(Number(e.target.value)); setPage(1); }}
              className="border border-border bg-background rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
            >
              <option value={0}>Any # gaps</option>
              <option value={1}>1+ gaps</option>
              <option value={2}>2+ gaps</option>
              <option value={3}>3+ gaps</option>
              <option value={4}>4+ gaps</option>
            </select>
          </div>

          {/* Gap type toggles */}
          <div className="flex flex-wrap gap-1.5">
            {ALL_GAPS.map(g => {
              const m = GAP_META[g];
              const active = gapFilter.includes(g);
              return (
                <button
                  key={g}
                  onClick={() => toggleGap(g)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all ${
                    active ? m.color + " font-semibold" : "border-border text-muted-foreground hover:border-muted-foreground"
                  }`}
                >
                  {m.icon} {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 text-left w-6 font-normal">#</th>
                  <th
                    className="px-3 py-2.5 text-left cursor-pointer hover:text-foreground whitespace-nowrap select-none"
                    onClick={() => toggleSort("district")}
                  >
                    <span className="flex items-center gap-1">District <SortIcon k="district" /></span>
                  </th>
                  <th
                    className="px-3 py-2.5 text-left cursor-pointer hover:text-foreground whitespace-nowrap select-none"
                    onClick={() => toggleSort("state")}
                  >
                    <span className="flex items-center gap-1">State <SortIcon k="state" /></span>
                  </th>
                  <th
                    className="px-3 py-2.5 text-center cursor-pointer hover:text-foreground whitespace-nowrap select-none"
                    onClick={() => toggleSort("risk")}
                  >
                    <span className="flex items-center gap-1 justify-center">Risk <SortIcon k="risk" /></span>
                  </th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Hazard</th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Priority</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">JJM%</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">Twin-pit%</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">MHM%</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">Clean fuel%</th>
                  <th
                    className="px-3 py-2.5 text-center cursor-pointer hover:text-foreground whitespace-nowrap select-none"
                    onClick={() => toggleSort("gap_count")}
                  >
                    <span className="flex items-center gap-1 justify-center">Gaps <SortIcon k="gap_count" /></span>
                  </th>
                  <th className="px-3 py-2.5 text-left">Gap types</th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">People at risk 2050</th>
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Report</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={14} className="px-3 py-12 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={14} className="px-3 py-12 text-center text-muted-foreground">
                      No districts match the current filters.
                    </td>
                  </tr>
                )}
                {pageRows.map((row, idx) => {
                  const globalIdx = (page - 1) * PAGE_SIZE + idx + 1;
                  const isOpen = expanded === row.district;
                  return (
                    <>
                      <tr
                        key={row.district}
                        className={`border-b border-border/60 hover:bg-muted/30 cursor-pointer transition-colors ${isOpen ? "bg-muted/40" : ""}`}
                        onClick={() => setExpanded(isOpen ? null : row.district)}
                      >
                        <td className="px-3 py-2 text-muted-foreground text-xs">{globalIdx}</td>
                        <td className="px-3 py-2 font-medium">{row.district}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{row.state}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`font-mono text-sm ${riskColor(row.risk)}`}>
                            {row.risk.toFixed(1)}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs">
                          {HAZARD_ICON[row.dominant_hazard] ?? "⚡"} {row.dominant_hazard}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${TIER_COLOR[row.priority_tier] ?? "border-border text-muted-foreground"}`}>
                            {row.priority_tier}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-center text-xs font-mono ${pctColor(row.jjm_fhtc_pct, 50)}`}>
                          {fmtPct(row.jjm_fhtc_pct)}
                        </td>
                        <td className={`px-3 py-2 text-center text-xs font-mono ${pctColor(row.twin_pit_pct, 20)}`}>
                          {fmtPct(row.twin_pit_pct)}
                        </td>
                        <td className={`px-3 py-2 text-center text-xs font-mono ${pctColor(row.menstrual_hygiene_pct, 50)}`}>
                          {fmtPct(row.menstrual_hygiene_pct)}
                        </td>
                        <td className={`px-3 py-2 text-center text-xs font-mono ${pctColor(row.clean_fuel_pct, 30)}`}>
                          {fmtPct(row.clean_fuel_pct)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.gap_count > 0 && (
                            <span className={`inline-flex items-center justify-center w-5 h-5 text-xs rounded-full font-semibold ${
                              row.gap_count >= 4 ? "bg-red-500/20 text-red-400" :
                              row.gap_count >= 2 ? "bg-orange-500/20 text-orange-400" :
                              "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                            }`}>
                              {row.gap_count}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {row.gaps.map(g => (
                              <span
                                key={g}
                                title={GAP_META[g]?.label ?? g}
                                className={`text-xs px-1.5 py-0.5 rounded border ${GAP_META[g]?.color ?? "border-border text-muted-foreground"}`}
                              >
                                {GAP_META[g]?.icon ?? g}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs font-mono">
                          {fmtPop(row.people_at_risk_2050)}
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/report/${encodeURIComponent(row.district)}`}
                            onClick={e => e.stopPropagation()}
                            className="text-blue-400 hover:text-blue-300 transition-colors"
                            title="Open district report"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${row.district}-expand`} className="bg-muted/20">
                          <td colSpan={14} className="px-4 py-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {/* Action plan */}
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                  Recommended Interventions
                                </h4>
                                {row.interventions.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">No critical gaps identified.</p>
                                ) : (
                                  <ol className="space-y-1.5">
                                    {row.interventions.map((iv, i) => (
                                      <li key={i} className="flex items-start gap-2 text-xs">
                                        <span className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                          i === 0 ? "bg-red-500/20 text-red-400" : "bg-muted text-muted-foreground"
                                        }`}>{i+1}</span>
                                        <span>{iv}</span>
                                      </li>
                                    ))}
                                  </ol>
                                )}
                              </div>
                              {/* Key metrics */}
                              <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                  <div className="text-muted-foreground mb-1">WASH indicators</div>
                                  <div className="space-y-0.5">
                                    <div className="flex justify-between"><span>Sanitation coverage</span><span className="font-mono">{fmtPct((row as any).wash_sanitation_pct)}</span></div>
                                    <div className="flex justify-between"><span>ORS use (diarrhoea)</span><span className="font-mono">{fmtPct(row.ors_diarrhoea_pct)}</span></div>
                                    <div className="flex justify-between"><span>Antenatal 4-visit</span><span className="font-mono">{fmtPct(row.antenatal_4visit_pct)}</span></div>
                                    <div className="flex justify-between"><span>Child marriage rate</span><span className="font-mono">{fmtPct(row.child_marriage_pct)}</span></div>
                                    <div className="flex justify-between"><span>Health insurance</span><span className="font-mono">{fmtPct(row.health_insurance_pct)}</span></div>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground mb-1">Climate & risk</div>
                                  <div className="space-y-0.5">
                                    <div className="flex justify-between"><span>Current risk</span><span className={`font-mono font-semibold ${riskColor(row.risk)}`}>{row.risk.toFixed(1)}/10</span></div>
                                    <div className="flex justify-between"><span>Future risk 2050</span><span className="font-mono">{row.future_risk_2050.toFixed(1)}/10</span></div>
                                    <div className="flex justify-between"><span>Capacity gap</span><span className="font-mono">{row.capacity_gap.toFixed(1)}</span></div>
                                    <div className="flex justify-between"><span>People at risk now</span><span className="font-mono">{fmtPop(row.people_at_risk)}</span></div>
                                    <div className="flex justify-between"><span>People at risk 2050</span><span className="font-mono">{fmtPop(row.people_at_risk_2050)}</span></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-border/60 flex justify-end">
                              <Link
                                href={`/report/${encodeURIComponent(row.district)}`}
                                className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Full district report →
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted-foreground">
              <span>
                Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, filtered.length)} of {filtered.length} districts
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1 rounded border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 7) p = i + 1;
                  else if (page <= 4) p = i + 1;
                  else if (page >= totalPages - 3) p = totalPages - 6 + i;
                  else p = page - 3 + i;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`px-2.5 py-1 rounded border transition-colors ${
                        p === page
                          ? "bg-blue-500/20 border-blue-400 text-blue-400"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 rounded border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="rounded-lg border border-border bg-card/50 p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Gap legend</h3>
          <div className="flex flex-wrap gap-3">
            {ALL_GAPS.map(g => (
              <div key={g} className="flex items-center gap-1.5 text-xs">
                <span className={`px-2 py-0.5 rounded border ${GAP_META[g].color}`}>
                  {GAP_META[g].icon}
                </span>
                <span className="text-muted-foreground">{GAP_META[g].label}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Gap score = risk × (1 + 0.15 × gap count). Thresholds: JJM &lt;60%, twin-pit &lt;30% (flood districts), MHM &lt;55%, clean fuel &lt;35%, child marriage &gt;30%, antenatal &lt;50%, ORS &lt;50%.
          </p>
        </div>
      </div>
    </div>
  );
}
