import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

const RISK_COLORS = ["#22c55e", "#eab308", "#f97316", "#ef4444", "#991b1b"];
function riskBg(v: number, max = 10) {
  const t = Math.min(1, v / max);
  const i = Math.min(4, Math.floor(t * 5));
  return RISK_COLORS[i];
}

export default function StateSummaryPage() {
  const [sortKey, setSortKey] = useState("avg_risk");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const hexQ = useQuery<any[]>({
    queryKey: ["india-hex-props-raw"],
    queryFn: () => fetch("/data/india_hex_props.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const stateData = useMemo(() => {
    if (!hexQ.data) return [];
    const byState: Record<string, any[]> = {};
    for (const p of hexQ.data) {
      const s = p.state || "Unknown";
      if (!byState[s]) byState[s] = [];
      byState[s].push(p);
    }

    return Object.entries(byState).map(([state, hexes]) => {
      const n = hexes.length;
      const pop = hexes.reduce((s, p) => s + (p.population || 0), 0);
      const children = hexes.reduce((s, p) => s + (p.pop_children_under_5 || 0), 0);
      const elderly = hexes.reduce((s, p) => s + (p.pop_elderly_60plus || 0), 0);
      const avgRisk = hexes.reduce((s, p) => s + (p.hex_risk || 0), 0) / n;
      const maxRisk = Math.max(...hexes.map((p) => p.hex_risk || 0));
      const cascades = hexes.filter((p) => (p.cascade_count || 0) > 0).length;
      const haz5 = hexes.filter((p) => (p.hazard_count_5 || 0) >= 1).length;
      const avgSanit = hexes.reduce((s, p) => s + (p.wash_sanitation_pct || 0), 0) / n;
      const avgWater = hexes.reduce((s, p) => s + (p.wash_water_pct || 0), 0) / n;
      const avgStunting = hexes.reduce((s, p) => s + (p.wash_stunting_pct || 0), 0) / n;
      const avgAC = hexes.reduce((s, p) => s + (p.adaptive_capacity || 0), 0) / n;

      // Top hazard
      const hazardKeys = ["flood_risk", "heat_risk", "cyclone_risk", "drought_risk", "wetbulb_risk", "landslide_risk", "coldwave_risk"];
      const hazSums = hazardKeys.map((k) => ({ k, s: hexes.reduce((s, p) => s + (p[k] || 0), 0) }));
      const topHazard = hazSums.sort((a, b) => b.s - a.s)[0]?.k?.replace("_risk", "") || "";

      return {
        state, hexes: n, pop, children, elderly, avg_risk: avgRisk, max_risk: maxRisk,
        cascades, haz5, sanitation: avgSanit, water: avgWater, stunting: avgStunting,
        ac: avgAC, top_hazard: topHazard,
      };
    });
  }, [hexQ.data]);

  const sorted = useMemo(() => {
    return [...stateData].sort((a, b) => {
      const av = (a as any)[sortKey] ?? 0;
      const bv = (b as any)[sortKey] ?? 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [stateData, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : `${n}`;
  const pct = (n: number) => `${n.toFixed(0)}%`;

  const SortHeader = ({ k, label, w }: { k: string; label: string; w: string }) => (
    <th className={`${w} px-2 py-2 text-left cursor-pointer hover:text-foreground transition-colors ${sortKey === k ? "text-emerald-400" : ""}`}
      onClick={() => toggleSort(k)}>
      {label} {sortKey === k ? (sortDir === "desc" ? "↓" : "↑") : ""}
    </th>
  );

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <header className="h-10 px-4 border-b border-border/40 flex items-center gap-3 shrink-0">
        <Link href="/"><Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2"><ArrowLeft className="h-3 w-3" />Home</Button></Link>
        <div className="h-3 w-px bg-border/50" />
        <span className="text-sm font-semibold">State Summary</span>
        <span className="text-[10px] text-muted-foreground">{stateData.length} states · {hexQ.data?.length.toLocaleString() || 0} hexes</span>
        <div className="flex-1" />
        <Link href="/grid" className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold">← Hex Grid</Link>
        <ThemeToggle />
      </header>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-background border-b border-border/40 text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2 text-center">#</th>
              <SortHeader k="state" label="State" w="w-40" />
              <SortHeader k="pop" label="Population" w="w-20" />
              <SortHeader k="children" label="Children <5" w="w-20" />
              <SortHeader k="avg_risk" label="Avg Risk" w="w-16" />
              <SortHeader k="max_risk" label="Max Risk" w="w-16" />
              <SortHeader k="haz5" label="Haz≥5" w="w-14" />
              <SortHeader k="cascades" label="Cascades" w="w-14" />
              <SortHeader k="sanitation" label="Sanit%" w="w-14" />
              <SortHeader k="water" label="Water%" w="w-14" />
              <SortHeader k="stunting" label="Stunt%" w="w-14" />
              <SortHeader k="ac" label="AC" w="w-14" />
              <th className="w-20 px-2 py-2">Top Hazard</th>
              <th className="w-16 px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => (
              <tr key={s.state} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-2 py-1.5 text-center text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-1.5 font-semibold">{s.state}</td>
                <td className="px-2 py-1.5 font-mono">{fmt(s.pop)}</td>
                <td className="px-2 py-1.5 font-mono">{fmt(s.children)}</td>
                <td className="px-2 py-1.5 font-mono font-bold" style={{ color: riskBg(s.avg_risk) }}>{s.avg_risk.toFixed(1)}</td>
                <td className="px-2 py-1.5 font-mono" style={{ color: riskBg(s.max_risk) }}>{s.max_risk.toFixed(1)}</td>
                <td className="px-2 py-1.5 font-mono">{s.haz5}</td>
                <td className="px-2 py-1.5 font-mono text-red-400">{s.cascades || "—"}</td>
                <td className="px-2 py-1.5 font-mono" style={{ color: s.sanitation < 60 ? "#ef4444" : s.sanitation < 80 ? "#eab308" : "#22c55e" }}>{pct(s.sanitation)}</td>
                <td className="px-2 py-1.5 font-mono">{pct(s.water)}</td>
                <td className="px-2 py-1.5 font-mono" style={{ color: s.stunting > 35 ? "#ef4444" : s.stunting > 25 ? "#eab308" : "#22c55e" }}>{pct(s.stunting)}</td>
                <td className="px-2 py-1.5 font-mono">{s.ac.toFixed(2)}</td>
                <td className="px-2 py-1.5 capitalize">{s.top_hazard}</td>
                <td className="px-2 py-1.5">
                  <Link href={`/grid?state=${encodeURIComponent(s.state)}`}
                    className="text-emerald-400 hover:text-emerald-300 font-semibold">Grid →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
