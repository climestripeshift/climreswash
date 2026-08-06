import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Save, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  type UnitCosts, DEFAULT_UNIT_COSTS, loadUnitCosts, saveUnitCosts, resetUnitCosts,
  estimateFundingRequired, formatINR,
} from "@/lib/csrCostAssumptions";

// Classroom repair is deliberately NOT in this list -- it has real per-district cost data
// (see the read-only card below), so there's nothing to manually inject for it.
const FIELDS: { key: Exclude<keyof UnitCosts, "classroomRepair">; label: string; icon: string; hint: string }[] = [
  { key: "toilet", label: "Toilet construction", icon: "🚽", hint: "per toilet, from toilet_required_count" },
  { key: "dilapidatedBuilding", label: "Dilapidated building reconstruction", icon: "🏚️", hint: "per school flagged dilapidated" },
  { key: "newClassroom", label: "New classroom construction", icon: "🏗️", hint: "per new classroom required" },
];

interface DistrictSummary {
  by_district: Record<string, {
    toilet_required_count: number; classroom_repair_needed_count: number;
    classroom_repair_actual_cost_rs: number;
    building_dilapidated_count: number; new_classroom_requirement_count: number;
  }>;
}

export default function CSRCostAssumptionsPage() {
  const [costs, setCosts] = useState<UnitCosts>(DEFAULT_UNIT_COSTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setCosts(loadUnitCosts()); }, []);

  const summaryQ = useQuery<DistrictSummary>({
    queryKey: ["csr-district-summary"],
    queryFn: () => fetch("/data/csr_district_summary_rajasthan.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const statewideNeed = useMemo(() => {
    const totals = { toilet_required_count: 0, classroom_repair_needed_count: 0, classroom_repair_actual_cost_rs: 0, building_dilapidated_count: 0, new_classroom_requirement_count: 0 };
    if (!summaryQ.data) return totals;
    for (const v of Object.values(summaryQ.data.by_district)) {
      totals.toilet_required_count += v.toilet_required_count;
      totals.classroom_repair_needed_count += v.classroom_repair_needed_count;
      totals.classroom_repair_actual_cost_rs += v.classroom_repair_actual_cost_rs;
      totals.building_dilapidated_count += v.building_dilapidated_count;
      totals.new_classroom_requirement_count += v.new_classroom_requirement_count;
    }
    return totals;
  }, [summaryQ.data]);

  const totalEstimate = useMemo(() => estimateFundingRequired(statewideNeed, costs), [statewideNeed, costs]);
  const byCategory = FIELDS.map((f) => {
    const countKey = { toilet: "toilet_required_count", dilapidatedBuilding: "building_dilapidated_count",
      newClassroom: "new_classroom_requirement_count" }[f.key] as keyof typeof statewideNeed;
    const count = statewideNeed[countKey];
    return { ...f, count, subtotal: count * costs[f.key] };
  });

  const handleSave = () => {
    saveUnitCosts(costs);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  const handleReset = () => {
    resetUnitCosts();
    setCosts(DEFAULT_UNIT_COSTS);
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <header className="h-10 px-3 border-b border-border/40 flex items-center gap-3 bg-background/95 backdrop-blur z-50 shrink-0">
        <Link href="/csr-rajasthan"><Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2"><ArrowLeft className="h-3 w-3" />Back to CSR map</Button></Link>
        <div className="h-3 w-px bg-border/50" />
        <span className="text-xs font-semibold">Unit Cost Assumptions</span>
        <div className="flex-1" />
        <ThemeToggle />
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="px-4 py-2.5 rounded-lg border border-border/30 bg-amber-500/5 text-[11px] text-muted-foreground leading-relaxed">
            ⚠️ Toilet, dilapidated-building, and new-classroom costs below are planning-level
            estimates you set yourself — not sourced from any official schedule of rates. Saved to
            this browser only (not shared with other visitors or synced anywhere). Editing here
            never re-fetches the CSR map's data.
          </div>

          <div className="border border-border/40 rounded-lg overflow-hidden">
            <div className="p-3 border-b border-border/30 bg-muted/20 text-xs font-semibold">Cost per unit (₹) — manual estimate</div>
            <div className="divide-y divide-border/20">
              {FIELDS.map((f) => (
                <div key={f.key} className="p-3 flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-xs font-medium">{f.icon} {f.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{f.hint}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">₹</span>
                    <input
                      type="number" min={0} step={1000}
                      value={costs[f.key]}
                      onChange={(e) => setCosts((c) => ({ ...c, [f.key]: Math.max(0, Number(e.target.value) || 0) }))}
                      className="w-32 px-2 py-1.5 rounded-md border border-border/50 bg-background text-xs text-right outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-border/30 bg-muted/20 flex items-center gap-2">
              <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleSave}>
                {saved ? <><Check className="h-3 w-3" />Saved</> : <><Save className="h-3 w-3" />Save</>}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 text-muted-foreground" onClick={handleReset}>
                <RotateCcw className="h-3 w-3" />Reset to defaults
              </Button>
            </div>
          </div>

          <div className="border border-emerald-500/30 rounded-lg overflow-hidden">
            <div className="p-3 border-b border-emerald-500/20 bg-emerald-500/5">
              <div className="text-xs font-semibold text-emerald-400">🛠️ Classroom major repair — real cost data, not editable</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Summed from the ACR classroom-repair sheet's own per-school "amount required for major repair"
                figure — {statewideNeed.classroom_repair_needed_count.toLocaleString()} classrooms flagged,
                actual cost below rather than a count × flat estimate.
              </div>
            </div>
            <div className="px-3 py-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Statewide total (real data)</span>
              <span className="text-sm font-bold text-emerald-400 tabular-nums">{formatINR(statewideNeed.classroom_repair_actual_cost_rs)}</span>
            </div>
          </div>

          <div className="border border-border/40 rounded-lg overflow-hidden">
            <div className="p-3 border-b border-border/30 bg-muted/20">
              <div className="text-xs font-semibold">Statewide total, at current unit costs</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Live preview — updates as you type, before you save. Includes the real repair-cost figure above.</div>
            </div>
            <div className="divide-y divide-border/20">
              <div className="px-3 py-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">🛠️ Classroom major repair — {statewideNeed.classroom_repair_needed_count.toLocaleString()} needed (real cost)</span>
                <span className="font-medium tabular-nums">{formatINR(statewideNeed.classroom_repair_actual_cost_rs)}</span>
              </div>
              {byCategory.map((f) => (
                <div key={f.key} className="px-3 py-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{f.icon} {f.label} — {f.count.toLocaleString()} needed</span>
                  <span className="font-medium tabular-nums">{formatINR(f.subtotal)}</span>
                </div>
              ))}
            </div>
            <div className="px-3 py-3 bg-muted/20 border-t border-border/30 flex items-center justify-between">
              <span className="text-sm font-semibold">Total estimated funding required</span>
              <span className="text-lg font-bold text-emerald-400 tabular-nums">{formatINR(totalEstimate)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
