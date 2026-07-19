import React, { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "wouter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Grid3X3, AlertTriangle, ArrowLeft, Radio, Activity,
  Thermometer, Droplets, Wind, MapPin, ChevronRight,
} from "lucide-react";

import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
L.Marker.prototype.options.icon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });

type Mode = "HAZARD" | "EXPOSURE" | "VULNERABILITY";

const HAZARD_ICONS: Record<string, React.ReactElement> = {
  flood: <Droplets className="w-3 h-3" />,
  heatwave: <Thermometer className="w-3 h-3" />,
  drought: <Activity className="w-3 h-3" />,
  coldwave: <Wind className="w-3 h-3" />,
  cyclone: <Wind className="w-3 h-3" />,
};

function scoreToColor(val: number, min: number, max: number): string {
  const t = Math.max(0, Math.min(1, (val - min) / (max - min)));
  if (t < 0.25) return "#22c55e";
  if (t < 0.5) return "#eab308";
  if (t < 0.75) return "#f97316";
  return "#ef4444";
}

const MODE_RANGE: Record<Mode, [number, number]> = {
  HAZARD: [0.02, 0.52],
  EXPOSURE: [0.21, 0.58],
  VULNERABILITY: [0, 1],
};

const MODE_LABELS: Record<Mode, string> = {
  HAZARD: "Hazard Index",
  EXPOSURE: "Exposure Index",
  VULNERABILITY: "Vulnerability Index",
};

function KpiBanner({ hexProps }: { hexProps: any[] }) {
  const total = hexProps.length;
  const totalPop = hexProps.reduce((s, p) => s + (p.population || 0), 0);
  const avgRisk = hexProps.reduce((s, p) => s + (p.hex_risk || 0), 0) / total;
  const critical = hexProps.filter(p => (p.hex_risk || 0) >= 7).length;
  const high = hexProps.filter(p => (p.hex_risk || 0) >= 5 && (p.hex_risk || 0) < 7).length;
  const cascades = hexProps.filter(p => (p.cascade_count || 0) > 0).length;

  const kpis = [
    { label: "Hex cells", value: total.toLocaleString(), color: "text-foreground" },
    { label: "Population", value: (totalPop / 1e9).toFixed(2) + "B", color: "text-foreground" },
    { label: "Avg risk", value: avgRisk.toFixed(1) + "/10", color: "text-amber-500" },
    { label: "Critical (≥7)", value: critical.toLocaleString(), color: "text-red-500" },
    { label: "High (5–7)", value: high.toLocaleString(), color: "text-orange-400" },
    { label: "WASH cascades", value: cascades.toLocaleString(), color: "text-violet-400" },
  ];

  return (
    <div className="w-full bg-emerald-500/10 border-b border-emerald-500/30 px-4 py-2">
      <div className="flex items-center gap-6 flex-wrap">
        <span className="text-[11px] font-semibold text-emerald-400 shrink-0">National Overview</span>
        {kpis.map(k => (
          <div key={k.label} className="flex items-center gap-1.5 text-[11px]">
            <span className="text-muted-foreground">{k.label}:</span>
            <span className={`font-semibold ${k.color}`}>{k.value}</span>
          </div>
        ))}
        <div className="flex-1" />
        <Link href="/grid" className="text-emerald-400 hover:text-emerald-300 text-[11px] font-semibold">Hex Grid →</Link>
        <Link href="/forecast" className="text-red-400 hover:text-red-300 text-[11px] font-semibold">Forecast →</Link>
      </div>
    </div>
  );
}

function DistrictDetail({ feature, onClose }: { feature: any; onClose: () => void }) {
  const p = feature.properties;
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-semibold text-foreground">{p.NAME}</div>
          <div className="text-xs text-muted-foreground">{p.STATE}</div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        {[
          { label: "Hazard", val: p.HAZARD, range: MODE_RANGE.HAZARD },
          { label: "Exposure", val: p.EXPOSURE, range: MODE_RANGE.EXPOSURE },
          { label: "Vulnerability", val: p.VULNERABILITY, range: MODE_RANGE.VULNERABILITY },
          { label: "Risk", val: p.RISK, range: [0, 0.09] as [number, number] },
        ].map(({ label, val, range }) => {
          const pct = Math.round(((val - range[0]) / (range[1] - range[0])) * 100);
          return (
            <div key={label}>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono">{val.toFixed(3)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(2, pct)}%`, background: scoreToColor(val, range[0], range[1]) }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <Link href={`/report/${encodeURIComponent(p.NAME)}`}>
        <Button size="sm" variant="outline" className="w-full mt-3 text-xs gap-1">
          <ChevronRight className="w-3 h-3" /> Full Report
        </Button>
      </Link>
    </div>
  );
}

function TopStates({ hexProps }: { hexProps: any[] }) {
  const byState = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const p of hexProps) {
      const s = p.state || "Unknown";
      if (!map[s]) map[s] = [];
      map[s].push(p.hex_risk || 0);
    }
    return Object.entries(map)
      .map(([state, risks]) => ({ state, avg: risks.reduce((a, b) => a + b, 0) / risks.length, count: risks.length }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 8);
  }, [hexProps]);

  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Top States by Risk</div>
      <div className="space-y-1.5">
        {byState.map(({ state, avg }, i) => (
          <div key={state} className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground w-4 shrink-0">{i + 1}.</span>
            <span className="flex-1 truncate text-foreground">{state}</span>
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(avg / 10) * 100}%`, background: scoreToColor(avg, 0, 10) }} />
            </div>
            <span className="font-mono text-[10px] w-6 text-right" style={{ color: scoreToColor(avg, 0, 10) }}>{avg.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertsList({ alerts }: { alerts: any[] }) {
  const top = useMemo(() =>
    [...alerts].sort((a, b) => b.risk - a.risk).slice(0, 8),
    [alerts]
  );

  if (!top.length) return null;

  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Radio className="w-3 h-3 animate-pulse text-red-400" /> Forecast Alerts (7-day)
      </div>
      <div className="space-y-1.5">
        {top.map((a, i) => (
          <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/40">
            <span className="text-muted-foreground">{HAZARD_ICONS[a.hazard] || <AlertTriangle className="w-3 h-3" />}</span>
            <div className="flex-1 min-w-0">
              <div className="truncate text-foreground font-medium">{a.district}</div>
              <div className="text-muted-foreground text-[10px] capitalize">{a.hazard} · Day {a.day}</div>
            </div>
            <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0" style={{ color: scoreToColor(a.risk, 0, 10), borderColor: scoreToColor(a.risk, 0, 10) }}>
              {a.risk.toFixed(1)}
            </Badge>
          </div>
        ))}
      </div>
      <Link href="/forecast" className="flex items-center gap-1 mt-2 text-[11px] text-red-400 hover:text-red-300">
        All forecasts <ChevronRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

function IndiaMap({ geoData, mode, onSelect }: { geoData: any; mode: Mode; onSelect: (f: any) => void }) {
  const style = useCallback((feature: any) => ({
    fillColor: scoreToColor(feature.properties[mode], MODE_RANGE[mode][0], MODE_RANGE[mode][1]),
    fillOpacity: 0.65,
    color: "#1e293b",
    weight: 0.8,
  }), [mode]);

  const onEachFeature = useCallback((feature: any, layer: L.Layer) => {
    (layer as L.Path).on({
      click: () => onSelect(feature),
      mouseover: (e) => {
        e.target.setStyle({ fillOpacity: 0.9, weight: 2, color: "#e2e8f0" });
        e.target.bringToFront();
      },
      mouseout: (e) => {
        e.target.setStyle({ fillOpacity: 0.65, weight: 0.8, color: "#1e293b" });
      },
    });
  }, [onSelect]);

  return (
    <MapContainer
      center={[22.5, 82]}
      zoom={5}
      className="w-full h-full"
      scrollWheelZoom={true}
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; CartoDB'
      />
      {geoData && (
        <GeoJSON
          key={mode}
          data={geoData}
          style={style}
          onEachFeature={onEachFeature}
        />
      )}
    </MapContainer>
  );
}

export default function Dashboard() {
  const [mode, setMode] = useState<Mode>("HAZARD");
  const [selected, setSelected] = useState<any | null>(null);

  const hexQ = useQuery<any[]>({
    queryKey: ["india-hex-props-raw"],
    queryFn: () => fetch("/data/india_hex_props.json").then(r => r.json()),
    staleTime: Infinity,
  });

  const geoQ = useQuery<any>({
    queryKey: ["india-geojson"],
    queryFn: () => fetch("/data/india.json").then(r => r.json()),
    staleTime: Infinity,
  });

  const forecastQ = useQuery<any>({
    queryKey: ["forecast-risk"],
    queryFn: () => fetch("/data/forecast_risk.json").then(r => r.json()),
    staleTime: Infinity,
  });

  const alerts = forecastQ.data?.alerts ?? [];
  const hexProps = hexQ.data ?? [];

  return (
    <div className="h-screen w-full bg-background flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
              <ArrowLeft className="w-3.5 h-3.5" /> Home
            </Button>
          </Link>
          <span className="text-sm font-semibold text-foreground">Climate Risk Dashboard</span>
          <Badge variant="secondary" className="text-[10px]">India · 735 Districts</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/grid">
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
              <Grid3X3 className="w-3.5 h-3.5 text-teal-500" /> Hex Grid
            </Button>
          </Link>
          <Link href="/forecast">
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
              <Radio className="w-3.5 h-3.5 text-red-400 animate-pulse" /> Forecast
            </Button>
          </Link>
          <ThemeToggle />
        </div>
      </div>

      {/* KPI banner */}
      {hexProps.length > 0 && <KpiBanner hexProps={hexProps} />}

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <div className="w-72 shrink-0 border-r border-border/50 flex flex-col overflow-y-auto p-3 gap-4 bg-card/30">
          {/* Mode toggle */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Map Layer</div>
            <div className="flex flex-col gap-1">
              {(["HAZARD", "EXPOSURE", "VULNERABILITY"] as Mode[]).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setSelected(null); }}
                  className={`text-left px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                    mode === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 hover:bg-muted text-foreground"
                  }`}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
              <div className="flex gap-0.5 items-center">
                {["#22c55e", "#eab308", "#f97316", "#ef4444"].map(c => (
                  <div key={c} className="w-5 h-2 rounded-sm" style={{ background: c }} />
                ))}
              </div>
              <span>Low → High</span>
            </div>
          </div>

          {/* Selected district */}
          {selected && (
            <DistrictDetail feature={selected} onClose={() => setSelected(null)} />
          )}

          {/* Top states (when no district selected) */}
          {!selected && hexProps.length > 0 && <TopStates hexProps={hexProps} />}

          {/* Alerts */}
          <AlertsList alerts={alerts} />

          <div className="mt-auto pt-2 border-t border-border/50">
            <Link href="/simulator">
              <Button variant="outline" size="sm" className="w-full text-xs gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> What-If Simulator
              </Button>
            </Link>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          {geoQ.isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10 text-sm text-muted-foreground">
              Loading map…
            </div>
          )}
          <IndiaMap
            geoData={geoQ.data ?? null}
            mode={mode}
            onSelect={setSelected}
          />
          {/* Mode legend overlay */}
          <div className="absolute bottom-4 right-4 z-[400] bg-background/90 border border-border rounded-md px-3 py-2 text-xs shadow-lg">
            <div className="font-semibold text-foreground mb-1">{MODE_LABELS[mode]}</div>
            <div className="flex items-center gap-1">
              <div className="flex gap-0.5">
                {["#22c55e", "#eab308", "#f97316", "#ef4444"].map(c => (
                  <div key={c} className="w-6 h-2 rounded-sm" style={{ background: c }} />
                ))}
              </div>
            </div>
            <div className="flex justify-between mt-0.5 text-[10px] text-muted-foreground">
              <span>Low</span><span>High</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
