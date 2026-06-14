import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  ArrowLeft, Loader2, RefreshCw, AlertTriangle, ShieldCheck,
  Droplets, HeartPulse, ScrollText, ChevronRight, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";

// ── Types ──────────────────────────────────────────────────────────────────

interface AdaptMapPoint {
  districtId: string;
  riskScore: number;
  hazardNorm: number;
  effectiveDrought: number;
  effectiveFlood: number;
}

interface Recommendation {
  category: "WASH" | "DRR" | "Policy" | "Health";
  priority: "Critical" | "High" | "Medium" | "Low";
  action: string;
  rationale: string;
  indicator: string;
}

interface AdaptDetail {
  districtId: string;
  effectiveDrought: number;
  effectiveFlood: number;
  compoundHazard: number;
  hazardNorm: number;
  riskScore: number;
  impactPeople: number;
  impactLivelihood: number;
  recommendations: Recommendation[];
  computedAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

const CATEGORY_META: Record<Recommendation["category"], { icon: React.FC<any>; color: string; bg: string }> = {
  WASH:   { icon: Droplets,   color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20" },
  DRR:    { icon: ShieldCheck, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  Policy: { icon: ScrollText,  color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  Health: { icon: HeartPulse,  color: "text-green-400",  bg: "bg-green-500/10 border-green-500/20" },
};

const PRIORITY_BADGE: Record<Recommendation["priority"], string> = {
  Critical: "bg-red-500/20 text-red-400 border-red-500/30",
  High:     "bg-orange-500/20 text-orange-400 border-orange-500/30",
  Medium:   "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  Low:      "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

// ── Choropleth helpers ────────────────────────────────────────────────────

function riskColor(score: number, max: number): string {
  const t = max > 0 ? Math.min(score / max, 1) : 0;
  if (t > 0.75) return "#ef4444";
  if (t > 0.55) return "#f97316";
  if (t > 0.35) return "#f59e0b";
  if (t > 0.15) return "#eab308";
  return "#22c55e";
}

const LEGEND = [
  { color: "#ef4444", label: "Very high risk" },
  { color: "#f97316", label: "High risk" },
  { color: "#f59e0b", label: "Moderate risk" },
  { color: "#eab308", label: "Low risk" },
  { color: "#22c55e", label: "Lowest risk" },
  { color: "#374151", label: "No data" },
];

// ── Sub-components ────────────────────────────────────────────────────────

function RiskBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/40">
        <div className="h-full rounded-full" style={{ width: `${Math.min(value * 100, 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const meta = CATEGORY_META[rec.category];
  const Icon = meta.icon;
  return (
    <div className={`rounded-lg border p-3 space-y-1.5 ${meta.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.color}`} />
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${meta.color}`}>{rec.category}</span>
        </div>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${PRIORITY_BADGE[rec.priority]}`}>
          {rec.priority}
        </span>
      </div>
      <p className="text-xs font-medium leading-snug">{rec.action}</p>
      <p className="text-[10px] text-muted-foreground leading-snug">{rec.rationale}</p>
      <p className={`text-[10px] font-medium ${meta.color}`}>{rec.indicator}</p>
    </div>
  );
}

// ── Map component ─────────────────────────────────────────────────────────

function AdaptMap({
  geoData,
  scoreMap,
  maxVal,
  onSelect,
  selectedId,
}: {
  geoData: any;
  scoreMap: Record<string, number>;
  maxVal: number;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const styleFeature = useMemo(() => (feature: any) => {
    const id = String(feature.properties.ID);
    const score = scoreMap[id];
    const isSelected = id === selectedId;
    if (score == null) {
      return { fillColor: "#374151", fillOpacity: 0.25, color: "#4b5563", weight: 0.3 };
    }
    return {
      fillColor: riskColor(score, maxVal),
      fillOpacity: isSelected ? 1.0 : 0.78,
      color: isSelected ? "#ffffff" : "#1f2937",
      weight: isSelected ? 1.5 : 0.5,
    };
  }, [scoreMap, maxVal, selectedId]);

  const onEachFeature = useMemo(() => (feature: any, layer: any) => {
    const id = String(feature.properties.ID);
    const score = scoreMap[id];
    const label = `<strong>${feature.properties.NAME}</strong><br/>${feature.properties.STATE}<br/>${
      score != null ? `Risk: ${(score * 100).toFixed(1)}%` : "No data"
    }`;
    layer.bindTooltip(label, { sticky: true, className: "leaflet-proj-tooltip" });
    layer.on("click", () => { if (score != null) onSelect(id); });
  }, [scoreMap, onSelect]);

  return (
    <div className="space-y-2">
      <div style={{ height: 420 }} className="rounded-lg overflow-hidden border border-border/30">
        {!geoData ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading map…
          </div>
        ) : (
          <MapContainer center={[22.5, 82.5]} zoom={4} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />
            <GeoJSON
              key={`adapt-${Object.keys(scoreMap).length}-${selectedId ?? "none"}`}
              data={geoData}
              style={styleFeature}
              onEachFeature={onEachFeature}
            />
          </MapContainer>
        )}
      </div>
      <div className="flex flex-wrap gap-3 px-1">
        {LEGEND.map((l) => (
          <div key={l.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="h-2.5 w-4 rounded-sm shrink-0" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function AdaptPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<Recommendation["category"] | "All">("All");

  const statusQ = useQuery<{ hasData: boolean }>({
    queryKey: ["adapt-status"],
    queryFn: () => fetch("/api/adapt/status").then((r) => r.json()),
  });

  const mapQ = useQuery<AdaptMapPoint[]>({
    queryKey: ["adapt-districts"],
    queryFn: () => fetch("/api/adapt/districts?limit=2000").then((r) => r.json()),
    enabled: statusQ.data?.hasData === true,
  });

  const rankingsQ = useQuery<AdaptDetail[]>({
    queryKey: ["adapt-rankings"],
    queryFn: () => fetch("/api/adapt/rankings?limit=200").then((r) => r.json()),
    enabled: statusQ.data?.hasData === true,
  });

  const detailQ = useQuery<AdaptDetail>({
    queryKey: ["adapt-district", selectedId],
    queryFn: () => fetch(`/api/adapt/district/${selectedId}`).then((r) => r.json()),
    enabled: !!selectedId,
  });

  const geoQ = useQuery<any>({
    queryKey: ["india-geojson"],
    queryFn: () => fetch("/data/india.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  // Build name/state lookup from GeoJSON so rankings show human-readable labels
  const nameMap = useMemo(() => {
    const m: Record<string, { name: string; state: string }> = {};
    for (const f of (geoQ.data?.features ?? [])) {
      m[String(f.properties.ID)] = { name: f.properties.NAME, state: f.properties.STATE };
    }
    return m;
  }, [geoQ.data]);

  const scoreMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of mapQ.data ?? []) m[p.districtId] = p.riskScore;
    return m;
  }, [mapQ.data]);

  const maxVal = useMemo(() => {
    const vals = Object.values(scoreMap);
    return vals.length ? Math.max(...vals) : 1;
  }, [scoreMap]);

  async function handleCompute() {
    setComputing(true);
    setComputeError(null);
    try {
      const r = await fetch("/api/adapt/compute", { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Compute failed");
      await queryClient.invalidateQueries({ queryKey: ["adapt-status"] });
      await queryClient.invalidateQueries({ queryKey: ["adapt-districts"] });
      await queryClient.invalidateQueries({ queryKey: ["adapt-rankings"] });
      await queryClient.invalidateQueries({ queryKey: ["adapt-district"] });
    } catch (e: any) {
      setComputeError(e.message ?? "Unknown error");
    } finally {
      setComputing(false);
    }
  }

  const detail = detailQ.data;
  const filteredRecs = useMemo(() => {
    if (!detail?.recommendations) return [];
    return filterCategory === "All"
      ? detail.recommendations
      : detail.recommendations.filter((r) => r.category === filterCategory);
  }, [detail, filterCategory]);

  const hasData = statusQ.data?.hasData;
  const isLoading = statusQ.isLoading || mapQ.isLoading;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/stress-test">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8">
                <ArrowLeft className="h-3.5 w-3.5" /> Stress Test
              </Button>
            </Link>
            <div className="h-4 w-px bg-border/50" />
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-semibold">Adaptation Pathways</span>
              <Badge variant="outline" className="text-[10px] h-5 border-violet-500/30 text-violet-400 bg-violet-500/10">
                Demo · Uncalibrated
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleCompute}
              disabled={computing}
              className="h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
            >
              {computing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {computing ? "Computing…" : hasData ? "Recompute" : "Run Engine"}
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Demo notice */}
      <div className="max-w-screen-xl mx-auto px-4 pt-3">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            <strong className="text-amber-200">Demo mode.</strong> ENSO teleconnection coefficients and biophysical conditioners
            are placeholders — not calibrated against historical data. Risk scores are illustrative only.
            Adaptation recommendations are rule-based and independently grounded in NDMA/WHO guidelines.
          </span>
        </div>
      </div>

      {computeError && (
        <div className="max-w-screen-xl mx-auto px-4 pt-2">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono">{computeError}</span>
          </div>
        </div>
      )}

      {!hasData && !isLoading ? (
        /* Empty state */
        <div className="max-w-screen-xl mx-auto px-4 py-16 flex flex-col items-center gap-4 text-center">
          <ShieldCheck className="h-12 w-12 text-violet-400 opacity-50" />
          <h2 className="text-lg font-semibold">No adaptation data yet</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Click <strong>Run Engine</strong> to run the Python climate-adapt-risk model across all districts.
            Takes ~30 seconds. Requires python3 on PATH with no additional packages.
          </p>
        </div>
      ) : (
        <div className="max-w-screen-xl mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
          {/* Left: map + rankings */}
          <div className="space-y-4">
            {/* Map */}
            <Card className="border-border/40">
              <CardHeader className="py-3 px-4 border-b border-border/30">
                <CardTitle className="text-sm font-medium">
                  Composite Risk Score — India Districts
                  <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                    INFORM-extended · ENSO-adjusted (demo)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {isLoading ? (
                  <div className="h-[420px] flex items-center justify-center text-muted-foreground text-xs gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : (
                  <AdaptMap
                    geoData={geoQ.data ?? null}
                    scoreMap={scoreMap}
                    maxVal={maxVal}
                    onSelect={setSelectedId}
                    selectedId={selectedId}
                  />
                )}
              </CardContent>
            </Card>

            {/* Rankings table */}
            <Card className="border-border/40">
              <CardHeader className="py-3 px-4 border-b border-border/30">
                <CardTitle className="text-sm font-medium">
                  Highest Risk Districts
                  <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                    {rankingsQ.data?.length ?? 0} ranked · click to see steps
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-72 overflow-y-auto">
                  {(rankingsQ.data ?? []).slice(0, 50).map((row, i) => (
                    <button
                      key={row.districtId}
                      onClick={() => setSelectedId(row.districtId)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors border-b border-border/20 last:border-0 ${
                        selectedId === row.districtId ? "bg-violet-500/10" : ""
                      }`}
                    >
                      <span className="text-[10px] text-muted-foreground w-5 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">
                          {nameMap[row.districtId]?.name ?? row.districtId}
                        </div>
                        <div className="text-[9px] text-muted-foreground truncate">
                          {nameMap[row.districtId]?.state ?? ""}
                        </div>
                        <div className="flex gap-2 mt-0.5">
                          <div className="h-1 rounded-full bg-muted/40 flex-1">
                            <div
                              className="h-full rounded-full bg-violet-500"
                              style={{ width: `${Math.min((row.riskScore / maxVal) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] text-violet-400 font-mono shrink-0">
                        {(row.riskScore * 100).toFixed(1)}%
                      </span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: district detail + recommendations */}
          <div className="space-y-4">
            {!selectedId ? (
              <Card className="border-border/40 h-full">
                <CardContent className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground text-xs gap-2">
                  <ShieldCheck className="h-8 w-8 opacity-30" />
                  Click a district on the map or in the rankings list to see adaptation steps.
                </CardContent>
              </Card>
            ) : detailQ.isLoading ? (
              <Card className="border-border/40">
                <CardContent className="flex items-center justify-center h-32 gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading district…
                </CardContent>
              </Card>
            ) : detail ? (
              <>
                {/* District risk breakdown */}
                <Card className="border-border/40">
                  <CardHeader className="py-3 px-4 border-b border-border/30 flex flex-row items-start justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold">{selectedId}</CardTitle>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Computed {new Date(detail.computedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button onClick={() => setSelectedId(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {/* Composite risk score */}
                    <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20 text-center">
                      <p className="text-[10px] text-violet-400 font-medium uppercase tracking-wide">Composite Risk Score</p>
                      <p className="text-2xl font-bold text-violet-300 mt-0.5">
                        {(detail.riskScore * 100).toFixed(1)}
                        <span className="text-sm font-normal text-violet-400">%</span>
                      </p>
                    </div>
                    {/* Component bars */}
                    <div className="space-y-2 pt-1">
                      <RiskBar label="Compound Hazard" value={detail.hazardNorm} color="#8b5cf6" />
                      <RiskBar label="Drought Stress" value={Math.min(detail.effectiveDrought, 1)} color="#f59e0b" />
                      <RiskBar
                        label="Flood Runoff"
                        value={Math.min(detail.effectiveFlood / (maxVal > 0 ? maxVal * 10 : 1), 1)}
                        color="#3b82f6"
                      />
                    </div>
                    {/* Impact */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="p-2 rounded-lg bg-muted/30 text-center">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">People at risk</p>
                        <p className="text-sm font-bold mt-0.5">{Math.round(detail.impactPeople).toLocaleString()}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30 text-center">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Livelihood impact</p>
                        <p className="text-sm font-bold mt-0.5">${Math.round(detail.impactLivelihood).toLocaleString()}K</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Recommendations */}
                <Card className="border-border/40">
                  <CardHeader className="py-3 px-4 border-b border-border/30">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <span>Adaptation Steps ({detail.recommendations.length})</span>
                    </CardTitle>
                    {/* Category filter */}
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {(["All", "WASH", "DRR", "Policy", "Health"] as const).map((cat) => {
                        // meta unused here — category colour is applied inside RecommendationCard
                        return (
                          <button
                            key={cat}
                            onClick={() => setFilterCategory(cat)}
                            className={`text-[9px] px-2 py-0.5 rounded-full border transition-colors ${
                              filterCategory === cat
                                ? "bg-foreground text-background border-foreground"
                                : "border-border/40 text-muted-foreground hover:border-foreground/30"
                            }`}
                          >
                            {cat}
                            {cat !== "All" && (
                              <span className="ml-1 opacity-60">
                                {detail.recommendations.filter((r) => r.category === cat).length}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 space-y-2 max-h-[520px] overflow-y-auto">
                    {filteredRecs.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No {filterCategory} recommendations for this district.
                      </p>
                    ) : (
                      filteredRecs.map((rec, i) => <RecommendationCard key={i} rec={rec} />)
                    )}
                  </CardContent>
                </Card>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
