import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SHOW_FUTURE_2050 } from "@/lib/featureFlags";

interface GapEntry {
  rank: number; district: string; state: string;
  present_risk: number; future_risk_ssp585_2050: number;
  future_risk_ssp245_2050: number; future_risk_ssp585_2030: number; future_risk_ssp245_2030: number;
  risk_escalation: number; capacity_gap: number; present_ac: number;
  priority_tier: string; present_dominant_hazard: string;
  people_at_risk_present: number; people_at_risk_2050: number;
  children_u5_at_risk_2050: number; gap_explanation: string;
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30" },
  high:     { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30" },
  moderate: { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/30" },
  low:      { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30" },
};

const fmt = (n: number) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(0)}K` : `${n}`;

export default function GapAnalysisPage() {
  const [scenario, setScenario] = useState("ssp585");
  const [horizon, setHorizon]   = useState("2050");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showAll, setShowAll]   = useState(false);

  const gapQ = useQuery<GapEntry[]>({
    queryKey: ["gap-rankings"],
    queryFn: () => fetch("/data/gap_rankings.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const data = gapQ.data ?? [];

  const headlines = useMemo(() => {
    if (!data.length) return null;
    const critical = data.filter((d) => d.priority_tier === "critical").length;
    const high = data.filter((d) => d.priority_tier === "high").length;
    const addlPeople = data.reduce((s, d) => s + Math.max(0, d.people_at_risk_2050 - d.people_at_risk_present), 0);
    return { critical, high, addlPeople };
  }, [data]);

  const sorted = useMemo(() => {
    return showAll ? data : data.slice(0, 30);
  }, [data, showAll]);

  const futureKey = `future_risk_${scenario}_${horizon}` as keyof GapEntry;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Preliminary banner */}
      {!SHOW_FUTURE_2050 && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center gap-2 text-xs text-amber-400 shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span><b>Preliminary projections — not for planning use.</b> The 2050 future layer is under revision (CMIP6 pipeline recalibration in progress). Present-day risk data is validated. See <Link href="/methodology" className="underline">methodology report</Link>.</span>
        </div>
      )}
      {/* Header */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur z-50 shrink-0">
        <div className="h-12 px-4 flex items-center gap-3">
          <Link href="/"><Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2"><ArrowLeft className="h-3 w-3" />Home</Button></Link>
          <div className="h-3 w-px bg-border/50" />
          <TrendingUp className="h-4 w-4 text-red-400" />
          <span className="text-sm font-semibold">Gap Analysis — Bridge the Gap</span>
          <div className="h-3 w-px bg-border/50" />

          {/* Scenario selector */}
          <div className="flex items-center gap-1">
            {[["ssp245", "SSP2-4.5"], ["ssp585", "SSP5-8.5"]].map(([k, l]) => (
              <button key={k} onClick={() => setScenario(k)}
                className={`px-2 py-1 rounded text-[10px] font-semibold ${scenario === k ? "bg-red-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {["2030", "2050"].map((h) => (
              <button key={h} onClick={() => setHorizon(h)}
                className={`px-2 py-1 rounded text-[10px] font-semibold ${horizon === h ? "bg-red-600 text-white" : "bg-muted/60 text-muted-foreground"}`}>
                {h}
              </button>
            ))}
          </div>

          <div className="flex-1" />
          <Link href="/grid" className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold">← Hex Grid</Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Headlines */}
      {headlines && (
        <div className="px-4 py-3 border-b border-border/30 flex items-center gap-6 bg-red-500/5">
          <div className="text-center">
            <div className="text-2xl font-black text-red-400">{headlines.critical}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Critical gap</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-orange-400">{headlines.high}</div>
            <div className="text-[9px] text-muted-foreground uppercase">High priority</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-foreground">{fmt(headlines.addlPeople)}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Additional people at risk by 2050</div>
          </div>
          <div className="flex-1" />
          <div className="text-[10px] text-muted-foreground max-w-xs">
            Where will future climate stress exceed today's coping capacity? Districts ranked by capacity gap — the "invest here now" list.
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-background border-b border-border/40 text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2 text-center">#</th>
              <th className="px-2 py-2 text-left w-40">District</th>
              <th className="px-2 py-2 text-left w-32">State</th>
              <th className="px-2 py-2 text-center w-14">Now</th>
              <th className="px-2 py-2 text-center w-4">→</th>
              <th className="px-2 py-2 text-center w-14">{horizon}</th>
              <th className="px-2 py-2 text-center w-14">Gap</th>
              <th className="px-2 py-2 text-center w-12">AC</th>
              <th className="px-2 py-2 text-center w-16">Tier</th>
              <th className="px-2 py-2 text-center w-16">Hazard</th>
              <th className="px-2 py-2 text-right w-20">People 2050</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const tier = TIER_COLORS[r.priority_tier] || TIER_COLORS.low;
              const futRisk = (r as any)[futureKey] ?? r.future_risk_ssp585_2050;
              const esc = futRisk - r.present_risk;
              return (
                <tr key={r.district + r.state} className="border-b border-border/20 hover:bg-muted/20 cursor-pointer"
                  onClick={() => setExpanded(expanded === i ? null : i)}>
                  <td className="px-2 py-2 text-center text-muted-foreground">{r.rank}</td>
                  <td className="px-2 py-2 font-semibold">{r.district}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.state}</td>
                  <td className="px-2 py-2 text-center font-mono">{r.present_risk.toFixed(1)}</td>
                  <td className="px-2 py-2 text-center">{esc > 0.3 ? "↗️" : esc < -0.3 ? "↘️" : "→"}</td>
                  <td className="px-2 py-2 text-center font-mono font-bold" style={{ color: futRisk >= 5 ? "#ef4444" : futRisk >= 3 ? "#f59e0b" : "#22c55e" }}>
                    {futRisk.toFixed(1)}
                  </td>
                  <td className="px-2 py-2 text-center font-mono font-bold text-red-400">{r.capacity_gap.toFixed(1)}</td>
                  <td className="px-2 py-2 text-center font-mono">{r.present_ac.toFixed(2)}</td>
                  <td className="px-2 py-2 text-center">
                    <Badge variant="outline" className={`text-[8px] h-4 ${tier.text} ${tier.border} ${tier.bg}`}>
                      {r.priority_tier}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-center capitalize text-[10px]">{r.present_dominant_hazard}</td>
                  <td className="px-2 py-2 text-right font-mono">{fmt(r.people_at_risk_2050)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!showAll && data.length > 30 && (
          <div className="text-center py-3">
            <button onClick={() => setShowAll(true)} className="text-xs text-muted-foreground hover:text-foreground">
              Show all {data.length} districts
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
