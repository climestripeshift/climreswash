import { useState, useMemo } from "react";
import { Link, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer, ChevronDown, ChevronRight, AlertTriangle, TrendingUp, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SHOW_FUTURE_2050 } from "@/lib/featureFlags";

// ── Types ───────────────────────────────────────────────────────────────────

interface RankEntry {
  district: string; state: string; census_code: string;
  risk_score: number; rank: number;
  dominant_hazard: string; dominant_hazard_icon: string; dominant_hazard_score: number;
  population_at_risk: number; children_under5_at_risk: number; elderly_at_risk: number;
  explanation: string; recommendation: string;
  adaptive_capacity: number; wash_sanitation_pct: number; wash_disruption_days: number;
  recommendations: Record<string, { measures: string[]; schemes: string[] }>;
}

interface GapEntry {
  district: string; state: string; census_code: string;
  present_risk: number;
  future_risk_ssp585_2050: number; future_risk_ssp585_2030: number;
  risk_escalation: number; capacity_gap: number;
  present_dominant_hazard: string; future_dominant_hazard: string; hazard_shifted: boolean;
  people_at_risk_present: number; people_at_risk_2050: number; children_u5_at_risk_2050: number;
  gap_explanation: string; priority_tier: string;
}

const HAZARD_ICON: Record<string, string> = {
  flood: "🌊", heat: "🔥", drought: "🏜️", wetbulb: "💧", cyclone: "🌀",
  landslide: "⛰️", "cold wave": "❄️", "wet-bulb heat": "🌡️",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => n >= 1e7 ? `${(n/1e7).toFixed(1)}Cr` : n >= 1e5 ? `${(n/1e5).toFixed(1)}L` : n >= 1e3 ? `${(n/1e3).toFixed(0)}K` : `${n}`;

const HAZARD_LABEL: Record<string, string> = {
  flood: "Flood", heat: "Heatwave", drought: "Drought", wetbulb: "Wet-Bulb",
  cyclone: "Cyclone", landslide: "Landslide", coldwave: "Cold Wave",
  flashflood: "Flash Flood", sealevel: "Sea Level", fire: "Fire", pollution: "Air Pollution",
};

const INST_META: Record<string, { icon: string; label: string; color: string }> = {
  school:    { icon: "🏫", label: "Schools",    color: "border-blue-500/40 bg-blue-500/5" },
  anganwadi: { icon: "🌸", label: "Anganwadis", color: "border-pink-500/40 bg-pink-500/5" },
  household: { icon: "🏠", label: "Households", color: "border-amber-500/40 bg-amber-500/5" },
};

function classifyDistrict(rank: RankEntry, gap: GapEntry | undefined): "act-now" | "pre-empt" | "stable" {
  const present = rank.risk_score;
  if (!SHOW_FUTURE_2050) return present >= 5 ? "act-now" : "stable";
  const future = gap?.future_risk_ssp585_2050 ?? 0;
  const escalation = gap?.risk_escalation ?? 0;
  if (present >= 5) return "act-now";
  if (future >= 5 || escalation >= 1.5) return "pre-empt";
  return "stable";
}

const CLASS_META = {
  "act-now":  { label: "Act Now",  color: "bg-red-500/15 text-red-400 border-red-500/30",     icon: "🔴" },
  "pre-empt": { label: "Pre-empt", color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: "🟡" },
  "stable":   { label: "Stable",   color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: "🟢" },
};

const TREND_COLOR = (esc: number) =>
  esc >= 2 ? "text-red-400" : esc >= 0.5 ? "text-amber-400" : esc <= -1 ? "text-emerald-400" : "text-muted-foreground";

// ── District Action Row ──────────────────────────────────────────────────────

function DistrictRow({ rank, gap, idx }: { rank: RankEntry; gap: GapEntry | undefined; idx: number }) {
  const [open, setOpen] = useState(false);
  const cls = classifyDistrict(rank, gap);
  const cm = CLASS_META[cls];
  const topMeasure = rank.recommendations?.school?.measures?.[0] ?? rank.recommendation ?? "—";
  const topScheme  = rank.recommendations?.school?.schemes?.[0] ?? "—";
  const future585  = SHOW_FUTURE_2050 ? (gap?.future_risk_ssp585_2050 ?? null) : null;
  const esc        = SHOW_FUTURE_2050 ? (gap?.risk_escalation ?? null) : null;
  const hazardShifted = SHOW_FUTURE_2050 && gap?.hazard_shifted === true;
  const futureHazardIcon = hazardShifted ? (HAZARD_ICON[gap!.future_dominant_hazard] ?? "⚠️") : null;

  return (
    <>
      <tr
        className="border-b border-border/20 hover:bg-muted/20 cursor-pointer text-xs"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="py-2 px-2 text-muted-foreground w-8">{idx + 1}</td>
        <td className="py-2 px-2">
          <div className="font-medium flex items-center gap-1">
            {rank.district}
            {hazardShifted && (
              <span title={`Hazard shifts to ${gap!.future_dominant_hazard} by 2050`} className="text-[8px] px-1 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/30 leading-none">
                {futureHazardIcon} shift
              </span>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground">{rank.dominant_hazard_icon} {HAZARD_LABEL[rank.dominant_hazard] ?? rank.dominant_hazard}</div>
        </td>
        <td className="py-2 px-2 text-right tabular-nums">
          <span className={`font-bold ${rank.risk_score >= 7 ? "text-red-400" : rank.risk_score >= 5 ? "text-orange-400" : rank.risk_score >= 3 ? "text-amber-400" : "text-emerald-400"}`}>
            {rank.risk_score.toFixed(1)}
          </span>
        </td>
        {SHOW_FUTURE_2050 && (
          <td className="py-2 px-2 text-right tabular-nums">
            {future585 != null
              ? <span className={future585 >= 5 ? "text-red-400 font-medium" : "text-muted-foreground"}>{future585.toFixed(1)}</span>
              : <span className="text-muted-foreground">—</span>}
          </td>
        )}
        {SHOW_FUTURE_2050 && (
          <td className="py-2 px-2 text-right tabular-nums">
            {esc != null
              ? <span className={TREND_COLOR(esc)}>{esc >= 0 ? "+" : ""}{esc.toFixed(1)}</span>
              : <span className="text-muted-foreground">—</span>}
          </td>
        )}
        <td className="py-2 px-2 text-right">{fmt(rank.population_at_risk)}</td>
        <td className="py-2 px-2 text-right">{fmt(rank.children_under5_at_risk)}</td>
        <td className="py-2 px-2">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${cm.color}`}>{cm.icon} {cm.label}</span>
        </td>
        <td className="py-2 px-2 max-w-[180px]">
          <div className="truncate text-[10px]">{topMeasure}</div>
          <div className="text-[9px] text-muted-foreground truncate">{topScheme}</div>
        </td>
        <td className="py-2 px-2 text-muted-foreground">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border/20 bg-muted/10">
          <td colSpan={SHOW_FUTURE_2050 ? 10 : 8} className="px-4 py-3">
            <DistrictDetail rank={rank} gap={gap} cls={cls} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── District Detail (expanded row + standalone view) ────────────────────────

function DistrictDetail({ rank, gap, cls }: { rank: RankEntry; gap: GapEntry | undefined; cls: "act-now" | "pre-empt" | "stable" }) {
  const cm = CLASS_META[cls];
  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex flex-wrap gap-4 text-xs">
        <div><span className="text-muted-foreground">Present risk:</span> <b>{rank.risk_score.toFixed(1)}/10</b></div>
        {SHOW_FUTURE_2050 && <div><span className="text-muted-foreground">2050 (SSP5-8.5):</span> <b>{gap?.future_risk_ssp585_2050?.toFixed(1) ?? "—"}</b></div>}
        {SHOW_FUTURE_2050 && <div><span className="text-muted-foreground">Escalation:</span> <b className={TREND_COLOR(gap?.risk_escalation ?? 0)}>{gap?.risk_escalation != null ? `${gap.risk_escalation >= 0 ? "+" : ""}${gap.risk_escalation.toFixed(1)}` : "—"}</b></div>}
        <div><span className="text-muted-foreground">People at risk:</span> <b>{fmt(rank.population_at_risk)}</b></div>
        <div><span className="text-muted-foreground">Children &lt;5:</span> <b>{fmt(rank.children_under5_at_risk)}</b></div>
        <div><span className="text-muted-foreground">Adaptive capacity:</span> <b>{(rank.adaptive_capacity * 100).toFixed(0)}%</b></div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cm.color}`}>{cm.icon} {cm.label}</span>
      </div>
      {gap?.gap_explanation && <p className="text-[10px] text-muted-foreground italic">{gap.gap_explanation}</p>}
      {SHOW_FUTURE_2050 && gap?.hazard_shifted && (
        <p className="text-[10px] text-violet-400 font-medium">
          ⚠️ Dominant hazard shifts from <b>{gap.present_dominant_hazard}</b> → <b>{gap.future_dominant_hazard}</b> by 2050 — investment strategy should account for this transition.
        </p>
      )}

      {/* Institution actions */}
      <div className="grid grid-cols-3 gap-3">
        {(["school", "anganwadi", "household"] as const).map((inst) => {
          const rec = rank.recommendations?.[inst];
          if (!rec) return null;
          const m = INST_META[inst];
          return (
            <div key={inst} className={`border rounded-lg p-2.5 ${m.color}`}>
              <div className="text-xs font-semibold mb-1.5">{m.icon} {m.label}</div>
              <ul className="space-y-1">
                {rec.measures.slice(0, 3).map((measure, i) => (
                  <li key={i} className="text-[10px] flex gap-1">
                    <span className="text-muted-foreground mt-0.5 shrink-0">•</span>
                    <span>{measure}</span>
                  </li>
                ))}
              </ul>
              {rec.schemes.length > 0 && (
                <div className="mt-2 pt-1.5 border-t border-border/30">
                  {rec.schemes.map((s, i) => (
                    <div key={i} className="text-[9px] text-muted-foreground">💰 {s}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Link href={`/report/${encodeURIComponent(rank.district)}`}>
          <Button variant="outline" size="sm" className="text-[10px] h-6 px-2 gap-1">
            📋 Full District Report
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ActionPlanPage() {
  const rankQ = useQuery<RankEntry[]>({
    queryKey: ["district-rankings"],
    queryFn: () => fetch("/data/district_rankings.json").then((r) => r.json()),
    staleTime: Infinity,
  });
  const gapQ = useQuery<GapEntry[]>({
    queryKey: ["gap-rankings"],
    queryFn: () => fetch("/data/gap_rankings.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const searchString = useSearch();
  const urlState = new URLSearchParams(searchString).get("state") ?? "Bihar";
  const [selectedState, setSelectedState] = useState(urlState);
  const [sortBy, setSortBy]               = useState<"present" | "future" | "escalation" | "children">("present");
  const [filterCls, setFilterCls]         = useState<"all" | "act-now" | "pre-empt" | "stable">("all");
  const [expandedDistrict, setExpandedDistrict] = useState<string | null>(null);

  const states = useMemo(() => {
    if (!rankQ.data) return [];
    const all = rankQ.data.map((d) => d.state);
    return all.filter((s, i) => all.indexOf(s) === i).sort();
  }, [rankQ.data]);

  const gapByDistrict = useMemo(() => {
    const m: Record<string, GapEntry> = {};
    for (const g of gapQ.data ?? []) m[g.district] = g;
    return m;
  }, [gapQ.data]);

  const stateDistricts = useMemo(() => {
    if (!rankQ.data) return [];
    return rankQ.data.filter((d) => d.state === selectedState);
  }, [rankQ.data, selectedState]);

  const classified = useMemo(() => {
    return stateDistricts.map((r) => ({
      rank: r,
      gap: gapByDistrict[r.district],
      cls: classifyDistrict(r, gapByDistrict[r.district]),
    }));
  }, [stateDistricts, gapByDistrict]);

  const sorted = useMemo(() => {
    const filtered = filterCls === "all" ? classified : classified.filter((d) => d.cls === filterCls);
    return [...filtered].sort((a, b) => {
      if (sortBy === "present")    return b.rank.risk_score - a.rank.risk_score;
      if (sortBy === "future")     return (b.gap?.future_risk_ssp585_2050 ?? 0) - (a.gap?.future_risk_ssp585_2050 ?? 0);
      if (sortBy === "escalation") return (b.gap?.risk_escalation ?? 0) - (a.gap?.risk_escalation ?? 0);
      if (sortBy === "children")   return (b.rank.risk_score * b.rank.children_under5_at_risk) - (a.rank.risk_score * a.rank.children_under5_at_risk);
      return 0;
    });
  }, [classified, sortBy, filterCls]);

  // State summary stats
  const summary = useMemo(() => {
    const actNow  = classified.filter((d) => d.cls === "act-now");
    const preEmpt = classified.filter((d) => d.cls === "pre-empt");
    const totalPop = classified.reduce((s, d) => s + (d.rank.population_at_risk ?? 0), 0);
    const totalChildren = classified.reduce((s, d) => s + (d.rank.children_under5_at_risk ?? 0), 0);
    const top = classified.slice().sort((a, b) => b.rank.risk_score - a.rank.risk_score)[0];
    return { actNow: actNow.length, preEmpt: preEmpt.length, totalPop, totalChildren, top };
  }, [classified]);

  if (rankQ.isLoading || gapQ.isLoading)
    return <div className="p-8 text-center text-muted-foreground">Loading action data…</div>;

  return (
    <div className="min-h-screen bg-background text-foreground print:bg-white print:text-black">
      {/* Header */}
      <header className="h-10 px-4 border-b border-border/40 flex items-center gap-3 sticky top-0 bg-background/95 backdrop-blur z-50 print:hidden">
        <Link href="/"><Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2"><ArrowLeft className="h-3 w-3" />Home</Button></Link>
        <div className="h-3 w-px bg-border/50" />
        <span className="text-sm font-semibold">Administrator Action Plan</span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => window.print()}>
          <Printer className="h-3 w-3" /> Print / PDF
        </Button>
        <ThemeToggle />
      </header>

      <div className="max-w-7xl mx-auto px-4 py-5 print:px-0">

        {/* State selector + filter controls */}
        <div className="flex flex-wrap items-center gap-3 mb-5 print:hidden">
          <div>
            <label className="text-xs text-muted-foreground mr-1">State</label>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="text-xs border border-border/40 rounded px-2 py-1 bg-background"
            >
              {states.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mr-1">Sort by</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs border border-border/40 rounded px-2 py-1 bg-background"
            >
              <option value="present">Present risk ↓</option>
              {SHOW_FUTURE_2050 && <option value="future">2050 risk ↓ (pre-empt view)</option>}
              {SHOW_FUTURE_2050 && <option value="escalation">Escalation ↓</option>}
              <option value="children">Child impact ↓ (UNICEF lens)</option>
            </select>
          </div>
          <div className="flex gap-1">
            {(SHOW_FUTURE_2050
              ? (["all", "act-now", "pre-empt", "stable"] as const)
              : (["all", "act-now"] as const)
            ).map((f) => (
              <button
                key={f}
                onClick={() => setFilterCls(f)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${filterCls === f ? "bg-primary text-primary-foreground border-primary" : "border-border/40 text-muted-foreground hover:border-primary/50"}`}
              >
                {f === "all" ? "All" : CLASS_META[f].icon + " " + CLASS_META[f].label}
              </button>
            ))}
          </div>
        </div>

        {/* State summary header */}
        <div className="rounded-lg border border-border/40 bg-muted/20 p-4 mb-5">
          <h1 className="text-base font-bold mb-1">{selectedState} — Administrative Action Summary</h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3">
            <div className="border-2 border-red-500/40 rounded p-2 text-center bg-red-500/5">
              <div className="text-2xl font-black text-red-400">{fmt(summary.totalChildren)}</div>
              <div className="text-[10px] text-muted-foreground font-semibold">Children under 5 at risk</div>
            </div>
            <div className="border rounded p-2 text-center">
              <div className="text-lg font-black">{fmt(summary.totalPop)}</div>
              <div className="text-[10px] text-muted-foreground">People at risk</div>
            </div>
            <div className="border rounded p-2 text-center">
              <div className="text-lg font-black text-red-400">{summary.actNow}</div>
              <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><AlertTriangle className="h-3 w-3" />High-risk districts</div>
            </div>
            {SHOW_FUTURE_2050 && (
              <div className="border rounded p-2 text-center">
                <div className="text-lg font-black text-amber-400">{summary.preEmpt}</div>
                <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><TrendingUp className="h-3 w-3" />Pre-empt by 2050</div>
              </div>
            )}
          </div>
          {summary.top && (
            <p className="text-xs text-muted-foreground mt-3">
              Highest priority: <b className="text-foreground">{summary.top.rank.district}</b> — {summary.top.rank.dominant_hazard_icon} {HAZARD_LABEL[summary.top.rank.dominant_hazard] ?? summary.top.rank.dominant_hazard} risk {summary.top.rank.risk_score.toFixed(1)}/10, {fmt(summary.top.rank.population_at_risk)} people at risk.
            </p>
          )}
        </div>

        {/* District action table */}
        <div className="rounded-lg border border-border/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30 text-muted-foreground">
                  <th className="py-2 px-2 text-left w-8">#</th>
                  <th className="py-2 px-2 text-left">District / Hazard</th>
                  <th className="py-2 px-2 text-right cursor-pointer hover:text-foreground" onClick={() => setSortBy("present")}>
                    Present {sortBy === "present" && "↓"}
                  </th>
                  {SHOW_FUTURE_2050 && (
                    <th className="py-2 px-2 text-right cursor-pointer hover:text-foreground" onClick={() => setSortBy("future")}>
                      2050 SSP5 {sortBy === "future" && "↓"}
                    </th>
                  )}
                  {SHOW_FUTURE_2050 && (
                    <th className="py-2 px-2 text-right cursor-pointer hover:text-foreground" onClick={() => setSortBy("escalation")}>
                      Δ {sortBy === "escalation" && "↓"}
                    </th>
                  )}
                  <th className="py-2 px-2 text-right">People at risk</th>
                  <th className="py-2 px-2 text-right">Children &lt;5</th>
                  <th className="py-2 px-2">Status</th>
                  <th className="py-2 px-2">Top action / Scheme</th>
                  <th className="py-2 px-2 w-5"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ rank, gap, cls }, i) => (
                  <DistrictRow key={rank.district} rank={rank} gap={gap} idx={i} />
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={10} className="py-8 text-center text-muted-foreground text-sm">No districts match the current filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Print legend */}
        <div className="mt-4 text-[10px] text-muted-foreground print:block hidden">
          {SHOW_FUTURE_2050
            ? <>🔴 Act Now: present risk ≥ 5 · 🟡 Pre-empt: projected to reach risk ≥ 5 by 2050 (SSP5-8.5) · 🟢 Stable: low present and projected risk.<br/>
               ⚠️ shift = dominant hazard changes by 2050 — investment strategy must account for the transition.<br/></>
            : <>🔴 High-risk districts: present risk ≥ 5 · 🟢 Monitor: present risk &lt; 5.<br/></>
          }
          Risk per ClimResWASH methodology, validated against observed health outcomes (heat–anaemia r=0.41, NFHS-5) and 5 historical disaster events. See methodology report at /methodology.<br/>
          Data: NFHS-5 (WASH), ERA5/CHIRPS (climate), WorldPop (population) · Generated {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
        </div>
        <div className="mt-4 text-[10px] text-muted-foreground print:hidden">
          Click any row to expand district action details. Sort by "Child impact" for the UNICEF lens (risk × children-under-5 weighting).
          {SHOW_FUTURE_2050 && " Violet \"shift\" badge = dominant hazard changes by 2050."}
        </div>
      </div>
    </div>
  );
}
