import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Circle, Tooltip, useMap } from "react-leaflet";
import type { Map as LeafletMap, GeoJSON as LeafletGeoJSONLayer } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cellToBoundary } from "h3-js";
import {
  ArrowLeft, AlertTriangle, Loader2, Radio, ChevronDown, ChevronRight,
  PanelLeftClose, PanelLeft, Waves, TrendingDown, TrendingUp, Minus,
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

interface RiverDay {
  date: string; discharge: number;
  p25: number | null; p75: number | null;
  severity: string;
}

interface RiverPoint {
  lat: number; lon: number;
  river: string; location: string;
  current_discharge: number;
  current_severity: string;
  max_severity_7d: string;
  days: RiverDay[];
}

interface RiverForecast {
  generated: string;
  points: RiverPoint[];
  summary: Record<string, number>;
}

interface RiverHistoryPoint {
  lat: number; lon: number; river: string; location: string;
  trend: "declining" | "stable" | "increasing";
  pct_per_decade: number;
  flow_regime: "perennial" | "seasonal" | "intermittent";
  peak_month: number; dry_month: number;
  seasonality_ratio: number;
  enso_sensitivity: "high" | "medium" | "low";
  en_drop_pct: number;
  p10: number; p50: number; p90: number;
  overall_mean: number; early_mean: number; recent_mean: number;
  decadal_change_pct: number;
  annual_means: Record<string, number>;
  monthly_clim: Record<string, number>;
}

interface RiverHistory {
  generated: string;
  period: { start: string; end: string };
  points: RiverHistoryPoint[];
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

const HAZARD_TYPES = ["all","flood","heat","wetbulb","flashflood","coldwave","landslide","fire","cyclone","drought"] as const;

// ── River severity styles ─────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  extreme: "#7f1d1d",
  danger:  "#dc2626",
  warning: "#f97316",
  elevated:"#eab308",
  normal:  "#22c55e",
  unknown: "#6b7280",
};

const SEV_LABEL: Record<string, string> = {
  extreme: "EXTREME", danger: "DANGER", warning: "WARNING",
  elevated: "ELEVATED", normal: "Normal", unknown: "Unknown",
};

const SEV_ORDER = ["unknown","normal","elevated","warning","danger","extreme"];

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvasRenderer = L.canvas({ padding: 0.5 });
function SetupCanvas() {
  const map = useMap();
  useEffect(() => { (map as any).options.renderer = canvasRenderer; }, [map]);
  return null;
}

// ── River layer on map ────────────────────────────────────────────────────────

function RiverLayer({ points, showRivers }: { points: RiverPoint[]; showRivers: boolean }) {
  if (!showRivers) return null;
  return (
    <>
      {points.map((pt, i) => {
        const sev = pt.max_severity_7d;
        const color = SEV_COLOR[sev] || "#6b7280";
        const radius = sev === "extreme" ? 12 : sev === "danger" ? 10 : sev === "warning" ? 8 : 6;
        const today = pt.days.find(d => d.discharge === pt.current_discharge) ?? pt.days[0];
        return (
          <CircleMarker
            key={i}
            center={[pt.lat, pt.lon]}
            radius={radius}
            pathOptions={{ fillColor: color, color: "#fff", weight: 1.5, fillOpacity: 0.9 }}
          >
            <Tooltip sticky>
              <div className="text-xs">
                <div className="font-bold">{pt.river} @ {pt.location}</div>
                <div style={{ color }} className="font-bold">{SEV_LABEL[sev]}</div>
                <div>Now: {pt.current_discharge.toLocaleString()} m³/s</div>
                {today?.p75 && <div>p75: {today.p75.toLocaleString()} m³/s</div>}
                <div className="text-gray-400 mt-0.5 text-[10px]">GloFAS · 7-day max severity</div>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}

// ── River line overlay — real river geometry, colored by nearest gauge ────────
// The 150 GloFAS sample points are discrete readings on the channel, not the
// channel itself. This draws the actual river course (OSM linework, already
// used on /grid as india_rivers.geojson) and colors each stretch by whichever
// forecast gauge is nearest to it, so "where along the river" has an answer
// beyond isolated dots. A stretch farther than RIVER_MATCH_KM from any gauge
// has no reading and stays neutral — we don't extrapolate severity onto rivers
// we aren't monitoring.

const RIVER_MATCH_KM = 80;

function approxKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = (lat1 - lat2) * 111.32;
  const dLon = (lon1 - lon2) * 111.32 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function sampleCoords(coords: [number, number][], n = 6): [number, number][] {
  if (coords.length <= n) return coords;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) out.push(coords[Math.round((i * (coords.length - 1)) / (n - 1))]);
  return out;
}

function nearestGauge(coords: [number, number][], points: RiverPoint[]): { pt: RiverPoint; distKm: number } | null {
  let best: { pt: RiverPoint; distKm: number } | null = null;
  for (const [lng, lat] of sampleCoords(coords)) {
    for (const pt of points) {
      const d = approxKm(lat, lng, pt.lat, pt.lon);
      if (!best || d < best.distKm) best = { pt, distKm: d };
    }
  }
  return best && best.distKm <= RIVER_MATCH_KM ? best : null;
}

function RiverLineOverlay({ show, points }: { show: boolean; points: RiverPoint[] | undefined }) {
  const riversQ = useQuery<any>({
    queryKey: ["india-rivers-lines"],
    queryFn: () => fetch("/data/india_rivers.geojson").then((r) => r.json()),
    staleTime: Infinity,
    enabled: show,
  });

  const riverStyle = useCallback((feature: any) => {
    const coords = feature.geometry.coordinates as [number, number][];
    const match = points && points.length ? nearestGauge(coords, points) : null;
    if (match) {
      const sev = match.pt.max_severity_7d;
      return {
        color: SEV_COLOR[sev] || "#3b82f6",
        weight: sev === "extreme" ? 3.5 : sev === "danger" ? 3 : sev === "warning" ? 2.2 : 1.6,
        opacity: 0.85,
      };
    }
    return { color: "#3b82f6", weight: 1, opacity: 0.3 };
  }, [points]);

  const onEachRiver = useCallback((feature: any, layer: any) => {
    const name = feature.properties?.name || "River";
    const coords = feature.geometry.coordinates as [number, number][];
    const match = points && points.length ? nearestGauge(coords, points) : null;
    const label = match
      ? `${name} — nearest gauge (${Math.round(match.distKm)}km): ${SEV_LABEL[match.pt.max_severity_7d]}`
      : `${name} — no nearby gauge`;
    layer.bindTooltip(label, { sticky: true, className: "text-[10px]" });
  }, [points]);

  if (!show || !riversQ.data) return null;
  return <GeoJSON key="river-lines" data={riversQ.data} style={riverStyle} onEachFeature={onEachRiver} />;
}

// ── Flood watch zones — approximate radius around danger/extreme gauges ───────
// NOT a modeled flood extent (that needs a DEM-based inundation model we don't
// run). This is a plain proximity buffer around the gauges currently reading
// danger/extreme, labeled as such, so "roughly which stretch to watch" has a
// visual answer without overclaiming precision we don't have.

function FloodWatchZones({ show, points }: { show: boolean; points: RiverPoint[] | undefined }) {
  if (!show || !points) return null;
  const watch = points.filter((p) => p.max_severity_7d === "danger" || p.max_severity_7d === "extreme");
  return (
    <>
      {watch.map((pt, i) => (
        <Circle
          key={`watch-${i}`}
          center={[pt.lat, pt.lon]}
          radius={35000}
          pathOptions={{
            color: SEV_COLOR[pt.max_severity_7d], weight: 1.5, dashArray: "6 5",
            fillColor: SEV_COLOR[pt.max_severity_7d], fillOpacity: 0.08,
          }}
        >
          <Tooltip sticky>
            <div className="text-xs">
              <div className="font-bold">{pt.river} @ {pt.location}</div>
              <div style={{ color: SEV_COLOR[pt.max_severity_7d] }} className="font-bold">{SEV_LABEL[pt.max_severity_7d]}</div>
              <div className="text-gray-400 mt-0.5 text-[10px]">Approximate 35km watch radius around this gauge — not a modeled flood extent</div>
            </div>
          </Tooltip>
        </Circle>
      ))}
    </>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function ForecastSidebar({
  collapsed, onToggle, forecast, alerts,
  selectedDay, onDayChange,
  hazardFilter, onHazardChange,
  selectedState, states, onStateChange,
  minRisk, onMinRiskChange,
  riverForecast, riverForecastError, showRivers, onToggleRivers,
}: {
  collapsed: boolean; onToggle: () => void;
  forecast: ForecastData | undefined; alerts: Alert[];
  selectedDay: number; onDayChange: (d: number) => void;
  hazardFilter: string; onHazardChange: (h: string) => void;
  selectedState: string; states: string[]; onStateChange: (s: string) => void;
  minRisk: number; onMinRiskChange: (v: number) => void;
  riverForecast: RiverForecast | undefined; riverForecastError: boolean;
  showRivers: boolean; onToggleRivers: () => void;
}) {
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [riverOpen, setRiverOpen]   = useState(true);
  const dayLabels = ["Today", "+1d", "+2d", "+3d", "+4d", "+5d", "+6d"];

  const dayAlerts = alerts.filter((a) => a.day === selectedDay);
  const display = hazardFilter === "all" ? dayAlerts : dayAlerts.filter((a) => a.hazard === hazardFilter);

  const riverAlerts = useMemo(() => {
    if (!riverForecast) return [];
    return [...riverForecast.points]
      .filter(p => SEV_ORDER.indexOf(p.max_severity_7d) >= SEV_ORDER.indexOf("warning"))
      .sort((a,b) => SEV_ORDER.indexOf(b.max_severity_7d) - SEV_ORDER.indexOf(a.max_severity_7d));
  }, [riverForecast]);

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
          {(() => {
            if (!forecast?.generated_at) return null;
            const ageHours = (Date.now() - new Date(forecast.generated_at).getTime()) / 3_600_000;
            return ageHours < 36
              ? <Badge variant="outline" className="text-[9px] h-4 border-red-500/30 text-red-400 bg-red-500/10">LIVE</Badge>
              : <Badge variant="outline" className="text-[9px] h-4 border-amber-500/30 text-amber-400 bg-amber-500/10" title={`Updated ${Math.round(ageHours/24)}d ago`}>STALE</Badge>;
          })()}
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

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto flex flex-col">

        {/* River Discharge section */}
        <div className="border-b border-border/20">
          <button onClick={() => setRiverOpen((v) => !v)}
            className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/30">
            {riverOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Waves className="h-3 w-3 text-blue-400" />
            <span className="text-[11px] font-semibold flex-1 text-left">River Discharge</span>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleRivers(); }}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${
                showRivers ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"
              }`}
            >
              {showRivers ? "ON" : "OFF"}
            </button>
            {riverForecast && (
              <Badge variant="outline" className="text-[9px] h-4 border-blue-500/30 text-blue-400 ml-1">
                {riverAlerts.length} alerts
              </Badge>
            )}
          </button>

          {riverOpen && (
            <div className="pb-1">
              {riverForecastError ? (
                <div className="px-3 py-3 text-center text-[10px] text-red-400">Failed to load river data</div>
              ) : !riverForecast ? (
                <div className="px-3 py-3 text-center text-[10px] text-muted-foreground">Loading river data…</div>
              ) : riverAlerts.length === 0 ? (
                <div className="px-3 py-3 text-center text-[10px] text-muted-foreground">All rivers normal</div>
              ) : (
                riverAlerts.map((pt, i) => (
                  <div key={i} className="px-3 py-2 border-b border-border/10 last:border-0">
                    <div className="flex items-center gap-1.5">
                      <Waves className="h-3 w-3 shrink-0" style={{ color: SEV_COLOR[pt.max_severity_7d] }} />
                      <span className="text-[11px] font-semibold flex-1 truncate">{pt.river}</span>
                      <span className="text-[10px] font-bold" style={{ color: SEV_COLOR[pt.max_severity_7d] }}>
                        {SEV_LABEL[pt.max_severity_7d]}
                      </span>
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      <span>@ {pt.location}</span>
                      <span>·</span>
                      <span className="font-mono">{pt.current_discharge.toLocaleString()} m³/s</span>
                    </div>
                    {/* Mini discharge bar */}
                    <div className="mt-1.5 flex gap-0.5">
                      {pt.days.map((d, j) => (
                        <div key={j} className="flex-1 h-3 rounded-sm relative group cursor-default"
                          style={{ backgroundColor: SEV_COLOR[d.severity] + "99" }}
                          title={`${d.date}: ${d.discharge} m³/s (${d.severity})`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between text-[8px] text-muted-foreground mt-0.5">
                      <span>Today</span><span>+6d</span>
                    </div>
                  </div>
                ))
              )}
              {riverForecast && (
                <div className="px-3 py-1.5 text-[9px] text-muted-foreground flex items-center justify-between">
                  <span>GloFAS (Open-Meteo) · {riverForecast.points.length} rivers</span>
                  <span>{new Date(riverForecast.generated).toLocaleDateString("en-IN", { day:"numeric", month:"short"})}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hazard Alerts section */}
        <div className="flex flex-col flex-1">
          <button onClick={() => setAlertsOpen((v) => !v)}
            className="px-3 py-2 flex items-center gap-2 border-b border-border/20 hover:bg-muted/30">
            {alertsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <AlertTriangle className="h-3 w-3 text-red-400" />
            <span className="text-[11px] font-semibold flex-1 text-left">Weather Hazard Alerts</span>
            <Badge variant="outline" className="text-[9px] h-4 border-red-500/30 text-red-400">{display.length}</Badge>
          </button>
          {alertsOpen && (
            <div className="overflow-y-auto">
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
  riverForecast, showRivers,
}: {
  geoData: any; forecast: ForecastData; selectedDay: number;
  selectedState: string; hazardFilter: string; minRisk: number;
  mapRef: React.MutableRefObject<LeafletMap | null>;
  riverForecast: RiverForecast | undefined; showRivers: boolean;
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
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution='&copy; Esri, HERE, Garmin, FAO, NOAA, USGS, &copy; OpenStreetMap contributors' />
      <GeoJSON ref={geoJsonRef} key={`${selectedState}-${hazardFilter}-${minRisk}-${selectedDay}`}
        data={filtered} style={styleFeature} onEachFeature={onEachFeature} />
      <RiverLineOverlay show={showRivers} points={riverForecast?.points} />
      <FloodWatchZones show={showRivers} points={riverForecast?.points} />
      {riverForecast && (
        <RiverLayer points={riverForecast.points} showRivers={showRivers} />
      )}
    </MapContainer>
  );
}

// ── River legend ──────────────────────────────────────────────────────────────

function RiverLegend({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg p-2.5 shadow-lg">
      <p className="text-[10px] font-semibold mb-1.5 flex items-center gap-1"><Waves className="h-3 w-3 text-blue-400" /> River Discharge</p>
      {[["extreme","Extreme"],["danger","Danger"],["warning","Warning"],["elevated","Elevated"],["normal","Normal"]].map(([k,l]) => (
        <div key={k} className="flex items-center gap-1.5 mb-0.5">
          <div className="w-3 h-3 rounded-full border border-white/30" style={{ backgroundColor: SEV_COLOR[k] }} />
          <span className="text-[9px] text-muted-foreground">{l}</span>
        </div>
      ))}
      <p className="text-[8px] text-muted-foreground mt-1 leading-tight">
        Line = river course, colored by nearest gauge (≤80km). Dashed circle = ~35km watch radius around a danger/extreme gauge — not a modeled flood extent.
      </p>
      <p className="text-[8px] text-muted-foreground mt-1">GloFAS · 7-day max</p>
    </div>
  );
}

// ── River Health Panel ────────────────────────────────────────────────────────

const MONTH_NAMES = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function RiverHealthPanel({ history }: { history: RiverHistory }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterTrend, setFilterTrend] = useState<string>("all");

  const declining = history.points.filter(p => p.trend === "declining").length;
  const seasonal  = history.points.filter(p => p.flow_regime !== "perennial").length;
  const hiEnso    = history.points.filter(p => p.enso_sensitivity === "high").length;

  const displayed = filterTrend === "all"
    ? history.points
    : history.points.filter(p => p.trend === filterTrend);

  // Sort: declining first, then by pct_per_decade ascending
  const sorted = [...displayed].sort((a, b) => {
    const order = { declining: 0, stable: 1, increasing: 2 };
    if (order[a.trend] !== order[b.trend]) return order[a.trend] - order[b.trend];
    return a.pct_per_decade - b.pct_per_decade;
  });

  const trendIcon = (t: string) =>
    t === "declining" ? <TrendingDown className="h-3 w-3 text-red-400" />
    : t === "increasing" ? <TrendingUp className="h-3 w-3 text-emerald-400" />
    : <Minus className="h-3 w-3 text-gray-400" />;

  const trendColor = (t: string) =>
    t === "declining" ? "text-red-400" : t === "increasing" ? "text-emerald-400" : "text-gray-400";

  const regimeColor = (r: string) =>
    r === "perennial" ? "text-blue-400" : r === "seasonal" ? "text-amber-400" : "text-red-400";

  const ensoColor = (s: string) =>
    s === "high" ? "text-red-400" : s === "medium" ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="flex flex-col gap-0">
      {/* Summary chips */}
      <div className="flex gap-1.5 px-3 py-2 flex-wrap border-b border-border/20">
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-medium">
          {declining} declining
        </span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">
          {seasonal} seasonal/intermittent
        </span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-medium">
          {hiEnso} El Niño sensitive
        </span>
      </div>

      {/* Filter */}
      <div className="flex gap-1 px-3 py-1.5 border-b border-border/20">
        {["all","declining","stable","increasing"].map(t => (
          <button key={t} onClick={() => setFilterTrend(t)}
            className={`text-[9px] px-1.5 py-0.5 rounded capitalize transition-colors
              ${filterTrend === t ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* River list */}
      <div className="overflow-y-auto max-h-[420px]">
        {sorted.map((pt) => {
          const key = `${pt.river}|${pt.location}`;
          const isOpen = expanded === key;
          const maxClim = Math.max(...Object.values(pt.monthly_clim));

          return (
            <div key={key} className="border-b border-border/15">
              <button
                className="w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setExpanded(isOpen ? null : key)}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-medium text-foreground truncate">
                    {pt.river}
                    <span className="text-muted-foreground font-normal ml-1">@ {pt.location}</span>
                  </span>
                  {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                           : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`flex items-center gap-0.5 text-[9px] font-medium ${trendColor(pt.trend)}`}>
                    {trendIcon(pt.trend)}
                    {pt.pct_per_decade > 0 ? "+" : ""}{pt.pct_per_decade.toFixed(1)}%/dec
                  </span>
                  <span className={`text-[9px] ${regimeColor(pt.flow_regime)} capitalize`}>
                    {pt.flow_regime}
                  </span>
                  <span className={`text-[9px] ${ensoColor(pt.enso_sensitivity)}`}>
                    El Niño: {pt.enso_sensitivity}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 bg-muted/10">
                  {/* Key stats */}
                  <div className="grid grid-cols-3 gap-1.5 mb-2 text-center">
                    <div className="bg-muted/30 rounded p-1.5">
                      <div className="text-[9px] text-muted-foreground">Median flow</div>
                      <div className="text-[11px] font-semibold">{pt.p50 >= 1000 ? `${(pt.p50/1000).toFixed(1)}k` : pt.p50} m³/s</div>
                    </div>
                    <div className="bg-muted/30 rounded p-1.5">
                      <div className="text-[9px] text-muted-foreground">El Niño drop</div>
                      <div className={`text-[11px] font-semibold ${pt.en_drop_pct > 15 ? "text-red-400" : pt.en_drop_pct > 5 ? "text-amber-400" : "text-emerald-400"}`}>
                        {pt.en_drop_pct > 0 ? "-" : "+"}{Math.abs(pt.en_drop_pct).toFixed(0)}%
                      </div>
                    </div>
                    <div className="bg-muted/30 rounded p-1.5">
                      <div className="text-[9px] text-muted-foreground">40yr change</div>
                      <div className={`text-[11px] font-semibold ${pt.decadal_change_pct < -10 ? "text-red-400" : pt.decadal_change_pct > 10 ? "text-emerald-400" : "text-gray-400"}`}>
                        {pt.decadal_change_pct > 0 ? "+" : ""}{pt.decadal_change_pct.toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  {/* Monthly seasonality bar chart */}
                  <div className="text-[9px] text-muted-foreground mb-1">
                    Monthly flow profile · Peak: {MONTH_NAMES[pt.peak_month]} · Dry: {MONTH_NAMES[pt.dry_month]}
                  </div>
                  <div className="flex items-end gap-px h-8">
                    {Array.from({ length: 12 }, (_, i) => {
                      const m = i + 1;
                      const val = pt.monthly_clim[String(m)] ?? 0;
                      const h = maxClim > 0 ? Math.max(2, (val / maxClim) * 32) : 2;
                      const isMonsoon = m >= 6 && m <= 9;
                      const isDry = m === pt.dry_month;
                      return (
                        <div key={m} className="flex-1 flex flex-col items-center group relative">
                          <div
                            className={`w-full rounded-sm transition-colors ${isDry ? "bg-orange-400" : isMonsoon ? "bg-blue-400" : "bg-blue-600/50"}`}
                            style={{ height: `${h}px` }}
                          />
                          <div className="absolute bottom-full mb-0.5 hidden group-hover:block bg-background border border-border/40 rounded px-1 py-0.5 text-[8px] whitespace-nowrap z-10">
                            {MONTH_NAMES[m]}: {val >= 1000 ? `${(val/1000).toFixed(1)}k` : val.toFixed(0)} m³/s
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[8px] text-muted-foreground mt-0.5">
                    <span>Jan</span><span>Jun</span><span>Dec</span>
                  </div>

                  {/* WASH implication */}
                  <div className="mt-2 text-[9px] leading-3.5 text-muted-foreground">
                    {pt.flow_regime === "intermittent" && (
                      <span className="text-orange-400">⚠ Intermittent — unreliable for surface WTP intakes</span>
                    )}
                    {pt.flow_regime === "seasonal" && pt.trend === "declining" && (
                      <span className="text-red-400">⚠ Seasonal + declining — dry-season supply at risk</span>
                    )}
                    {pt.enso_sensitivity === "high" && (
                      <span className="text-amber-400 block">El Niño → {pt.en_drop_pct.toFixed(0)}% less monsoon flow · plan buffer storage</span>
                    )}
                    {pt.trend === "stable" && pt.flow_regime === "perennial" && (
                      <span className="text-emerald-400">✓ Reliable perennial source — suitable for intake schemes</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-3 py-1.5 text-[8px] text-muted-foreground border-t border-border/20">
        GloFAS ERA5 · {history.period.start.slice(0,4)}–{history.period.end.slice(0,4)} · {history.points.length} monitoring points
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ForecastPage() {
  const [selectedDay, setSelectedDay]     = useState(0);
  const [selectedState, setSelectedState] = useState("All India");
  const [hazardFilter, setHazardFilter]   = useState("all");
  const [minRisk, setMinRisk]             = useState(0);
  const [sidebarOpen, setSidebarOpen]     = useState(window.innerWidth > 768);
  const [showRivers, setShowRivers]       = useState(true);
  const mapRef = useRef<LeafletMap | null>(null);

  const hexQ = useQuery<any>({
    queryKey: ["india-hex-props-geojson"],
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

  const riverQ = useQuery<RiverForecast>({
    queryKey: ["river-forecast"],
    queryFn: () => fetch("/data/river_forecast.json").then((r) => r.json()),
    staleTime: 30 * 60 * 1000,
  });

  const riverHistoryQ = useQuery<RiverHistory>({
    queryKey: ["river-history"],
    queryFn: () => fetch("/data/river_history.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const features: any[] = hexQ.data?.features ?? [];
  const stateList = useMemo(
    () => Array.from(new Set(features.map((f: any) => f.properties.state).filter(Boolean))).sort() as string[],
    [features]
  );

  const [healthOpen, setHealthOpen] = useState(false);
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
        riverForecast={riverQ.data} riverForecastError={riverQ.isError} showRivers={showRivers} onToggleRivers={() => setShowRivers(v => !v)}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-10 px-3 border-b border-border/40 flex items-center gap-3 bg-background/95 backdrop-blur z-50 shrink-0">
          <Link href="/"><Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2"><ArrowLeft className="h-3 w-3" />Home</Button></Link>
          <div className="h-3 w-px bg-border/50" />
          <span className="text-xs font-semibold">Forecast Early Warning</span>
          <div className="flex-1" />
          {riverHistoryQ.data && (
            <button
              onClick={() => setHealthOpen(v => !v)}
              className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors font-medium flex items-center gap-1
                ${healthOpen
                  ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                  : "border-border/40 text-muted-foreground hover:text-foreground"}`}
            >
              <Waves className="h-3 w-3" /> River Health
            </button>
          )}
          <Link href="/grid" className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold">← Hex Grid</Link>
          <ThemeToggle />
        </header>

        <div className="flex-1 flex overflow-hidden relative">
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
              riverForecast={riverQ.data} showRivers={showRivers}
            />
          ) : null}

          {/* Legends */}
          <div className="absolute bottom-8 left-3 z-[800] flex flex-col gap-2">
            <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg p-2.5 shadow-lg w-40">
              <p className="text-[10px] font-semibold mb-1">Forecast Risk (0–10)</p>
              <div className="h-2.5 w-full rounded-sm mb-1"
                style={{ background: `linear-gradient(to right, ${Array.from({length:5},(_,i)=>riskColor(i/4)).join(",")})` }} />
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>0 Safe</span><span>10 Extreme</span>
              </div>
            </div>
            <RiverLegend show={showRivers} />
          </div>
        </div>

        {/* River Health right panel */}
        {healthOpen && riverHistoryQ.data && (
          <div className="w-72 border-l border-border/40 bg-background flex flex-col overflow-hidden shrink-0">
            <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between shrink-0">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <Waves className="h-3.5 w-3.5 text-blue-400" /> River Health ({riverHistoryQ.data.period.start.slice(0,4)}–{riverHistoryQ.data.period.end.slice(0,4)})
              </span>
              <button onClick={() => setHealthOpen(false)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <RiverHealthPanel history={riverHistoryQ.data} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
