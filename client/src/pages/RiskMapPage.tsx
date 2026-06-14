import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ArrowLeft, X, ChevronDown, ChevronUp, Search, AlertTriangle,
  Loader2, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";

// ── Layer definitions ──────────────────────────────────────────────────────────

const LAYERS = [
  { key: "RISK",          label: "Overall Risk",   desc: "Hazard × Exposure × Vulnerability (IPCC AR6)" },
  { key: "HAZARD",        label: "Hazard",         desc: "Climate hazard intensity (rainfall, temp, terrain)" },
  { key: "EXPOSURE",      label: "Exposure",       desc: "Population exposure to hazard" },
  { key: "VULNERABILITY", label: "Vulnerability",  desc: "Social & infrastructural vulnerability" },
] as const;

type LayerKey = typeof LAYERS[number]["key"];

// ── Color helpers ──────────────────────────────────────────────────────────────

const GRADIENT = [
  [34,  197, 94 ],  // green
  [234, 179, 8  ],  // yellow
  [249, 115, 22 ],  // orange
  [239, 68,  68 ],  // red
  [153, 27,  27 ],  // dark red
] as [number, number, number][];

function lerp3(a: [number,number,number], b: [number,number,number], t: number): string {
  return `rgb(${a.map((c, i) => Math.round(c + t * (b[i] - c))).join(",")})`;
}

function toColor(t: number): string {
  t = Math.max(0, Math.min(1, t));
  const scaled = t * (GRADIENT.length - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(lo + 1, GRADIENT.length - 1);
  return lerp3(GRADIENT[lo], GRADIENT[hi], scaled - lo);
}

// ── Data helpers ───────────────────────────────────────────────────────────────

interface DistrictProps {
  ID: string; NAME: string; STATE: string; DISTRICT: string;
  RISK: number; HAZARD: number; EXPOSURE: number; VULNERABILITY: number;
}

function buildDomains(features: any[]): Record<LayerKey, [number, number]> {
  const out: any = {};
  for (const { key } of LAYERS) {
    const vals = features.map((f: any) => f.properties[key]).filter((v: any) => v != null);
    out[key] = [Math.min(...vals), Math.max(...vals)];
  }
  return out;
}

function normalize(v: number, [lo, hi]: [number, number]): number {
  return hi > lo ? (v - lo) / (hi - lo) : 0;
}

function fmt(v: number, decimals = 3): string {
  return (v ?? 0).toFixed(decimals);
}

// ── Layer selector ─────────────────────────────────────────────────────────────

function LayerSelector({
  active, onChange,
}: { active: LayerKey; onChange: (k: LayerKey) => void }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {LAYERS.map((l) => (
        <button
          key={l.key}
          onClick={() => onChange(l.key)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            active === l.key
              ? "bg-violet-600 text-white"
              : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

// ── Search box ─────────────────────────────────────────────────────────────────

function SearchBox({
  features,
  onSelect,
}: {
  features: any[];
  onSelect: (f: any) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return features
      .filter((f: any) =>
        f.properties.NAME.toLowerCase().includes(q) ||
        f.properties.STATE.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [query, features]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative w-52">
      <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/40 px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search district…"
          className="bg-transparent text-xs outline-none placeholder:text-muted-foreground/60 w-full"
        />
        {query && (
          <button onClick={() => { setQuery(""); setOpen(false); }}>
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 z-[9999] bg-background border border-border/50 rounded-md shadow-lg max-h-56 overflow-y-auto">
          {results.map((f: any) => (
            <button
              key={f.properties.ID}
              onClick={() => { onSelect(f); setOpen(false); setQuery(f.properties.NAME); }}
              className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors"
            >
              <div className="text-xs font-medium">{f.properties.NAME}</div>
              <div className="text-[10px] text-muted-foreground">{f.properties.STATE}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────────

function Legend({
  layer, domain,
}: { layer: LayerKey; domain: [number, number] }) {
  const meta = LAYERS.find((l) => l.key === layer)!;
  const stops = Array.from({ length: 5 }, (_, i) => i / 4).map((t) => toColor(t));
  return (
    <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg p-3 shadow-lg w-52">
      <p className="text-[10px] font-semibold text-foreground mb-1.5">{meta.label}</p>
      <div
        className="h-3 w-full rounded-sm mb-1"
        style={{ background: `linear-gradient(to right, ${stops.join(", ")})` }}
      />
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>{fmt(domain[0])}</span>
        <span>← lower risk · higher risk →</span>
        <span>{fmt(domain[1])}</span>
      </div>
    </div>
  );
}

// ── Ranked list ────────────────────────────────────────────────────────────────

function RankedList({
  features,
  layer,
  domain,
  onSelect,
  selectedId,
}: {
  features: any[];
  layer: LayerKey;
  domain: [number, number];
  onSelect: (f: any) => void;
  selectedId: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const ranked = useMemo(
    () =>
      [...features]
        .sort((a, b) => (b.properties[layer] ?? 0) - (a.properties[layer] ?? 0))
        .slice(0, 20),
    [features, layer]
  );

  const layerLabel = LAYERS.find((l) => l.key === layer)?.label ?? layer;

  return (
    <div className="bg-background/90 backdrop-blur border border-border/40 rounded-lg shadow-lg w-60 overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-border/30 cursor-pointer"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="text-xs font-semibold">Top 20 · {layerLabel}</span>
        {collapsed
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronUp   className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      {!collapsed && (
        <div className="max-h-80 overflow-y-auto">
          {ranked.map((f, i) => {
            const val = f.properties[layer] ?? 0;
            const t = normalize(val, domain);
            return (
              <button
                key={f.properties.ID}
                onClick={() => onSelect(f)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 border-b border-border/20 last:border-0 transition-colors ${
                  selectedId === f.properties.ID ? "bg-violet-500/10" : ""
                }`}
              >
                <span className="text-[10px] text-muted-foreground w-4 shrink-0 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium truncate">{f.properties.NAME}</div>
                  <div className="text-[9px] text-muted-foreground truncate">{f.properties.STATE}</div>
                </div>
                <span
                  className="text-[10px] font-mono shrink-0 font-semibold"
                  style={{ color: toColor(t) }}
                >
                  {fmt(val, 4)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── District sidebar ───────────────────────────────────────────────────────────

function DistrictSidebar({
  feature,
  layer,
  domains,
  onClose,
}: {
  feature: any;
  layer: LayerKey;
  domains: Record<LayerKey, [number, number]>;
  onClose: () => void;
}) {
  const p: DistrictProps = feature.properties;
  const risk = p.RISK ?? 0;
  const riskT = normalize(risk, domains.RISK);

  const bars: { label: string; key: LayerKey; color: string }[] = [
    { label: "Hazard",        key: "HAZARD",        color: "#f97316" },
    { label: "Exposure",      key: "EXPOSURE",      color: "#3b82f6" },
    { label: "Vulnerability", key: "VULNERABILITY", color: "#a855f7" },
  ];

  return (
    <div className="h-full flex flex-col bg-background border-l border-border/40">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-border/30">
        <div>
          <h2 className="text-sm font-bold leading-tight">{p.NAME}</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">{p.STATE}</p>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors ml-2 shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Composite risk score */}
        <div className="rounded-lg border border-border/30 p-4 text-center"
             style={{ borderColor: toColor(riskT) + "44" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Composite Risk Score
          </p>
          <p className="text-4xl font-black" style={{ color: toColor(riskT) }}>
            {(risk * 100).toFixed(2)}
            <span className="text-lg font-medium ml-1 text-muted-foreground">/ 100</span>
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">IPCC AR6: Hazard × Exposure × Vulnerability</p>
        </div>

        {/* Component bars */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Risk Components
          </p>
          {bars.map(({ label, key, color }) => {
            const val = (p as any)[key] ?? 0;
            const t = normalize(val, domains[key]);
            return (
              <div key={key} className="space-y-1">
                <div className="flex justify-between items-center">
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: key === layer ? color : undefined }}
                  >
                    {label}
                    {key === layer && (
                      <span className="ml-1 text-[9px] opacity-60">(active layer)</span>
                    )}
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground">{fmt(val, 4)}</span>
                </div>
                <div className="h-2 rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${t * 100}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Values table */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Score Summary
          </p>
          <div className="rounded-lg border border-border/30 overflow-hidden">
            {(
              [
                { label: "Overall Risk",   val: p.RISK,          key: "RISK" },
                { label: "Hazard",         val: p.HAZARD,        key: "HAZARD" },
                { label: "Exposure",       val: p.EXPOSURE,      key: "EXPOSURE" },
                { label: "Vulnerability",  val: p.VULNERABILITY, key: "VULNERABILITY" },
              ] as { label: string; val: number; key: LayerKey }[]
            ).map(({ label, val, key }, i) => (
              <div
                key={key}
                className={`flex justify-between items-center px-3 py-2 text-xs ${
                  i < 3 ? "border-b border-border/20" : ""
                } ${key === layer ? "bg-violet-500/10" : ""}`}
              >
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono font-medium">{fmt(val ?? 0, 4)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* District code */}
        <div className="text-[10px] text-muted-foreground/50 text-center">
          District ID: {p.ID}
        </div>
      </div>
    </div>
  );
}

// ── Leaflet map ────────────────────────────────────────────────────────────────

function RiskMap({
  geoData,
  layer,
  domains,
  selectedId,
  onSelect,
  mapRef,
}: {
  geoData: any;
  layer: LayerKey;
  domains: Record<LayerKey, [number, number]>;
  selectedId: string | null;
  onSelect: (f: any) => void;
  mapRef: React.MutableRefObject<LeafletMap | null>;
}) {
  const styleFeature = useCallback(
    (feature: any) => {
      const val = feature.properties[layer] ?? 0;
      const t = normalize(val, domains[layer]);
      const isSelected = feature.properties.ID === selectedId;
      return {
        fillColor: toColor(t),
        fillOpacity: isSelected ? 1.0 : 0.72,
        color: isSelected ? "#ffffff" : "#1f2937",
        weight: isSelected ? 1.5 : 0.4,
      };
    },
    [layer, domains, selectedId]
  );

  const onEachFeature = useCallback(
    (feature: any, leafletLayer: any) => {
      const p = feature.properties;
      const val = p[layer] ?? 0;
      const layerLabel = LAYERS.find((l) => l.key === layer)?.label ?? layer;
      leafletLayer.bindTooltip(
        `<strong>${p.NAME}</strong><br/>${p.STATE}<br/>${layerLabel}: ${fmt(val, 4)}`,
        { sticky: true, className: "leaflet-proj-tooltip" }
      );
      leafletLayer.on("click", () => onSelect(feature));
      leafletLayer.on("mouseover", (e: any) => {
        e.target.setStyle({ weight: 1.5, fillOpacity: 0.95 });
      });
      leafletLayer.on("mouseout", (e: any) => {
        e.target.setStyle(styleFeature(feature));
      });
    },
    [layer, onSelect, styleFeature]
  );

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
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, &copy; <a href="https://carto.com/">CARTO</a>'
      />
      <GeoJSON
        key={`${layer}-${selectedId ?? "none"}`}
        data={geoData}
        style={styleFeature}
        onEachFeature={onEachFeature}
      />
    </MapContainer>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RiskMapPage() {
  const [layer, setLayer] = useState<LayerKey>("RISK");
  const [selectedFeature, setSelectedFeature] = useState<any | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  const geoQ = useQuery<any>({
    queryKey: ["india-geojson"],
    queryFn: () => fetch("/data/india.json").then((r) => r.json()),
    staleTime: Infinity,
  });

  const features: any[] = geoQ.data?.features ?? [];

  const domains = useMemo(
    () => (features.length ? buildDomains(features) : null),
    [features]
  );

  const handleSelect = useCallback(
    (feature: any) => {
      setSelectedFeature(feature);
      // Fly map to district centroid
      if (mapRef.current && feature.geometry) {
        const geom = feature.geometry;
        const pts =
          geom.type === "Polygon"
            ? geom.coordinates[0]
            : geom.coordinates[0][0];
        const lons = pts.map((p: number[]) => p[0]);
        const lats = pts.map((p: number[]) => p[1]);
        const cx = lons.reduce((a: number, b: number) => a + b, 0) / lons.length;
        const cy = lats.reduce((a: number, b: number) => a + b, 0) / lats.length;
        mapRef.current.flyTo([cy, cx], Math.max(mapRef.current.getZoom(), 7), {
          duration: 1,
        });
      }
    },
    []
  );

  const layerMeta = LAYERS.find((l) => l.key === layer)!;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur z-50 shrink-0">
        <div className="h-14 px-4 flex items-center gap-4">
          {/* Back */}
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8 shrink-0">
              <ArrowLeft className="h-3.5 w-3.5" /> Home
            </Button>
          </Link>

          <div className="h-4 w-px bg-border/50 shrink-0" />

          {/* Title */}
          <div className="flex items-center gap-2 shrink-0">
            <ShieldAlert className="h-4 w-4 text-red-400" />
            <span className="text-sm font-semibold">Climate Risk Map</span>
            <Badge variant="outline" className="text-[10px] h-5 border-red-500/30 text-red-400 bg-red-500/10">
              735 districts
            </Badge>
          </div>

          <div className="h-4 w-px bg-border/50 shrink-0" />

          {/* Layer selector */}
          <LayerSelector active={layer} onChange={setLayer} />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search */}
          {features.length > 0 && (
            <SearchBox features={features} onSelect={handleSelect} />
          )}

          <ThemeToggle />
        </div>

        {/* Layer description sub-bar */}
        <div className="px-4 pb-2">
          <p className="text-[10px] text-muted-foreground">
            {layerMeta.desc}
            {domains && (
              <span className="ml-2 opacity-60">
                · Range {fmt(domains[layer][0], 4)} – {fmt(domains[layer][1], 4)}
              </span>
            )}
          </p>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map area */}
        <div className="relative flex-1">
          {geoQ.isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading map data…
            </div>
          ) : geoQ.isError ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-red-400 text-sm">
              <AlertTriangle className="h-5 w-5" /> Failed to load GeoJSON
            </div>
          ) : domains ? (
            <RiskMap
              geoData={geoQ.data}
              layer={layer}
              domains={domains}
              selectedId={selectedFeature?.properties?.ID ?? null}
              onSelect={handleSelect}
              mapRef={mapRef}
            />
          ) : null}

          {/* Floating: Ranked list (top-right) */}
          {features.length > 0 && domains && (
            <div className="absolute top-3 right-3 z-[800]">
              <RankedList
                features={features}
                layer={layer}
                domain={domains[layer]}
                onSelect={handleSelect}
                selectedId={selectedFeature?.properties?.ID ?? null}
              />
            </div>
          )}

          {/* Floating: Legend (bottom-left) */}
          {domains && (
            <div className="absolute bottom-8 left-3 z-[800]">
              <Legend layer={layer} domain={domains[layer]} />
            </div>
          )}
        </div>

        {/* Sidebar */}
        {selectedFeature && domains && (
          <div className="w-80 shrink-0 border-l border-border/40 overflow-hidden">
            <DistrictSidebar
              feature={selectedFeature}
              layer={layer}
              domains={domains}
              onClose={() => setSelectedFeature(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
