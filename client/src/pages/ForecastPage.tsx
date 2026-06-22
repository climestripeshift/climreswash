import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { Map as LeafletMap, GeoJSON as LeafletGeoJSONLayer } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ArrowLeft, AlertTriangle, Loader2, Radio, ChevronDown,
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
  h3_id: string;
  district: string;
  state: string;
  hazard: string;
  risk: number;
  day: number;
  date: string;
  rain_mm: number | null;
  temp_c: number | null;
  rh_pct: number | null;
}

// ── Color scale ───────────────────────────────────────────────────────────────

const RISK_RAMP: [number, number, number][] = [
  [34,  197, 94 ],
  [234, 179, 8  ],
  [249, 115, 22 ],
  [239, 68,  68 ],
  [153, 27,  27 ],
];

function lerp3(a: [number,number,number], b: [number,number,number], t: number): string {
  return `rgb(${a.map((c, i) => Math.round(c + t * (b[i] - c))).join(",")})`;
}

function riskColor(t: number): string {
  t = Math.max(0, Math.min(1, t));
  const s = t * (RISK_RAMP.length - 1);
  const lo = Math.floor(s);
  const hi = Math.min(lo + 1, RISK_RAMP.length - 1);
  return lerp3(RISK_RAMP[lo], RISK_RAMP[hi], s - lo);
}

const HAZARD_ICONS: Record<string, string> = {
  flood: "🌊", heat: "🔥", wetbulb: "💧", cyclone: "🌀", drought: "☀️",
};

// ── Canvas renderer ───────────────────────────────────────────────────────────

const canvasRenderer = L.canvas({ padding: 0.5 });

function SetupCanvas() {
  const map = useMap();
  useEffect(() => {
    (map as any).options.renderer = canvasRenderer;
  }, [map]);
  return null;
}

// ── Day selector ──────────────────────────────────────────────────────────────

function DaySelector({
  days, active, onChange,
}: {
  days: string[];
  active: number;
  onChange: (d: number) => void;
}) {
  const labels = ["Today", "+1d", "+2d", "+3d", "+4d", "+5d", "+6d"];
  return (
    <div className="flex items-center gap-1">
      {days.map((date, i) => (
        <button
          key={date}
          onClick={() => onChange(i)}
          className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
            active === i
              ? "bg-red-600 text-white"
              : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {labels[i] || `+${i}d`}
          <span className="ml-1 text-[9px] opacity-70">{date.slice(5)}</span>
        </button>
      ))}
    </div>
  );
}

// ── Alert panel ───────────────────────────────────────────────────────────────

function AlertPanel({
  alerts,
  selectedDay,
  hazardFilter,
}: {
  alerts: Alert[];
  selectedDay: number;
  hazardFilter: string;
}) {
  const dayAlerts = alerts.filter((a) => a.day === selectedDay);
  const allDayAlerts = alerts.filter((a) => a.day <= 2);
  const base = dayAlerts.length > 0 ? dayAlerts : allDayAlerts;
  const display = hazardFilter === "all" ? base : base.filter((a) => a.hazard === hazardFilter);

  return (
    <div className="bg-background/95 backdrop-blur border border-border/40 rounded-lg shadow-lg w-72 max-h-[60vh] overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-border/30 flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
        <span className="text-xs font-semibold">
          {hazardFilter !== "all" ? `${HAZARD_ICONS[hazardFilter] || ""} ${hazardFilter}` : "All hazards"}
          {" — "}{dayAlerts.length > 0 ? `Day ${selectedDay}` : "Next 3 days"}
        </span>
        <Badge variant="outline" className="ml-auto text-[9px] h-4 border-red-500/30 text-red-400">
          {display.length}
        </Badge>
      </div>
      <div className="overflow-y-auto flex-1">
        {display.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No {hazardFilter === "all" ? "" : hazardFilter + " "}alerts above threshold
          </div>
        ) : (
          display.slice(0, 30).map((a) => (
            <div
              key={`${a.h3_id}-${a.hazard}-${a.day}`}
              className="px-3 py-2 border-b border-border/20 last:border-0"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{HAZARD_ICONS[a.hazard] || "⚠️"}</span>
                <span className="text-[11px] font-semibold flex-1 truncate">{a.district}</span>
                <span className="text-[11px] font-mono font-bold" style={{ color: riskColor(a.risk / 3) }}>
                  {a.risk}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {a.state} · {a.hazard}
                {(a as any).rain_mm ? ` · ${(a as any).rain_mm}mm rain` : ""}
                {(a as any).temp_c ? ` · ${(a as any).temp_c}°C` : ""}
                {(a as any).rh_pct ? ` · ${(a as any).rh_pct}% RH` : ""}
                {(a as any).wind_kmh ? ` · ${(a as any).wind_kmh}km/h` : ""}
                {" · "}{a.date}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────────

function ForecastLegend({ domain }: { domain: [number, number] }) {
  const stops = Array.from({ length: 5 }, (_, i) => riskColor(i / 4));
  return (
    <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg p-3 shadow-lg w-48">
      <p className="text-[10px] font-semibold text-foreground mb-1.5">Forecast Risk</p>
      <div
        className="h-3 w-full rounded-sm mb-1"
        style={{ background: `linear-gradient(to right, ${stops.join(", ")})` }}
      />
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>{domain[0].toFixed(2)}</span>
        <span>← low · high →</span>
        <span>{domain[1].toFixed(2)}</span>
      </div>
    </div>
  );
}

// ── Map ───────────────────────────────────────────────────────────────────────

function ForecastMap({
  geoData,
  forecast,
  selectedDay,
  selectedState,
  hazardFilter,
  minRisk,
  domain,
  mapRef,
}: {
  geoData: any;
  forecast: ForecastData;
  selectedDay: number;
  selectedState: string;
  hazardFilter: string;
  minRisk: number;
  domain: [number, number];
  mapRef: React.MutableRefObject<LeafletMap | null>;
}) {
  const geoJsonRef = useRef<LeafletGeoJSONLayer | null>(null);

  const filtered = useMemo(() => {
    if (!geoData) return null;
    let feats = geoData.features;
    if (selectedState !== "All India")
      feats = feats.filter((f: any) => f.properties.state === selectedState);
    if (hazardFilter !== "all") {
      feats = feats.filter((f: any) => {
        const dom = forecast.dominant[f.properties.h3_id];
        return dom && dom[selectedDay] === hazardFilter;
      });
    }
    if (minRisk > 0) {
      feats = feats.filter((f: any) => {
        const risks = forecast.risk[f.properties.h3_id];
        return risks && risks[selectedDay] >= minRisk;
      });
    }
    return { ...geoData, features: feats };
  }, [geoData, selectedState, hazardFilter, minRisk, forecast, selectedDay]);

  const styleFeature = useCallback(
    (feature: any) => {
      const h3 = feature.properties.h3_id;
      const risks = forecast.risk[h3];
      const val = risks ? risks[selectedDay] ?? 0 : 0;
      const [lo, hi] = domain;
      const t = hi > lo ? (val - lo) / (hi - lo) : 0;
      return {
        fillColor: riskColor(t),
        fillOpacity: 0.75,
        color: "#64748b",
        weight: 0.3,
        renderer: canvasRenderer,
      };
    },
    [forecast, selectedDay, domain]
  );

  useEffect(() => {
    geoJsonRef.current?.setStyle(styleFeature);
  }, [styleFeature]);

  const onEachFeature = useCallback(
    (feature: any, layer: any) => {
      const p = feature.properties;
      const h3 = p.h3_id;
      const risks = forecast.risk[h3];
      const dominant = forecast.dominant[h3];
      const val = risks ? risks[selectedDay] ?? 0 : 0;
      const haz = dominant ? dominant[selectedDay] ?? "" : "";
      const icon = HAZARD_ICONS[haz] || "";
      const district = p.district_name || "";
      layer.bindTooltip(
        `<b>${district}, ${p.state}</b><br/>${icon} ${haz} risk: ${val}`,
        { sticky: true }
      );
    },
    [forecast, selectedDay]
  );

  if (!filtered) return null;

  return (
    <MapContainer
      center={[22.5, 80]}
      zoom={5}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
      maxBounds={[[6, 68], [37, 98]]}
      minZoom={4}
      maxZoom={10}
      ref={mapRef}
    >
      <SetupCanvas />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
      />
      <GeoJSON
        ref={geoJsonRef}
        key={`${selectedState}-${hazardFilter}-${minRisk}-${selectedDay}`}
        data={filtered}
        style={styleFeature}
        onEachFeature={onEachFeature}
      />
    </MapContainer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const HAZARD_TYPES = ["all", "flood", "heat", "wetbulb", "flashflood", "coldwave", "landslide", "fire"] as const;
type HazardFilter = typeof HAZARD_TYPES[number];

export default function ForecastPage() {
  const [selectedDay, setSelectedDay]       = useState(0);
  const [selectedState, setSelectedState]   = useState("All India");
  const [hazardFilter, setHazardFilter]     = useState<HazardFilter>("all");
  const [minRisk, setMinRisk]               = useState(0);
  const mapRef = useRef<LeafletMap | null>(null);

  const hexQ = useQuery<any>({
    queryKey: ["india-hex-grid"],
    queryFn:  () => fetch("/data/india_hex_grid.geojson").then((r) => r.json()),
    staleTime: Infinity,
  });

  const forecastQ = useQuery<ForecastData>({
    queryKey: ["forecast-risk"],
    queryFn:  () => fetch("/data/forecast_risk.json").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const features: any[] = hexQ.data?.features ?? [];

  const stateList = useMemo(
    () => Array.from(new Set(features.map((f: any) => f.properties.state).filter(Boolean))).sort() as string[],
    [features]
  );

  const domain = useMemo((): [number, number] => {
    if (!forecastQ.data) return [0, 1];
    let min = Infinity, max = -Infinity;
    for (const risks of Object.values(forecastQ.data.risk)) {
      const v = risks[selectedDay];
      if (v != null) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return [min === Infinity ? 0 : min, max === -Infinity ? 1 : max];
  }, [forecastQ.data, selectedDay]);

  const loading = hexQ.isLoading || forecastQ.isLoading;
  const error = hexQ.isError || forecastQ.isError;

  const genTime = forecastQ.data?.generated_at
    ? new Date(forecastQ.data.generated_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : "";

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top bar */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur z-50 shrink-0">
        <div className="h-14 px-4 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8 shrink-0">
              <ArrowLeft className="h-3.5 w-3.5" /> Home
            </Button>
          </Link>

          <div className="h-4 w-px bg-border/50 shrink-0" />

          <div className="flex items-center gap-2 shrink-0">
            <Radio className="h-4 w-4 text-red-500 animate-pulse" />
            <span className="text-sm font-semibold">Forecast Early Warning</span>
            <Badge variant="outline" className="text-[10px] h-5 border-red-500/30 text-red-400 bg-red-500/10">
              LIVE
            </Badge>
          </div>

          <div className="h-4 w-px bg-border/50 shrink-0" />

          {forecastQ.data && (
            <DaySelector
              days={forecastQ.data.days}
              active={selectedDay}
              onChange={setSelectedDay}
            />
          )}

          <div className="h-4 w-px bg-border/50 shrink-0" />

          {/* Hazard filter — filters BOTH map and alerts */}
          <div className="flex items-center gap-1">
            {HAZARD_TYPES.map((h) => (
              <button
                key={h}
                onClick={() => setHazardFilter(h)}
                className={`px-1.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                  hazardFilter === h
                    ? "bg-red-600 text-white"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                {h === "all" ? "All" : `${HAZARD_ICONS[h] || ""} ${h}`}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {stateList.length > 0 && (
            <div className="relative flex items-center">
              <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                className="appearance-none rounded-md border border-border/50 bg-muted/40 pl-2.5 pr-7 py-1.5 text-xs outline-none cursor-pointer text-foreground max-w-[160px]"
              >
                <option value="All India">All India</option>
                {stateList.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-muted-foreground">Min risk</span>
            <input
              type="range"
              min={0}
              max={2.5}
              step={0.1}
              value={minRisk}
              onChange={(e) => setMinRisk(parseFloat(e.target.value))}
              className="w-20 h-1 accent-red-500"
            />
            <span className="text-[10px] font-mono font-semibold text-red-400 w-6">{minRisk.toFixed(1)}</span>
          </div>

          <ThemeToggle />
        </div>

        <div className="px-4 pb-2">
          <p className="text-[10px] text-muted-foreground">
            7-day forecast risk from Open-Meteo (ECMWF/GFS) × ClimResWASH formulas
            {genTime && <span className="ml-2 opacity-60">· Generated {genTime}</span>}
            {minRisk > 0 && <span className="ml-2 text-amber-500">· Showing risk &gt; {minRisk.toFixed(1)} only</span>}
          </p>
        </div>
      </header>

      {/* Map */}
      <div className="flex-1 relative overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground gap-2 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading forecast…
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-red-400 text-sm">
            <AlertTriangle className="h-5 w-5" /> Failed to load forecast data
          </div>
        ) : forecastQ.data && hexQ.data ? (
          <ForecastMap
            geoData={hexQ.data}
            forecast={forecastQ.data}
            selectedDay={selectedDay}
            selectedState={selectedState}
            hazardFilter={hazardFilter}
            minRisk={minRisk}
            domain={domain}
            mapRef={mapRef}
          />
        ) : null}

        {/* Alert panel — top right */}
        {forecastQ.data && (
          <div className="absolute top-3 right-3 z-[800]">
            <AlertPanel alerts={forecastQ.data.alerts} selectedDay={selectedDay} hazardFilter={hazardFilter} />
          </div>
        )}

        {/* Legend — bottom left */}
        <div className="absolute bottom-8 left-3 z-[800]">
          <ForecastLegend domain={domain} />
        </div>
      </div>
    </div>
  );
}
