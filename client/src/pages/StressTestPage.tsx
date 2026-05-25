import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, LineChart, Line, Legend, ReferenceLine,
} from "recharts";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowLeft, TrendingUp, TrendingDown, Loader2, Info, ChevronRight, X, RefreshCw, AlertTriangle, Zap, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";

// ── Types ──────────────────────────────────────────────────────────────────

interface RankingRow {
  districtId: string;
  scenario: string;
  horizonYear: number;
  exposureComposite: number;
  sensitivity: number;
  adaptiveCap: number;
  vulnerability: number;
  deterioration: number | null;
  avoidedDamage: number | null;
  hazardBreakdown: Record<string, number> | null;
  computedAt: string;
  districtName: string;
  stateId: string;
}

interface VulnRow {
  districtId: string;
  scenario: string;
  horizonYear: number;
  vulnerability: number;
  deterioration: number | null;
  avoidedDamage: number | null;
  hazardBreakdown: Record<string, number> | null;
}

interface DistrictDetail {
  vulnerability: VulnRow[];
}

interface MapPoint {
  districtId: string;
  districtName: string;
  stateId: string;
  deterioration: number | null;
  avoidedDamage: number | null;
  vulnerability: number;
  hazardBreakdown: Record<string, number> | null;
  lat: number | null;
  lon: number | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    key: "current_policies",
    label: "Current Policies",
    shortLabel: "Inaction",
    ssp: "SSP5-8.5",
    color: "#ef4444",
    description: "No new climate action beyond today's policies",
  },
  {
    key: "ndc",
    label: "NDCs Only",
    shortLabel: "NDCs",
    ssp: "SSP2-4.5",
    color: "#f59e0b",
    description: "Only nationally pledged targets are met",
  },
  {
    key: "net_zero_2050",
    label: "Net Zero 2050",
    shortLabel: "Net Zero",
    ssp: "SSP1-2.6",
    color: "#22c55e",
    description: "Strong global decarbonisation by 2050",
  },
] as const;

const YEARS = [2025, 2030, 2040, 2050] as const;

const HAZARD_COLORS: Record<string, string> = {
  heat: "#ef4444",
  drought: "#f97316",
  flood: "#3b82f6",
};

const CMIP6_MODELS = [
  "ACCESS-CM2", "MPI-ESM1-2-HR", "MIROC6", "CNRM-CM6-1", "IPSL-CM6A-LR",
];

// ── Helpers ────────────────────────────────────────────────────────────────

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

function fmt2(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toFixed(3);
}

function deteriorationColor(d: number | null): string {
  if (d == null) return "text-muted-foreground";
  if (d > 0.05) return "text-red-500";
  if (d > 0.02) return "text-orange-400";
  if (d > 0) return "text-yellow-400";
  return "text-green-400";
}

// ── Custom tooltip for bar chart ───────────────────────────────────────────

function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs max-w-[200px]">
      <p className="font-semibold text-sm mb-1">{label}</p>
      <p className="text-muted-foreground">{row?.state}</p>
      <div className="mt-2 space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Deterioration</span>
          <span className="font-mono text-red-400">{pct(row?.rawDet)}</span>
        </div>
        {row?.heat != null && (
          <div className="flex gap-1 mt-1">
            {["heat", "drought", "flood"].map((h) => (
              <div key={h} className="flex-1">
                <div
                  className="h-1.5 rounded"
                  style={{ background: HAZARD_COLORS[h], opacity: row?.[h] ?? 0 }}
                />
                <span className="text-[10px] text-muted-foreground capitalize">{h}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function StressTestPage() {
  const [scenario, setScenario] = useState<string>("current_policies");
  const [year, setYear] = useState<number>(2050);
  const [metric, setMetric] = useState<"deterioration" | "avoided_damage">("deterioration");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);
  const queryClient = useQueryClient();

  // ── Data queries ─────────────────────────────────────────────────────────

  const statusQ = useQuery<{ hasData: boolean }>({
    queryKey: ["stress-test-status"],
    queryFn: () => fetch("/api/stress-test/status").then((r) => r.json()),
  });

  const hasData = statusQ.data?.hasData ?? false;

  const rankingsQ = useQuery<RankingRow[]>({
    queryKey: ["stress-test-rankings", scenario, year, metric],
    queryFn: () =>
      fetch(
        `/api/stress-test/rankings?scenario=${scenario}&year=${year}&metric=${metric}&limit=50`
      ).then((r) => r.json()),
    enabled: hasData,
  });

  const detailQ = useQuery<DistrictDetail>({
    queryKey: ["stress-test-district", selectedId],
    queryFn: () =>
      fetch(`/api/stress-test/district/${selectedId}`).then((r) => r.json()),
    enabled: !!selectedId && hasData,
  });

  const mapQ = useQuery<MapPoint[]>({
    queryKey: ["stress-test-map", scenario, year, metric],
    queryFn: () =>
      fetch(
        `/api/stress-test/map-data?scenario=${scenario}&year=${year}&metric=${metric}&limit=200`
      ).then((r) => r.json()),
    enabled: hasData,
  });

  // ── Compute handler ───────────────────────────────────────────────────────

  async function handleCompute() {
    setIsComputing(true);
    try {
      const res = await fetch("/api/stress-test/compute", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      await queryClient.invalidateQueries({ queryKey: ["stress-test-status"] });
      await queryClient.invalidateQueries({ queryKey: ["stress-test-rankings"] });
    } catch (e) {
      console.error("Compute failed:", e);
    } finally {
      setIsComputing(false);
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const rankings = rankingsQ.data ?? [];

  const chartData = useMemo(
    () =>
      rankings.slice(0, 15).map((r) => ({
        name: r.districtName.length > 14 ? r.districtName.slice(0, 13) + "…" : r.districtName,
        fullName: r.districtName,
        state: r.stateId,
        value: parseFloat(
          (
            (metric === "avoided_damage" ? (r.avoidedDamage ?? 0) : (r.deterioration ?? 0)) * 100
          ).toFixed(2)
        ),
        rawDet: r.deterioration,
        heat: r.hazardBreakdown?.heat ?? 0,
        drought: r.hazardBreakdown?.drought ?? 0,
        flood: r.hazardBreakdown?.flood ?? 0,
        id: r.districtId,
      })),
    [rankings, metric]
  );

  const selectedScenario = SCENARIOS.find((s) => s.key === scenario)!;

  const summaryStats = useMemo(() => {
    if (!rankings.length) return null;
    const worsening = rankings.filter((r) => (r.deterioration ?? 0) > 0);
    const avgDet =
      rankings.reduce((a, b) => a + (b.deterioration ?? 0), 0) / rankings.length;
    const worst = rankings[0];
    return { worseningCount: worsening.length, total: rankings.length, avgDet, worst };
  }, [rankings]);

  // District detail: build timeline data for line chart
  const timelineData = useMemo(() => {
    if (!detailQ.data?.vulnerability?.length) return [];
    const rows = detailQ.data.vulnerability;
    return YEARS.map((y) => {
      const entry: Record<string, number | string> = { year: y };
      for (const s of SCENARIOS) {
        const row = rows.find((r) => r.scenario === s.key && r.horizonYear === y);
        if (row) entry[s.key] = parseFloat((row.vulnerability * 100).toFixed(3));
      }
      return entry;
    });
  }, [detailQ.data]);

  const selectedDistrict = rankings.find((r) => r.districtId === selectedId) ?? null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-background">
      {/* ── Nav bar ── */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1.5 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" />
              Dashboard
            </Button>
          </Link>
          <div className="w-px h-4 bg-border/50" />
          <TrendingUp className="h-4 w-4 text-orange-400" />
          <span className="font-semibold text-sm">2050 Climate Stress Test</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
            v0 · AR6 India
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/technology">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs hidden sm:flex">
              Technologies
            </Button>
          </Link>
          <Link href="/live-data">
            <Button size="sm" className="h-7 px-2 text-xs text-white hidden sm:flex" style={{ background: "#00AEEF" }}>
              ⚡ Live Data
            </Button>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* ── Controls bar ── */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-border/30 bg-card/30 shrink-0">
        {/* Scenario selector */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
          {SCENARIOS.map((s) => (
            <button
              key={s.key}
              onClick={() => setScenario(s.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                scenario === s.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: s.color }}
              />
              {s.shortLabel}
            </button>
          ))}
        </div>

        {/* Year selector */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
          {YEARS.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                year === y
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Metric toggle */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5 ml-auto">
          <button
            onClick={() => setMetric("deterioration")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              metric === "deterioration"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingDown className="h-3 w-3" />
            Deterioration
          </button>
          <button
            onClick={() => setMetric("avoided_damage")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              metric === "avoided_damage"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Leaf className="h-3 w-3" />
            Avoided Damage
          </button>
        </div>

        {/* Provenance toggle */}
        <button
          onClick={() => setShowProvenance((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info className="h-3 w-3" />
          Sources &amp; Limitations
        </button>
      </div>

      {/* ── Provenance banner ── */}
      {showProvenance && (
        <div className="px-4 py-3 bg-blue-500/10 border-b border-blue-500/20 text-xs text-muted-foreground shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5 max-w-4xl">
              <p>
                <span className="font-semibold text-foreground">Data source:</span> AR6 WG1 Chapter 12 — South-Asia regional climate projections (IPCC, 2021).
                Scenario mapping: Current Policies → SSP5-8.5, NDCs → SSP2-4.5, Net Zero 2050 → SSP1-2.6.
                CMIP6 ensemble: {CMIP6_MODELS.join(", ")}.
              </p>
              <p>
                <span className="font-semibold text-foreground">v0 method:</span> AR6 South-Asia scalar exposure deltas applied to district baseline hazard scores.
                Sensitivity and Adaptive Capacity frozen at current values. NEX-GDDP-CMIP6 district-level downscaling planned for v1.
              </p>
              <p className="text-orange-400/80">
                <span className="font-semibold">Known limitations:</span>{" "}
                (1) Static sensitivity/adaptive capacity understates risk in high-growth districts.{" "}
                (2) Flood proxied via extreme-precip delta, not inundation modelling.{" "}
                (3) Compound hazards (heat + drought co-occurrence) not jointly modelled in v0.
              </p>
            </div>
            <button onClick={() => setShowProvenance(false)}>
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      {statusQ.isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !hasData ? (
        <EmptyState isComputing={isComputing} onCompute={handleCompute} />
      ) : (
        <div className="flex-1 overflow-hidden flex">
          {/* ── Left panel: rankings list ── */}
          <div className="w-72 xl:w-80 shrink-0 flex flex-col border-r border-border/50 overflow-hidden">
            <div className="px-3 py-2 border-b border-border/30 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {metric === "avoided_damage" ? "What action saves" : `Worst by ${year}`}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {rankings.length} districts
                </span>
              </div>
            </div>

            {rankingsQ.isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {rankings.map((r, i) => (
                  <button
                    key={r.districtId}
                    onClick={() =>
                      setSelectedId(selectedId === r.districtId ? null : r.districtId)
                    }
                    className={`w-full flex items-center gap-2 px-3 py-2 border-b border-border/20 text-left transition-colors ${
                      selectedId === r.districtId
                        ? "bg-accent"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <span className="text-[11px] text-muted-foreground w-5 shrink-0 text-right">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{r.districtName}</div>
                      <div className="text-[10px] text-muted-foreground">{r.stateId}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className={`text-xs font-mono font-semibold ${deteriorationColor(
                          metric === "avoided_damage" ? r.avoidedDamage : r.deterioration
                        )}`}
                      >
                        {metric === "avoided_damage"
                          ? pct(r.avoidedDamage)
                          : pct(r.deterioration)}
                      </div>
                      {r.hazardBreakdown && (
                        <HazardBar breakdown={r.hazardBreakdown} />
                      )}
                    </div>
                    <ChevronRight
                      className={`h-3 w-3 shrink-0 transition-transform ${
                        selectedId === r.districtId ? "rotate-90" : ""
                      } text-muted-foreground`}
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Re-compute button */}
            <div className="p-2 border-t border-border/30 shrink-0">
              <button
                onClick={handleCompute}
                disabled={isComputing}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground py-1.5 rounded-md hover:bg-accent transition-colors disabled:opacity-50"
              >
                {isComputing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                {isComputing ? "Computing…" : "Recompute projections"}
              </button>
            </div>
          </div>

          {/* ── Right panel ── */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {selectedId && detailQ.data ? (
              /* District detail view */
              <DistrictDetailPanel
                district={selectedDistrict}
                detail={detailQ.data}
                timelineData={timelineData}
                onClose={() => setSelectedId(null)}
                metric={metric}
              />
            ) : (
              /* Overview: stats + chart */
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Scenario label */}
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: selectedScenario.color }}
                  />
                  <span className="text-sm font-medium">{selectedScenario.label}</span>
                  <span className="text-xs text-muted-foreground">
                    ({selectedScenario.ssp}) · {selectedScenario.description}
                  </span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    Horizon: {year}
                  </Badge>
                </div>

                {/* Summary stat cards */}
                {summaryStats && (
                  <div className="grid grid-cols-3 gap-3">
                    <Card className="border-border/50">
                      <CardContent className="p-3">
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
                          Districts Worsening
                        </div>
                        <div className="text-2xl font-bold text-red-400">
                          {summaryStats.worseningCount}
                          <span className="text-sm text-muted-foreground font-normal">
                            /{summaryStats.total}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {Math.round((summaryStats.worseningCount / summaryStats.total) * 100)}% of ranked districts
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50">
                      <CardContent className="p-3">
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
                          Avg Deterioration
                        </div>
                        <div
                          className={`text-2xl font-bold ${deteriorationColor(summaryStats.avgDet)}`}
                        >
                          {pct(summaryStats.avgDet)}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          vs 2025 baseline
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50">
                      <CardContent className="p-3">
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
                          Worst District
                        </div>
                        <div className="text-sm font-bold truncate text-red-400">
                          {summaryStats.worst?.districtName ?? "—"}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {pct(summaryStats.worst?.deterioration)} deterioration
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Bar chart */}
                <Card className="border-border/50">
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm">
                      Top 15 Districts —{" "}
                      {metric === "avoided_damage"
                        ? "Largest Avoided Damage (what Net Zero saves)"
                        : `Greatest Deterioration by ${year}`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-2 pb-3">
                    {chartData.length === 0 ? (
                      <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">
                        No data for selected filters
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={Math.max(240, chartData.length * 28)}>
                        <BarChart
                          layout="vertical"
                          data={chartData}
                          margin={{ top: 4, right: 40, left: 4, bottom: 4 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                          <XAxis
                            type="number"
                            tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}
                            tick={{ fontSize: 10 }}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={110}
                            tick={{ fontSize: 10 }}
                          />
                          <ReTooltip content={<BarTooltip />} />
                          <ReferenceLine x={0} stroke="currentColor" opacity={0.3} />
                          <Bar
                            dataKey="value"
                            fill={selectedScenario.color}
                            opacity={0.85}
                            radius={[0, 3, 3, 0]}
                            label={{
                              position: "right",
                              formatter: (v: number) =>
                                `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`,
                              fontSize: 9,
                              fill: "currentColor",
                            }}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* Map */}
                <Card className="border-border/50">
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm">
                      Geographic Distribution —{" "}
                      {metric === "avoided_damage" ? "Avoided Damage" : `Deterioration by ${year}`}
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground">
                      Circle size and colour scale with risk score. Click a district for details.
                    </p>
                  </CardHeader>
                  <CardContent className="pt-0 pb-3 px-3">
                    <ProjectionMap
                      points={mapQ.data ?? []}
                      metric={metric}
                      onSelect={setSelectedId}
                    />
                  </CardContent>
                </Card>

                {/* v0 disclaimer */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border/30 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-yellow-500" />
                  <span>
                    <strong className="text-foreground">v0 synthetic projections.</strong> Scores
                    are derived from AR6 WG1 South-Asia regional scalar deltas applied to district
                    baseline exposure — not district-level CMIP6 downscaling. Suitable for
                    relative ranking and advocacy framing. Click "Sources &amp; Limitations" above
                    for full provenance.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

// ── Colour helpers for map markers ────────────────────────────────────────────

function deteriorationToColor(d: number | null): string {
  if (d == null || d <= 0) return "#22c55e";
  if (d > 0.08) return "#ef4444";
  if (d > 0.04) return "#f97316";
  return "#f59e0b";
}

function deteriorationToRadius(d: number | null, max: number): number {
  if (d == null || d <= 0 || max <= 0) return 4;
  return 4 + (d / max) * 12;
}

function ProjectionMap({
  points,
  metric,
  onSelect,
}: {
  points: MapPoint[];
  metric: "deterioration" | "avoided_damage";
  onSelect: (id: string) => void;
}) {
  const valid = points.filter((p) => p.lat != null && p.lon != null);
  const values = valid.map((p) =>
    metric === "avoided_damage" ? (p.avoidedDamage ?? 0) : (p.deterioration ?? 0)
  );
  const maxVal = values.length ? Math.max(...values) : 1;

  return (
    <div style={{ height: 380 }} className="rounded-lg overflow-hidden border border-border/30">
      <MapContainer
        center={[22.5, 82.5]}
        zoom={4}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        {valid.map((p) => {
          const val = metric === "avoided_damage" ? (p.avoidedDamage ?? 0) : (p.deterioration ?? 0);
          return (
            <CircleMarker
              key={p.districtId}
              center={[p.lat!, p.lon!]}
              radius={deteriorationToRadius(val, maxVal)}
              pathOptions={{
                color: deteriorationToColor(val),
                fillColor: deteriorationToColor(val),
                fillOpacity: 0.75,
                weight: 0.5,
              }}
              eventHandlers={{ click: () => onSelect(p.districtId) }}
            >
              <Popup>
                <div className="text-xs space-y-0.5 min-w-[140px]">
                  <p className="font-semibold">{p.districtName}</p>
                  <p className="text-muted-foreground">{p.stateId}</p>
                  <p className="mt-1">
                    {metric === "avoided_damage" ? "Avoided damage" : "Deterioration"}:{" "}
                    <strong>{pct(val)}</strong>
                  </p>
                  {p.hazardBreakdown && (
                    <div className="flex gap-1 mt-1">
                      {(["heat", "drought", "flood"] as const).map((h) => (
                        <div key={h} className="text-center flex-1">
                          <div
                            className="h-1.5 rounded-sm"
                            style={{ background: HAZARD_COLORS[h], opacity: p.hazardBreakdown![h] ?? 0 }}
                          />
                          <span style={{ fontSize: 9 }}>{h.slice(0, 2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

function HazardBar({ breakdown }: { breakdown: Record<string, number> }) {
  return (
    <div className="flex h-1 w-16 rounded overflow-hidden mt-0.5">
      {["heat", "drought", "flood"].map((h) => (
        <div
          key={h}
          style={{
            width: `${((breakdown[h] ?? 0) * 100).toFixed(0)}%`,
            background: HAZARD_COLORS[h],
          }}
        />
      ))}
    </div>
  );
}

function EmptyState({
  isComputing,
  onCompute,
}: {
  isComputing: boolean;
  onCompute: () => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-5">
        <div className="h-16 w-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto">
          <TrendingUp className="h-8 w-8 text-orange-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-2">2050 Climate Projections</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            No projections computed yet. Click below to generate v0 synthetic stress-test
            scores for all districts using AR6 WG1 South-Asia regional climate deltas.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          {[
            { icon: <Zap className="h-3.5 w-3.5 text-red-400" />, label: "Current Policies", sub: "SSP5-8.5" },
            { icon: <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />, label: "NDCs", sub: "SSP2-4.5" },
            { icon: <Leaf className="h-3.5 w-3.5 text-green-400" />, label: "Net Zero 2050", sub: "SSP1-2.6" },
          ].map(({ icon, label, sub }) => (
            <div key={label} className="p-2 rounded-lg bg-muted/30 border border-border/30 flex flex-col items-center gap-1">
              {icon}
              <span className="font-medium">{label}</span>
              <span className="text-[10px]">{sub}</span>
            </div>
          ))}
        </div>
        <Button onClick={onCompute} disabled={isComputing} className="gap-2">
          {isComputing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Computing projections…
            </>
          ) : (
            <>
              <TrendingUp className="h-4 w-4" />
              Compute v0 Projections
            </>
          )}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Computes ~650 districts × 3 scenarios × 4 years. Takes 10–30 seconds.
        </p>
      </div>
    </div>
  );
}

function DistrictDetailPanel({
  district,
  detail,
  timelineData,
  onClose,
  metric,
}: {
  district: RankingRow | null;
  detail: DistrictDetail;
  timelineData: Record<string, number | string>[];
  onClose: () => void;
  metric: "deterioration" | "avoided_damage";
}) {
  const latestRow = detail.vulnerability.find(
    (r) => r.scenario === "current_policies" && r.horizonYear === 2050
  );
  const baseline = detail.vulnerability.find(
    (r) => r.scenario === "current_policies" && r.horizonYear === 2025
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold">{district?.districtName ?? "District"}</h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs">{district?.stateId}</Badge>
            <span className="text-xs text-muted-foreground">
              Current vulnerability: <strong>{fmt2(baseline?.vulnerability)}</strong>
            </span>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
              Deterioration (inaction)
            </div>
            <div className={`text-xl font-bold ${deteriorationColor(latestRow?.deterioration ?? null)}`}>
              {pct(latestRow?.deterioration)}
            </div>
            <div className="text-[11px] text-muted-foreground">vs 2025, Current Policies 2050</div>
          </CardContent>
        </Card>
        <Card className="border-green-500/20 border">
          <CardContent className="p-3">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
              Avoided Damage
            </div>
            <div className="text-xl font-bold text-green-400">
              {pct(latestRow?.avoidedDamage)}
            </div>
            <div className="text-[11px] text-muted-foreground">what Net Zero 2050 saves</div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline chart */}
      <Card className="border-border/50">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-sm">Vulnerability Trajectory — All Scenarios</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Score = (Exposure × Sensitivity) / Adaptive Capacity · lower is better
          </p>
        </CardHeader>
        <CardContent className="pt-0 pb-3 px-2">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={timelineData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v.toFixed(2)} width={40} />
              <ReTooltip
                formatter={(v: number, name: string) => {
                  const s = SCENARIOS.find((sc) => sc.key === name);
                  return [v.toFixed(3), s?.label ?? name];
                }}
                labelFormatter={(l) => `Year ${l}`}
              />
              <Legend
                formatter={(value) => {
                  const s = SCENARIOS.find((sc) => sc.key === value);
                  return <span style={{ fontSize: 10 }}>{s?.shortLabel ?? value}</span>;
                }}
              />
              {SCENARIOS.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Hazard breakdown */}
      {latestRow?.hazardBreakdown && (
        <Card className="border-border/50">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-sm">Hazard Contribution (2050, Inaction)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3 px-4 space-y-2">
            {(["heat", "drought", "flood"] as const).map((h) => {
              const share = latestRow.hazardBreakdown![h] ?? 0;
              return (
                <div key={h} className="flex items-center gap-2">
                  <span className="text-xs capitalize w-12 shrink-0 text-muted-foreground">{h}</span>
                  <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(share * 100).toFixed(0)}%`,
                        background: HAZARD_COLORS[h],
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono w-10 text-right text-muted-foreground">
                    {(share * 100).toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
