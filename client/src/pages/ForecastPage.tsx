import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { Map as LeafletMap, GeoJSON as LeafletGeoJSONLayer } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cellToBoundary } from "h3-js";
import {
  ArrowLeft, AlertTriangle, Loader2, Radio, ChevronDown, ChevronRight,
  PanelLeftClose, PanelLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ForecastData {
  generated_at: string;
  days: string[];
  risk: Record<string, number[]>;
  dominant: Record<string, string[]>;
  alerts: Alert[];
}

interface Alert {
  h3_id: string; district: string; state: string; hazard: string;
  risk: number; day: number; date: string;
  rain_mm?: number; temp_c?: number; rh_pct?: number; wind_kmh?: number;
}

// ── Color ─────────────────────────────────────────────────────────────────────

const RISK_RAMP: [number,number,number][] = [[34,197,94],[234,179,8],[249,115,22],[239,68,68],[153,27,27]];

function lerp3(a: [number,number,number], b: [number,number,number], t: number) {
  return `rgb(${a.map((c,i) => Math.round(c + t * (b[i] - c))).join(",")})`;
}

function riskColor(t: number) {
  t = Math.max(0, Math.min(1, t));
  const s = t * (RISK_RAMP.length - 1);
  return lerp3(RISK_RAMP[Math.floor(s)], RISK_RAMP[Math.min(Math.floor(s) + 1, 4)], s - Math.floor(s));
}

const HAZARD_ICONS: Record<string, string> = {
  flood: "🌊", heat: "🔥", wetbulb: "💧", flashflood: "⚡",
  coldwave: "❄️", landslide: "🏔️", fire: "🔥", cyclone: "🌀", drought: "☀️",
};

const HAZARD_TYPES = ["all","flood","heat","wetbulb","flashflood","coldwave","landslide","fire"] as const;

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvasRenderer = L.canvas({ padding: 0.5 });
function SetupCanvas() {
  const map = useMap();
  useEffect(() => { (map as any).options.renderer = canvasRenderer; }, [map]);
  return null;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function ForecastSidebar({
  collapsed, onToggle, forecast, alerts,
  selectedDay, onDayChange,
  hazardFilter, onHazardChange,
  selectedState, states, onStateChange,
  minRisk, onMinRiskChange,
}: {
  collapsed: boolean; onToggle: () => void;
  forecast: ForecastData | undefined; alerts: Alert[];
  selectedDay: number; onDayChange: (d: number) => void;
  hazardFilter: string; onHazardChange: (h: string) => void;
  selectedState: string; states: string[]; onStateChange: (s: string) => void;
  minRisk: number; onMinRiskChange: (v: number) => void;
}) {
  const [alertsOpen, setAlertsOpen] = useState(true);
  const dayLabels = ["Today", "+1d", "+2d", "+3d", "+4d", "+5d", "+6d"];

  const dayAlerts = alerts.filter((a) => a.day === selectedDay);
  const base = dayAlerts.length > 0 ? dayAlerts : alerts.filter((a) => a.day <= 2);
  const display = hazardFilter === "all" ? base : base.filter((a) => a.hazard === hazardFilter);

  if (collapsed) {
    return (
      <div className="w-10 border-r border-border/40 bg-background flex flex-col items-center py-3 shrink-0">
        <button onClick={onToggle} className="text-muted-foreground hover:text-foreground mb-4">
          <PanelLeft className="h-4 w-4" />
        </button>
        <Radio className="h-4 w-4 text-red-500 animate-pulse mb-3" />
        <div className="text-[9px] text-red-400 font-bold">{display.length}</div>
      </div>
    );
  }

  return (
    <div className="w-72 border-r border-border/40 bg-background flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-red-500 animate-pulse" />
          <span className="text-sm font-semibold">Forecast</span>
          <Badge variant="outline" className="text-[9px] h-4 border-red-500/30 text-red-400 bg-red-500/10">LIVE</Badge>
        </div>
        <button onClick={onToggle} className="text-muted-foreground hover:text-foreground">
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Day selector */}
      {forecast && (
        <div className="px-3 py-2 border-b border-border/30">
          <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Forecast Day</div>
          <div className="grid grid-cols-7 gap-1">
            {forecast.days.map((date, i) => (
              <button key={date} onClick={() => onDayChange(i)}
                className={`py-1 rounded text-center text-[10px] font-semibold transition-colors ${
                  selectedDay === i ? "bg-red-600 text-white" : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}>
                <div>{dayLabels[i]}</div>
                <div className="text-[8px] opacity-70">{date.slice(5)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hazard filter */}
      <div className="px-3 py-2 border-b border-border/30">
        <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Hazard Type</div>
        <div className="flex flex-wrap gap-1">
          {HAZARD_TYPES.map((h) => (
            <button key={h} onClick={() => onHazardChange(h)}
              className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                hazardFilter === h ? "bg-red-600 text-white" : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}>
              {h === "all" ? "All" : `${HAZARD_ICONS[h] || ""} ${h}`}
            </button>
          ))}
        </div>
      </div>

      {/* State + Min risk */}
      <div className="px-3 py-2 border-b border-border/30 space-y-2">
        <div className="relative">
          <ChevronDown className="pointer-events-none absolute right-2 top-1.5 h-3 w-3 text-muted-foreground" />
          <select value={selectedState} onChange={(e) => onStateChange(e.target.value)}
            className="w-full appearance-none rounded-md border border-border/50 bg-muted/40 pl-2 pr-6 py-1 text-xs outline-none cursor-pointer text-foreground">
            <option value="All India">All India</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground shrink-0">Min risk</span>
          <input type="range" min={0} max={5} step={0.1} value={minRisk}
            onChange={(e) => onMinRiskChange(parseFloat(e.target.value))}
            className="flex-1 h-1 accent-red-500" />
          <span className="text-[10px] font-mono font-semibold text-red-400 w-6">{minRisk.toFixed(1)}</span>
        </div>
      </div>

      {/* Alerts */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <button onClick={() => setAlertsOpen((v) => !v)}
          className="px-3 py-2 flex items-center gap-2 border-b border-border/20 hover:bg-muted/30">
          {alertsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <AlertTriangle className="h-3 w-3 text-red-400" />
          <span className="text-[11px] font-semibold flex-1 text-left">Alerts</span>
          <Badge variant="outline" className="text-[9px] h-4 border-red-500/30 text-red-400">{display.length}</Badge>
        </button>
        {alertsOpen && (
          <div className="overflow-y-auto flex-1">
            {display.length === 0 ? (
              <div className="px-3 py-4 text-center text-[10px] text-muted-foreground">No alerts above threshold</div>
            ) : display.slice(0, 30).map((a) => (
              <div key={`${a.h3_id}-${a.hazard}-${a.day}`} className="px-3 py-2 border-b border-border/20 last:border-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{HAZARD_ICONS[a.hazard] || "⚠️"}</span>
                  <span className="text-[11px] font-semibold flex-1 truncate">{a.district}</span>
                  <span className="text-[11px] font-mono font-bold" style={{ color: riskColor(a.risk / 10) }}>{a.risk}</span>
                </div>
                <div className="text-[9px] text-muted-foreground mt-0.5">
                  {a.state} · {a.hazard}
                  {a.rain_mm ? ` · ${a.rain_mm}mm` : ""}
                  {a.temp_c ? ` · ${a.temp_c}°C` : ""}
                  {a.rh_pct ? ` · ${a.rh_pct}%RH` : ""}
                  {" · "}{a.date}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {forecast && (
        <div className="px-3 py-1.5 border-t border-border/30 bg-muted/20">
          <div className="text-[9px] text-muted-foreground">
            Open-Meteo (ECMWF/GFS) · {new Date(forecast.generated_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Map ───────────────────────────────────────────────────────────────────────

function ForecastMap({
  geoData, forecast, selectedDay, selectedState, hazardFilter, minRisk, mapRef,
}: {
  geoData: any; forecast: ForecastData; selectedDay: number;
  selectedState: string; hazardFilter: string; minRisk: number;
  mapRef: React.MutableRefObject<LeafletMap | null>;
}) {
  const geoJsonRef = useRef<LeafletGeoJSONLayer | null>(null);

  const filtered = useMemo(() => {
    if (!geoData) return null;
    let feats = geoData.features;
    if (selectedState !== "All India")
      feats = feats.filter((f: any) => f.properties.state === selectedState);
    if (hazardFilter !== "all")
      feats = feats.filter((f: any) => {
        const dom = forecast.dominant[f.properties.h3_id];
        return dom && dom[selectedDay] === hazardFilter;
      });
    if (minRisk > 0)
      feats = feats.filter((f: any) => {
        const risks = forecast.risk[f.properties.h3_id];
        return risks && risks[selectedDay] >= minRisk;
      });
    return { ...geoData, features: feats };
  }, [geoData, selectedState, hazardFilter, minRisk, forecast, selectedDay]);

  const styleFeature = useCallback((feature: any) => {
    const risks = forecast.risk[feature.properties.h3_id];
    const val = risks ? risks[selectedDay] ?? 0 : 0;
    return {
      fillColor: riskColor(val / 10),
      fillOpacity: 0.75, color: "#64748b", weight: 0.3, renderer: canvasRenderer,
    };
  }, [forecast, selectedDay]);

  useEffect(() => { geoJsonRef.current?.setStyle(styleFeature); }, [styleFeature]);

  const onEachFeature = useCallback((feature: any, layer: any) => {
    const p = feature.properties;
    const risks = forecast.risk[p.h3_id];
    const dominant = forecast.dominant[p.h3_id];
    const val = risks ? risks[selectedDay] ?? 0 : 0;
    const haz = dominant ? dominant[selectedDay] ?? "" : "";
    layer.bindTooltip(`<b>${p.district_name || ""}, ${p.state}</b><br/>${HAZARD_ICONS[haz] || ""} ${haz} risk: ${val}`, { sticky: true });
  }, [forecast, selectedDay]);

  if (!filtered) return null;

  return (
    <MapContainer center={[22.5, 80]} zoom={5} style={{ height: "100%", width: "100%" }}
      scrollWheelZoom maxBounds={[[6,68],[37,98]]} minZoom={4} maxZoom={10} ref={mapRef}>
      <SetupCanvas />
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        attribution='&copy; OSM &copy; CARTO' />
      <GeoJSON ref={geoJsonRef} key={`${selectedState}-${hazardFilter}-${minRisk}-${selectedDay}`}
        data={filtered} style={styleFeature} onEachFeature={onEachFeature} />
    </MapContainer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ForecastPage() {
  const [selectedDay, setSelectedDay]     = useState(0);
  const [selectedState, setSelectedState] = useState("All India");
  const [hazardFilter, setHazardFilter]   = useState("all");
  const [minRisk, setMinRisk]             = useState(0);
  const [sidebarOpen, setSidebarOpen]     = useState(window.innerWidth > 768);
  const mapRef = useRef<LeafletMap | null>(null);

  const hexQ = useQuery<any>({
    queryKey: ["india-hex-props-forecast"],
    queryFn: async () => {
      try {
        const props: any[] = await fetch("/data/india_hex_props.json").then((r) => r.json());
        const features = props.map((p) => {
          const boundary = cellToBoundary(p.h3_id);
          const coords = boundary.map(([lat, lng]: [number, number]) => [lng, lat]);
          coords.push(coords[0]);
          return { type: "Feature", properties: p, geometry: { type: "Polygon", coordinates: [coords] } };
        });
        return { type: "FeatureCollection", features };
      } catch {
        console.warn("h3-js failed, falling back to GeoJSON");
        return fetch("/data/india_hex_grid.geojson").then((r) => r.json());
      }
    },
    staleTime: Infinity,
    retry: 1,
  });

  const forecastQ = useQuery<ForecastData>({
    queryKey: ["forecast-risk"],
    queryFn: () => fetch("/data/forecast_risk.json").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const features: any[] = hexQ.data?.features ?? [];
  const stateList = useMemo(
    () => Array.from(new Set(features.map((f: any) => f.properties.state).filter(Boolean))).sort() as string[],
    [features]
  );

  const loading = hexQ.isLoading || forecastQ.isLoading;
  const error = hexQ.isError || forecastQ.isError;

  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <ForecastSidebar
        collapsed={!sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)}
        forecast={forecastQ.data} alerts={forecastQ.data?.alerts ?? []}
        selectedDay={selectedDay} onDayChange={setSelectedDay}
        hazardFilter={hazardFilter} onHazardChange={setHazardFilter}
        selectedState={selectedState} states={stateList} onStateChange={setSelectedState}
        minRisk={minRisk} onMinRiskChange={setMinRisk}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-10 px-3 border-b border-border/40 flex items-center gap-3 bg-background/95 backdrop-blur z-50 shrink-0">
          <Link href="/"><Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2"><ArrowLeft className="h-3 w-3" />Home</Button></Link>
          <div className="h-3 w-px bg-border/50" />
          <span className="text-xs font-semibold">Forecast Early Warning</span>
          <div className="flex-1" />
          <Link href="/grid" className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold">← Hex Grid</Link>
          <ThemeToggle />
        </header>

        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading forecast…
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-red-400 text-sm">
              <AlertTriangle className="h-5 w-5" /> Failed to load forecast
            </div>
          ) : forecastQ.data && hexQ.data ? (
            <ForecastMap
              geoData={hexQ.data} forecast={forecastQ.data}
              selectedDay={selectedDay} selectedState={selectedState}
              hazardFilter={hazardFilter} minRisk={minRisk} mapRef={mapRef}
            />
          ) : null}

          {/* Legend */}
          <div className="absolute bottom-8 left-3 z-[800]">
            <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg p-2.5 shadow-lg w-40">
              <p className="text-[10px] font-semibold mb-1">Forecast Risk (0–10)</p>
              <div className="h-2.5 w-full rounded-sm mb-1"
                style={{ background: `linear-gradient(to right, ${Array.from({length:5},(_,i)=>riskColor(i/4)).join(",")})` }} />
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>0 Safe</span><span>10 Extreme</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
