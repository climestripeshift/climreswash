import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { GeoJSON as LeafletGeoJSONLayer } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cellToBoundary } from "h3-js";
import { ArrowLeft, FlaskConical, AlertTriangle, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { reScoreHex, type SimInputs, type HexProp } from "@/lib/simulatorFormulas";

// ── Color gradient (0-10 risk scale) ─────────────────────────────────────────

const GRAD: [number, number, number][] = [
  [22, 163, 74], [234, 179, 8], [249, 115, 22], [239, 68, 68], [127, 29, 29],
];
function lerp3(a: [number,number,number], b: [number,number,number], t: number) {
  return `rgb(${a.map((c, i) => Math.round(c + t * (b[i] - c))).join(",")})`;
}
function riskColor(risk: number): string {
  const t = Math.max(0, Math.min(1, risk / 10));
  const s = t * (GRAD.length - 1);
  const lo = Math.floor(s), hi = Math.min(lo + 1, GRAD.length - 1);
  return lerp3(GRAD[lo], GRAD[hi], s - lo);
}
function fmt(n: number) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : `${n}`;
}

// ── Canvas renderer (singleton) ───────────────────────────────────────────────

const canvasRenderer = L.canvas({ padding: 0.5 });

function SetupCanvas() {
  const map = useMap();
  useEffect(() => { (map as any).options.renderer = canvasRenderer; }, [map]);
  return null;
}

// ── Presets ───────────────────────────────────────────────────────────────────

const DEFAULT_INPUTS: SimInputs = { rainfall_mm: 20, tmax_c: 36, hot_days: 3, rh_pct: 65 };

const PRESETS = [
  {
    id: "extremeMonsoon", label: "Extreme Monsoon", icon: "🌧️",
    note: "Kerala 2018 — 130 mm/day flood peak, 92% RH",
    inputs: { rainfall_mm: 130, tmax_c: 29, hot_days: 1, rh_pct: 92 },
  },
  {
    id: "plus2c", label: "+2°C Warming", icon: "📈",
    note: "IPCC proxy — summer peak 41°C, above-normal rainfall",
    inputs: { rainfall_mm: 25, tmax_c: 41, hot_days: 7, rh_pct: 70 },
  },
  {
    id: "heatwave2022", label: "2022 Heatwave", icon: "🌡️",
    note: "Delhi 2023 — T_max 47°C, 7 hot days · heat concentrates in dense urban areas",
    inputs: { rainfall_mm: 20, tmax_c: 47, hot_days: 7, rh_pct: 35 },
  },
  {
    id: "elnino", label: "El Niño Drought", icon: "☀️",
    note: "Marathwada 2015 — 11 mm/day (severe deficit) · drought drives Deccan/AP/Telangana",
    inputs: { rainfall_mm: 11, tmax_c: 39, hot_days: 5, rh_pct: 42 },
  },
] as const;

// ── District aggregation type ─────────────────────────────────────────────────

interface DistrictSim {
  name: string; state: string;
  simRisk: number; baseRisk: number;
  totalPop: number; totalCh5: number;
}

// ── Slider subcomponent ───────────────────────────────────────────────────────

function Slider({
  label, min, max, step, value, baseline, onChange, format,
}: {
  label: string; min: number; max: number; step: number;
  value: number; baseline: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  const delta = value - baseline;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-bold text-foreground">
          {format(value)}
          {Math.abs(delta) > 0.001 && (
            <span className={`ml-1 text-[10px] ${delta > 0 ? "text-orange-400" : "text-blue-400"}`}>
              ({delta > 0 ? "+" : ""}{format(delta)})
            </span>
          )}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 appearance-none rounded-full cursor-pointer
          bg-muted accent-violet-500"
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SimulatorPage() {
  const [inputs, setInputs] = useState<SimInputs>(DEFAULT_INPUTS);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Debounced inputs — 120ms after last slider move
  const [debounced, setDebounced] = useState<SimInputs>(DEFAULT_INPUTS);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(inputs), 120);
    return () => clearTimeout(t);
  }, [inputs]);

  // Load hex props + reconstruct H3 geometry once (canvas-ready GeoJSON)
  const hexQ = useQuery<{ props: HexProp[]; geoJson: any }>({
    queryKey: ["hex-props-sim"],
    queryFn: async () => {
      const props: HexProp[] = await fetch("/data/india_hex_props.json").then(r => r.json());
      const features = props.map(p => {
        const boundary = cellToBoundary(p.h3_id);
        const coords = boundary.map(([lat, lng]: [number, number]) => [lng, lat]);
        coords.push(coords[0]);
        return { type: "Feature", properties: p, geometry: { type: "Polygon", coordinates: [coords] } };
      });
      return { props, geoJson: { type: "FeatureCollection", features } };
    },
    staleTime: Infinity,
  });

  // Per-hex simulated risk (recomputed on slider change)
  const simScores = useMemo(() => {
    const hexes = hexQ.data?.props;
    if (!hexes) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const hex of hexes) m.set(hex.h3_id, reScoreHex(hex, debounced));
    return m;
  }, [hexQ.data?.props, debounced]);

  // Stable ref so styleFeature never needs to be recreated
  const simScoresRef = useRef(simScores);
  simScoresRef.current = simScores;

  // District aggregation (for stats bar + selected district panel)
  const districtMap = useMemo<Map<string, DistrictSim>>(() => {
    const hexes = hexQ.data?.props;
    if (!hexes) return new Map();
    const acc = new Map<string, {
      name: string; state: string;
      simW: number; baseW: number; totalPop: number; totalCh5: number;
    }>();
    for (const hex of hexes) {
      const key = hex.district_name.toLowerCase().trim();
      if (!acc.has(key)) {
        acc.set(key, { name: hex.district_name, state: hex.state, simW: 0, baseW: 0, totalPop: 0, totalCh5: 0 });
      }
      const pop = Math.max(hex.population || 0, 1);
      const sim = simScores.get(hex.h3_id) ?? 0;
      const e = acc.get(key)!;
      e.simW    += sim * pop;
      e.baseW   += hex.hex_risk * pop;
      e.totalPop += hex.population || 0;
      e.totalCh5 += hex.pop_children_under_5 || 0;
    }
    const result = new Map<string, DistrictSim>();
    for (const [key, e] of Array.from(acc.entries())) {
      result.set(key, {
        name: e.name, state: e.state,
        simRisk:  e.simW / e.totalPop,
        baseRisk: e.baseW / e.totalPop,
        totalPop: e.totalPop,
        totalCh5: e.totalCh5,
      });
    }
    return result;
  }, [hexQ.data?.props, simScores]);

  // Stats: districts crossing 5.0 threshold vs stored baseline
  const stats = useMemo(() => {
    if (!districtMap.size) return null;
    const all = Array.from(districtMap.values());
    const flipped  = all.filter(d => d.baseRisk < 5 && d.simRisk >= 5);
    const elevated = all.filter(d => d.simRisk > d.baseRisk + 0.5);
    return {
      flippedCount:   flipped.length,
      elevatedCount:  elevated.length,
      addlPeople:     flipped.reduce((s, d) => s + d.totalPop, 0),
      addlCh5:        flipped.reduce((s, d) => s + d.totalCh5, 0),
      elevatedPeople: elevated.reduce((s, d) => s + d.totalPop, 0),
    };
  }, [districtMap]);

  // Canvas style — truly stable, reads scores from ref
  const geoJsonRef = useRef<LeafletGeoJSONLayer | null>(null);

  const styleFeature = useCallback((_feature: any) => ({
    fillColor:   riskColor(simScoresRef.current.get(_feature.properties.h3_id) ?? 0),
    fillOpacity: 0.78,
    color:       "#1e293b",
    weight:      0.3,
    renderer:    canvasRenderer,
  }), []); // stable — reads through ref

  // Re-paint hexes in-place on every score update (no GeoJSON remount)
  useEffect(() => {
    geoJsonRef.current?.setStyle(styleFeature);
  }, [simScores, styleFeature]);

  // Hex interaction — stable, tooltip updated live on hover
  const onEachFeature = useCallback((feature: any, layer: any) => {
    const p = feature.properties;
    const distKey = (p.district_name ?? "").toLowerCase().trim();
    layer.bindTooltip("", { sticky: true });
    layer.on({
      click: () => setSelected(prev => prev === distKey ? null : distKey),
      mouseover: (e: any) => {
        const risk = simScoresRef.current.get(p.h3_id) ?? 0;
        layer.setTooltipContent(
          `<b>${p.district_name ?? "—"}, ${p.state}</b><br/>Sim risk: ${risk.toFixed(1)} &nbsp; Base: ${p.hex_risk ?? "—"}`
        );
        e.target.setStyle({ weight: 1.5, fillOpacity: 0.95 });
        e.target.bringToFront();
      },
      mouseout: (e: any) => {
        e.target.setStyle({ weight: 0.3, fillOpacity: 0.78 });
      },
    });
  }, []);

  // Preset / input helpers
  function applyPreset(id: string) {
    const p = PRESETS.find(p => p.id === id);
    if (!p) return;
    setInputs({ ...p.inputs });
    setActivePreset(id);
  }
  function resetInputs() { setInputs(DEFAULT_INPUTS); setActivePreset(null); }
  const setInput = (key: keyof SimInputs) => (v: number) => {
    setInputs(prev => ({ ...prev, [key]: v }));
    setActivePreset(null);
  };

  const selectedDistrict = selected ? districtMap.get(selected) : null;
  const isLoading = hexQ.isLoading;
  const scenarioLabel = activePreset
    ? PRESETS.find(p => p.id === activePreset)?.label ?? "Custom Scenario"
    : "Custom Scenario";

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">

      {/* Header */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur z-50 shrink-0">
        <div className="h-12 px-4 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2">
              <ArrowLeft className="h-3 w-3" />Home
            </Button>
          </Link>
          <div className="h-3 w-px bg-border/50" />
          <FlaskConical className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold">What-If Risk Simulator</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-violet-400 border-violet-500/40">
            SIMULATION
          </Badge>
          <div className="flex-1" />
          <ThemeToggle />
        </div>
      </header>

      {/* Banner */}
      <div className="bg-violet-500/10 border-b border-violet-500/30 px-4 py-1.5 flex items-center gap-2 text-xs text-violet-300 shrink-0">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        <span>
          <b>SIMULATION only — not a validated forecast.</b> Applies a uniform climate input to
          today's risk formulas. The "+2°C" preset is an illustration, not a modelled 2050 prediction.
          Present-day validated data is on the <Link href="/grid" className="underline">Hex Grid</Link>.
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left panel: controls ── */}
        <aside className="w-72 shrink-0 border-r border-border/40 flex flex-col overflow-y-auto">
          <div className="p-4 space-y-5">

            {/* Presets */}
            <section>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                Scenario Presets
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESETS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.id)}
                    className={`
                      flex flex-col items-start p-2 rounded-lg border text-left transition-all text-xs
                      ${activePreset === p.id
                        ? "border-violet-500/60 bg-violet-500/10 text-violet-300"
                        : "border-border/40 bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground"}
                    `}
                  >
                    <span className="text-base leading-none mb-1">{p.icon}</span>
                    <span className="font-semibold leading-tight">{p.label}</span>
                    <span className="text-[9px] mt-0.5 opacity-60 leading-tight">{p.note}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={resetInputs}
                className="mt-2 w-full flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground py-1.5 border border-border/30 rounded-md hover:border-border/60 transition-colors"
              >
                <RotateCcw className="h-3 w-3" /> Reset to baseline
              </button>
            </section>

            {/* Sliders */}
            <section className="space-y-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Manual Inputs
              </div>

              <Slider
                label="Rainfall (mm / day)"
                min={0} max={250} step={1}
                value={inputs.rainfall_mm} baseline={DEFAULT_INPUTS.rainfall_mm}
                onChange={setInput("rainfall_mm")}
                format={v => `${v} mm`}
              />
              <Slider
                label="Max temperature (°C)"
                min={20} max={50} step={0.5}
                value={inputs.tmax_c} baseline={DEFAULT_INPUTS.tmax_c}
                onChange={setInput("tmax_c")}
                format={v => `${v}°C`}
              />
              <Slider
                label="Consecutive hot days"
                min={1} max={10} step={1}
                value={inputs.hot_days} baseline={DEFAULT_INPUTS.hot_days}
                onChange={setInput("hot_days")}
                format={v => `${v}d`}
              />
              <Slider
                label="Humidity (%)"
                min={20} max={100} step={1}
                value={inputs.rh_pct} baseline={DEFAULT_INPUTS.rh_pct}
                onChange={setInput("rh_pct")}
                format={v => `${v}%`}
              />

              <div className="text-[9px] text-muted-foreground/60 space-y-0.5 pt-1">
                <div>Rainfall drives a U-curve: too low = drought ↑, too high = flood ↑</div>
                <div>Scores vary per hex by land use, terrain &amp; adaptive capacity</div>
              </div>
            </section>

            {/* Selected district drill-down */}
            {selectedDistrict && (
              <section className="border border-violet-500/30 rounded-lg p-3 bg-violet-500/5 space-y-2">
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <div className="text-sm font-bold">{selectedDistrict.name}</div>
                    <div className="text-[10px] text-muted-foreground">{selectedDistrict.state}</div>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >✕</button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-muted/40 rounded p-1.5">
                    <div className="text-[9px] text-muted-foreground">Baseline</div>
                    <div className="text-sm font-bold" style={{ color: riskColor(selectedDistrict.baseRisk) }}>
                      {selectedDistrict.baseRisk.toFixed(1)}
                    </div>
                  </div>
                  <div className="bg-muted/40 rounded p-1.5">
                    <div className="text-[9px] text-muted-foreground">Simulated</div>
                    <div className="text-sm font-bold" style={{ color: riskColor(selectedDistrict.simRisk) }}>
                      {selectedDistrict.simRisk.toFixed(1)}
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground space-y-0.5">
                  <div>Population: <span className="text-foreground font-medium">{fmt(selectedDistrict.totalPop)}</span></div>
                  <div>Children U5: <span className="text-red-400 font-medium">{fmt(selectedDistrict.totalCh5)}</span></div>
                  <div>
                    Risk delta:{" "}
                    <span className={`font-medium ${selectedDistrict.simRisk > selectedDistrict.baseRisk ? "text-orange-400" : "text-emerald-400"}`}>
                      {selectedDistrict.simRisk > selectedDistrict.baseRisk ? "+" : ""}
                      {(selectedDistrict.simRisk - selectedDistrict.baseRisk).toFixed(2)}
                    </span>
                  </div>
                </div>
              </section>
            )}

            {/* Legend */}
            <section>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                Risk Scale
              </div>
              <div className="flex h-2 rounded overflow-hidden">
                {Array.from({ length: 20 }, (_, i) => (
                  <div key={i} className="flex-1" style={{ background: riskColor(i * 0.5) }} />
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                <span>0 Low</span><span>5 High</span><span>10 Critical</span>
              </div>
            </section>

          </div>
        </aside>

        {/* ── Right panel: stats + map ── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Stats bar */}
          <div className="border-b border-border/40 bg-background/80 px-4 py-2.5 shrink-0">
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading 12,705 hexagons…
              </div>
            ) : stats ? (
              <div className="flex items-center gap-5 flex-wrap text-xs">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-muted-foreground">Under</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-violet-400 border-violet-500/40">
                    {scenarioLabel}
                  </Badge>
                </div>

                {stats.flippedCount > 0 ? (
                  <div className="flex items-baseline gap-1.5 shrink-0">
                    <span className="text-xl font-black text-red-400">▲ {stats.flippedCount}</span>
                    <span className="text-muted-foreground">districts → HIGH RISK</span>
                  </div>
                ) : (
                  <div className="text-muted-foreground shrink-0">
                    0 districts cross HIGH RISK threshold
                  </div>
                )}

                {stats.flippedCount > 0 && (
                  <>
                    <div className="h-4 w-px bg-border/50 shrink-0" />
                    <div className="shrink-0">
                      <span className="font-bold text-orange-400">+{fmt(stats.addlPeople)}</span>
                      <span className="text-muted-foreground ml-1">people</span>
                    </div>
                    <div className="shrink-0">
                      <span className="font-bold text-red-400">+{fmt(stats.addlCh5)}</span>
                      <span className="text-muted-foreground ml-1">children U5</span>
                    </div>
                  </>
                )}

                {stats.elevatedCount > 0 && (
                  <>
                    <div className="h-4 w-px bg-border/50 shrink-0" />
                    <div className="shrink-0 text-muted-foreground">
                      <span className="font-semibold text-amber-400">{stats.elevatedCount}</span>
                      {" "}districts elevated{" "}
                      <span className="text-[10px]">(+{fmt(stats.elevatedPeople)} people)</span>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>

          {/* Map — hex grid, canvas rendered, repainted in-place on slider change */}
          <div className="flex-1 relative">
            <MapContainer
              center={[22, 80]}
              zoom={5}
              style={{ height: "100%", width: "100%", background: "#0f172a" }}
              scrollWheelZoom
              maxBounds={[[6, 68], [37, 98]]}
              minZoom={4}
              maxZoom={10}
            >
              <SetupCanvas />
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              />
              {hexQ.data?.geoJson && (
                <GeoJSON
                  ref={geoJsonRef}
                  data={hexQ.data.geoJson}
                  style={styleFeature}
                  onEachFeature={onEachFeature}
                />
              )}
            </MapContainer>

            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
                  Building hex grid…
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
