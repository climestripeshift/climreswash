import { useState, useCallback, useRef, useMemo } from "react";
import { useRoute, Link, useSearch } from "wouter";
import { getTechnologyBySlug, getAllTechnologies, ALL_HAZARDS, ALL_TYPOLOGIES, TechnologyInfo, MATRIX_HAZARDS, MATRIX_HAZARD_ICONS, MATRIX_HAZARD_COLORS, HazardSuitability } from "@/lib/technologyContent";
import { CAPACITY_MODELS, NON_PHYSICAL_SCALE, computePopulationServed, describeFormula, populationLoadRange, populationLoadLabel } from "@/lib/technologyCapacity";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  Droplets,
  Trash2,
  Bath,
  Wrench,
  DollarSign,
  CloudRain,
  Leaf,
  Search,
  X,
  Filter,
  Sprout,
  Map,
  ChevronDown,
  Info,
  Loader2
} from "lucide-react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import L from "leaflet";
import { useQuery } from "@tanstack/react-query";

const HAZARD_ICONS: Record<string, string> = {
  'Drought': '☀️',
  'Flood': '🌊',
  'Heatwave': '🌡️',
  'Cyclone': '🌀',
  'Cold Wave': '❄️',
  'Dust Storm': '🌪️',
  'Groundwater Depletion': '💧',
};

const TYPOLOGY_ICONS: Record<string, string> = {
  'Desert / Arid': '🏜️',
  'Rain Intensive': '🌧️',
  'Flood Prone': '🌊',
  'Rocky / Hilly': '⛰️',
  'Plains / Alluvial': '🌾',
  'Coastal': '🏖️',
};

// Each technology has a FIXED load range (min-max people it's realistically built to
// serve — see technologyCapacity.ts's populationLoadRange). The Population Load slider
// below picks a single target population on a log scale (the range spans ~1 to 500,000,
// where a linear slider would be unusable) and filters to technologies whose range
// covers it — the way an engineer actually picks a technology for a given scale,
// rather than treating all 42 as interchangeable.
const POP_SLIDER_MIN = 1;
const POP_SLIDER_MAX = 500000;
const POP_SLIDER_STEPS = 1000;

function sliderPosToPopulation(pos: number): number {
  const t = pos / POP_SLIDER_STEPS;
  const logMin = Math.log10(POP_SLIDER_MIN);
  const logMax = Math.log10(POP_SLIDER_MAX);
  return Math.round(10 ** (logMin + t * (logMax - logMin)));
}

function populationToSliderPos(pop: number): number {
  const logMin = Math.log10(POP_SLIDER_MIN);
  const logMax = Math.log10(POP_SLIDER_MAX);
  const t = (Math.log10(Math.max(POP_SLIDER_MIN, pop)) - logMin) / (logMax - logMin);
  return Math.round(t * POP_SLIDER_STEPS);
}

function iconForPopulation(pop: number): string {
  if (pop <= 15) return '🏠';
  if (pop <= 2000) return '🏘️';
  if (pop <= 20000) return '🏙️';
  return '🌆';
}

// Admin-uploaded diagrams live in the technologies DB table (see AdminDashboard's
// Technologies tab + server routes.ts), separate from the static content below --
// fetched here and merged onto the static entries by slug at render time.
async function fetchTechDiagrams(): Promise<Record<string, string>> {
  const res = await fetch('/api/technologies');
  if (!res.ok) return {};
  const rows: { slug: string; diagramUrl?: string | null }[] = await res.json();
  const map: Record<string, string> = {};
  for (const r of rows) if (r.diagramUrl) map[r.slug] = r.diagramUrl;
  return map;
}

const HAZARD_COLORS: Record<string, string> = {
  'Drought': '#f97316',
  'Flood': '#3b82f6',
  'Heatwave': '#ef4444',
  'Cyclone': '#a855f7',
  'Cold Wave': '#06b6d4',
  'Dust Storm': '#eab308',
  'Groundwater Depletion': '#14b8a6',
};

interface ClickedDistrict {
  name: string;
  state: string;
  hazards: string[];
  typologies: string[];
  vulnerabilityScore: number;
  hazardScore?: number;
  exposureScore?: number;
}

const TYPOLOGY_MAP_COLORS: Record<string, string> = {
  'Plains / Alluvial': '#4ade80',
  'Desert / Arid': '#fb923c',
  'Rocky / Hilly': '#a78bfa',
  'Coastal': '#38bdf8',
  'Rain Intensive': '#22d3ee',
  'Flood Prone': '#60a5fa',
};


// dominant_hazard values in district_rankings.json → tech filter hazard names
const DOMINANT_TO_TECH: Record<string, string[]> = {
  'flood':        ['Flood', 'Cyclone'],
  'drought':      ['Drought', 'Dust Storm', 'Groundwater Depletion'],
  'wet-bulb heat':['Heatwave'],
  'cold wave':    ['Cold Wave'],
  'landslide':    [],
};

// dominant_hazard → applicable typologies (approximate from terrain/climate patterns)
const COASTAL_STATES = new Set(['Kerala', 'Tamil Nadu', 'Andhra Pradesh', 'Telangana',
  'Odisha', 'West Bengal', 'Goa', 'Karnataka', 'Maharashtra', 'Gujarat']);
const MOUNTAIN_STATES = new Set(['Himachal Pradesh', 'Uttarakhand', 'Jammu & Kashmir',
  'Ladakh', 'Sikkim', 'Arunachal Pradesh', 'Manipur', 'Mizoram', 'Meghalaya',
  'Nagaland', 'Tripura', 'Assam']);
const DESERT_STATES = new Set(['Rajasthan', 'Gujarat']);

function getTypologiesForDistrict(dom: string, state: string): string[] {
  const t: string[] = [];
  if (dom === 'flood') {
    t.push('Flood Prone', 'Rain Intensive');
    if (COASTAL_STATES.has(state)) t.push('Coastal');
    else t.push('Plains / Alluvial');
  }
  if (dom === 'drought') {
    t.push('Desert / Arid', 'Plains / Alluvial');
  }
  if (dom === 'wet-bulb heat') {
    t.push('Plains / Alluvial');
    if (DESERT_STATES.has(state)) t.push('Desert / Arid');
  }
  if (dom === 'cold wave') {
    t.push('Rocky / Hilly');
  }
  if (dom === 'landslide') {
    t.push('Rocky / Hilly', 'Rain Intensive');
  }
  return t;
}

const DOMINANT_COLORS: Record<string, string> = {
  'flood':         '#3b82f6',
  'drought':       '#f97316',
  'wet-bulb heat': '#ef4444',
  'cold wave':     '#06b6d4',
  'landslide':     '#84cc16',
};

function HazardDistrictMap({ selectedHazards, selectedTypologies, onDistrictClick }: {
  selectedHazards: string[];
  selectedTypologies: string[];
  onDistrictClick: (d: ClickedDistrict) => void;
}) {
  const { data: geoData, isLoading } = useQuery<any>({
    queryKey: ['india-geojson'],
    queryFn: () => fetch('/data/india.json').then(r => r.json()),
    staleTime: Infinity,
  });

  const { data: rankings } = useQuery<any[]>({
    queryKey: ['district-rankings'],
    queryFn: () => fetch('/data/district_rankings.json').then(r => r.json()),
    staleTime: Infinity,
  });

  // Build lookup: NAME.toUpperCase() → ranking entry
  const rankMap = useMemo<Record<string, any>>(() => {
    if (!rankings) return {};
    const m: Record<string, any> = {};
    rankings.forEach(d => { m[d.district.toUpperCase()] = d; });
    return m;
  }, [rankings]);

  const isMatch = useCallback((feature: any): boolean => {
    const name = (feature.properties.NAME || '').toUpperCase();
    const rank = rankMap[name];
    const dom: string = rank?.dominant_hazard || '';
    const state: string = feature.properties.STATE || '';

    if (selectedHazards.length > 0) {
      const techsForDom = DOMINANT_TO_TECH[dom] || [];
      return selectedHazards.some(h => techsForDom.includes(h));
    }
    if (selectedTypologies.length > 0) {
      const typologies = getTypologiesForDistrict(dom, state);
      return selectedTypologies.some(t => typologies.includes(t));
    }
    return true;
  }, [rankMap, selectedHazards, selectedTypologies]);

  const style = useCallback((feature: any) => {
    const { VULNERABILITY = 0 } = feature.properties;

    // No filter → color by VULNERABILITY
    if (selectedHazards.length === 0 && selectedTypologies.length === 0) {
      const v = VULNERABILITY;
      const fillColor = v > 0.8 ? '#ef4444' : v > 0.6 ? '#f97316' : v > 0.4 ? '#eab308' : v > 0.2 ? '#22c55e' : '#16a34a';
      return { fillColor, weight: 0.5, color: '#1e293b', fillOpacity: 0.6 };
    }

    if (!isMatch(feature)) {
      return { fillColor: '#1e293b', weight: 0.3, color: '#0f172a', fillOpacity: 0.15 };
    }

    // Matched → color by dominant hazard
    const name = (feature.properties.NAME || '').toUpperCase();
    const rank = rankMap[name];
    const dom: string = rank?.dominant_hazard || '';
    return {
      fillColor: DOMINANT_COLORS[dom] || '#94a3b8',
      weight: 1,
      color: '#1e293b',
      fillOpacity: 0.85,
    };
  }, [isMatch, rankMap, selectedHazards, selectedTypologies]);

  const onEachFeature = useCallback((feature: any, layer: L.Layer) => {
    const { NAME, STATE, HAZARD = 0, EXPOSURE = 0, VULNERABILITY = 0 } = feature.properties;
    const rank = rankMap[(NAME || '').toUpperCase()];
    const dom: string = rank?.dominant_hazard || '';
    const domColor = DOMINANT_COLORS[dom] || '#94a3b8';

    (layer as any).on({
      mouseover: (e: any) => {
        e.target.setStyle({ weight: 2, color: '#ffffff', fillOpacity: 0.95 });
        e.target.bringToFront();
      },
      mouseout: (e: any) => {
        e.target.setStyle({ weight: 0.5, color: '#1e293b', fillOpacity: 0.6 });
      },
      click: () => {
        onDistrictClick({
          name: NAME,
          state: STATE || '',
          hazards: dom ? [dom] : [],
          typologies: getTypologiesForDistrict(dom, STATE || ''),
          vulnerabilityScore: VULNERABILITY,
          hazardScore: HAZARD,
          exposureScore: EXPOSURE,
        });
      },
    });

    const hazardLine = dom
      ? `<br/><span style="color:${domColor}">⚠ ${dom}</span>`
      : '';

    (layer as any).bindTooltip(
      `<div style="font-size:12px;line-height:1.7">
        <strong>${NAME}</strong>, ${STATE}${hazardLine}<br/>
        <span style="color:#94a3b8">Vulnerability:</span> <strong>${(VULNERABILITY * 100).toFixed(0)}%</strong>
      </div>`,
      { sticky: true, className: 'leaflet-hazard-tooltip' }
    );
  }, [rankMap, onDistrictClick]);

  const matchCount = useMemo(() => {
    if (!geoData || (selectedHazards.length === 0 && selectedTypologies.length === 0)) return 0;
    return geoData.features.filter((f: any) => isMatch(f)).length;
  }, [geoData, isMatch, selectedHazards, selectedTypologies]);

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-950 rounded-lg text-white">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">Loading district map...</span>
      </div>
    );
  }

  const hasFilter = selectedHazards.length > 0 || selectedTypologies.length > 0;

  return (
    <div className="relative h-full w-full rounded-lg overflow-hidden border border-border">
      <MapContainer
        center={[22.5, 82.0]}
        zoom={4}
        className="h-full w-full bg-slate-950"
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; Esri, HERE, Garmin, FAO, NOAA, USGS, &copy; OpenStreetMap contributors'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        />
        {geoData && (
          <GeoJSON
            data={geoData}
            style={style}
            onEachFeature={onEachFeature}
            key={`map-${selectedHazards.join(',')}-${selectedTypologies.join(',')}`}
          />
        )}
      </MapContainer>

      {/* Stats overlay */}
      {hasFilter && (
        <div className="absolute top-3 left-3 z-[1000] bg-card/95 backdrop-blur border border-border px-3 py-2 rounded-md text-xs">
          <div className="font-semibold text-foreground">{matchCount} districts match</div>
          <div className="text-muted-foreground">
            {selectedHazards.length > 0 ? selectedHazards.join(', ') : selectedTypologies.join(', ')}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-[1000] bg-card/95 backdrop-blur border border-border p-2.5 rounded-md text-xs space-y-1.5">
        {hasFilter ? (
          <>
            <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Dominant Hazard</div>
            {Object.entries(DOMINANT_COLORS).map(([dom, color]) => (
              <div key={dom} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="capitalize">{dom}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 pt-1 border-t border-border">
              <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-slate-800" />
              <span className="text-muted-foreground">Not matching</span>
            </div>
          </>
        ) : (
          <>
            <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Vulnerability</div>
            {[['#ef4444', 'Very High'], ['#f97316', 'High'], ['#eab308', 'Moderate'], ['#22c55e', 'Low']].map(([c, l]) => (
              <div key={l} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c }} />
                <span>{l}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default function TechnologyPage() {
  const [match, params] = useRoute("/technology/:slug");

  if (!match || !params?.slug) {
    return <TechnologyIndex />;
  }

  const tech = getTechnologyBySlug(params.slug);

  if (!tech) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader />
        <main className="max-w-5xl mx-auto px-6 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Technology Not Found</h2>
              <p className="text-muted-foreground mb-4">The technology you're looking for doesn't exist.</p>
              <Link href="/technology">
                <Button data-testid="button-back-to-technologies">View All Technologies</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return <TechnologyDetail tech={tech} />;
}

function PageHeader({ showTechLink = false }: { showTechLink?: boolean }) {
  return (
    <header className="sticky top-0 z-10 bg-[#00AEEF] text-white shadow-md">
      <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
        <Link href="/" className="font-bold text-lg flex items-center gap-2" data-testid="link-home">
          <span>💧</span> ClimateAdapt India
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-white/80 hover:text-white font-medium" data-testid="link-dashboard">Map Dashboard</Link>
          {showTechLink && (
            <Link href="/technology" className="text-sm text-white/80 hover:text-white font-medium" data-testid="link-technologies">Technologies</Link>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

// Real capacity calculator: population served = design parameter ÷ published per-capita
// design norm (CPHEEO/IS 2470/BORDA/Sphere — see technologyCapacity.ts for citations),
// not a hand-picked range. Editable so it reflects an actual installation's dimensions,
// not just the reference default.
function CapacityCalculator({ slug }: { slug: string }) {
  const model = CAPACITY_MODELS[slug];
  const [param, setParam] = useState<number>(model?.defaultParam ?? 0);

  if (!model) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <span>👥</span> Population Served
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{NON_PHYSICAL_SCALE[slug] ?? 'Not applicable.'}</p>
          <p className="text-xs text-muted-foreground/70 mt-2 italic">
            This isn't sized by a per-person design formula the way a treatment unit is — see the note above.
          </p>
        </CardContent>
      </Card>
    );
  }

  const population = computePopulationServed(model, param);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span>🧮</span> Population Served Calculator
        </CardTitle>
        <CardDescription className="text-xs">{model.source}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">{model.paramLabel}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={model.minParam}
                max={model.maxParam}
                step="any"
                value={param}
                onChange={e => setParam(Math.min(model.maxParam, Math.max(model.minParam, Number(e.target.value) || model.minParam)))}
                className="w-36 h-9"
                data-testid="input-capacity-param"
              />
              <span className="text-sm text-muted-foreground">{model.paramUnit}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Realistic range: {model.minParam}-{model.maxParam}{model.paramUnit}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setParam(model.defaultParam)}>
            Reset to reference default ({model.defaultParam}{model.paramUnit})
          </Button>
        </div>

        <div className="flex items-center gap-3 bg-purple-500/10 rounded-lg px-4 py-3">
          <span className="text-2xl">{iconForPopulation(population)}</span>
          <div>
            <div className="text-lg font-bold text-purple-700 dark:text-purple-400" data-testid="text-computed-population">
              ≈{Math.round(population).toLocaleString()} people served
            </div>
            <div className="text-xs text-muted-foreground">
              Fixed real-world range for this technology: {populationLoadLabel(slug)}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground italic">{describeFormula(model)}</p>
        <p className="text-[11px] text-muted-foreground">
          This is a reference-design estimate. Real capacity depends on soil type, occupancy pattern, local
          regulations, and site conditions — treat it as a sizing starting point, not a substitute for a site survey.
        </p>
      </CardContent>
    </Card>
  );
}

function TechnologyDetail({ tech: baseTech }: { tech: TechnologyInfo }) {
  const diagramsQ = useQuery({ queryKey: ['tech-diagrams'], queryFn: fetchTechDiagrams, staleTime: 60_000 });
  const tech = diagramsQ.data?.[baseTech.slug] ? { ...baseTech, diagramUrl: diagramsQ.data[baseTech.slug] } : baseTech;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'sanitation': return <Bath className="h-5 w-5" />;
      case 'water': return <Droplets className="h-5 w-5" />;
      case 'waste': return <Trash2 className="h-5 w-5" />;
      case 'adaptation': return <Sprout className="h-5 w-5" />;
      default: return <Leaf className="h-5 w-5" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'sanitation': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'water': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'waste': return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
      case 'adaptation': return 'bg-green-500/10 text-green-600 border-green-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'Low': return 'bg-green-500/10 text-green-600';
      case 'Medium': return 'bg-yellow-500/10 text-yellow-600';
      case 'High': return 'bg-red-500/10 text-red-600';
      default: return 'bg-gray-500/10 text-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid={`page-technology-${tech.slug}`}>
      <PageHeader showTechLink />
      <main className="max-w-5xl mx-auto px-6 py-8">
        <Link href="/technology" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6" data-testid="link-back">
          <ArrowLeft className="h-4 w-4" />
          Back to Technologies
        </Link>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <Badge variant="outline" className={getCategoryColor(tech.category)}>
                    {getCategoryIcon(tech.category)}
                    <span className="ml-1 capitalize">{tech.category}</span>
                  </Badge>
                  <CardTitle className="text-2xl mt-3" data-testid="text-technology-title">{tech.title}</CardTitle>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Badge className={getLevelColor(tech.maintenanceLevel)}>
                    <Wrench className="h-3 w-3 mr-1" />
                    {tech.maintenanceLevel} Maintenance
                  </Badge>
                  <Badge className={getLevelColor(tech.costLevel)}>
                    <DollarSign className="h-3 w-3 mr-1" />
                    {tech.costLevel} Cost
                  </Badge>
                  <Badge className="bg-purple-500/10 text-purple-600" data-testid="badge-population-load">
                    <span className="mr-1">{iconForPopulation(populationLoadRange(tech.slug)[0])}</span>
                    {populationLoadLabel(tech.slug)}
                  </Badge>
                </div>
              </div>
              <CardDescription className="text-base mt-2" data-testid="text-technology-description">
                {tech.description}
              </CardDescription>
            </CardHeader>
          </Card>

          <CapacityCalculator slug={tech.slug} />

          {/* Technical drawing -- admin-uploaded, see /admin > Technologies. Only shown
              once someone has actually uploaded one for this technology. */}
          {tech.diagramUrl ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span>📐</span> Technical Drawing
                </CardTitle>
              </CardHeader>
              <CardContent>
                <img
                  src={tech.diagramUrl}
                  alt={`${tech.title} technical drawing`}
                  className="w-full max-h-[520px] object-contain rounded-lg border border-border bg-muted"
                  data-testid="img-technology-diagram"
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No technical drawing uploaded yet for this technology.{' '}
                <Link href="/admin" className="text-[#00AEEF] hover:underline">Add one from the admin panel</Link>.
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CloudRain className="h-5 w-5 text-blue-500" />
                  Climate Hazards Addressed
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {tech.relatedHazards.map((hazard, i) => (
                    <Badge key={i} variant="secondary" className="bg-orange-500/10 text-orange-600 border border-orange-500/20" data-testid={`badge-hazard-${i}`}>
                      <span className="mr-1">{HAZARD_ICONS[hazard] || '⚠️'}</span>
                      {hazard}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground" data-testid="text-climate-resilience">{tech.climateResilience}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Leaf className="h-5 w-5 text-green-500" />
                  Suitable Landscape Typology
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {tech.typology.map((t, i) => (
                    <Badge key={i} variant="secondary" className="bg-green-500/10 text-green-700 border border-green-500/20" data-testid={`badge-typology-${i}`}>
                      <span className="mr-1">{TYPOLOGY_ICONS[t] || '🌍'}</span>
                      {t}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  Advantages
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {tech.advantages.map((adv, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" data-testid={`text-advantage-${i}`}>
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      {adv}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="h-5 w-5" />
                  Limitations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {tech.limitations.map((lim, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" data-testid={`text-limitation-${i}`}>
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      {lim}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Suitable Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-3">
                {tech.suitableConditions.map((condition, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-secondary/50 p-3 rounded-lg" data-testid={`text-condition-${i}`}>
                    <Leaf className="h-4 w-4 text-green-500 shrink-0" />
                    {condition}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Hazard Suitability Matrix */}
          {tech.hazardSuitability && (
            <Card data-testid="card-hazard-suitability-matrix">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="text-lg">🗂️</span>
                  Climate Hazard Suitability Matrix
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Source: WASH Technology Climate Matrix (WHO). ✓ Recommended — deploy with standard design.&nbsp;
                  ~ Conditional — use with design modifications. ✗ Not Suitable — select an alternative.
                </p>
                {tech.matrixContext && (
                  <p className="text-xs italic text-muted-foreground mt-0.5">Context: {tech.matrixContext}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {MATRIX_HAZARDS.map(hazard => {
                    const rating = tech.hazardSuitability![hazard];
                    if (!rating) return null;
                    const cfg = {
                      recommended: { label: '✓ Recommended', bg: 'bg-green-500/10 border-green-500/30', text: 'text-green-700 dark:text-green-400', icon: '✓' },
                      conditional: { label: '~ Conditional', bg: 'bg-yellow-500/10 border-yellow-500/30', text: 'text-yellow-700 dark:text-yellow-400', icon: '~' },
                      not_suitable: { label: '✗ Not Suitable', bg: 'bg-red-500/10 border-red-500/20', text: 'text-red-600/70 dark:text-red-400/70', icon: '✗' },
                    }[rating];
                    return (
                      <div
                        key={hazard}
                        className={`flex flex-col gap-1 p-2.5 rounded-lg border ${cfg.bg} ${rating === 'not_suitable' ? 'opacity-60' : ''}`}
                        data-testid={`suitability-${hazard.toLowerCase().replace(/[ /]/g, '-')}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-base">{MATRIX_HAZARD_ICONS[hazard]}</span>
                          <span className={`text-sm font-bold ${cfg.text}`}>{cfg.icon}</span>
                        </div>
                        <div className="text-xs font-semibold text-foreground leading-tight">{hazard}</div>
                        <div className={`text-[10px] font-medium ${cfg.text}`}>{cfg.label}</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

function TechnologyIndex() {
  const diagramsQ = useQuery({ queryKey: ['tech-diagrams'], queryFn: fetchTechDiagrams, staleTime: 60_000 });
  const allTech = useMemo(() => {
    const diagrams = diagramsQ.data;
    if (!diagrams) return getAllTechnologies();
    return getAllTechnologies().map(t => diagrams[t.slug] ? { ...t, diagramUrl: diagrams[t.slug] } : t);
  }, [diagramsQ.data]);
  const search = useSearch();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHazards, setSelectedHazards] = useState<string[]>(() => {
    const hazard = new URLSearchParams(search).get('hazard');
    return hazard && (ALL_HAZARDS as readonly string[]).includes(hazard) ? [hazard] : [];
  });
  const [selectedTypologies, setSelectedTypologies] = useState<string[]>([]);
  const [loadSliderPos, setLoadSliderPos] = useState<number | null>(null); // null = filter off
  const [activeMatrixHazard, setActiveMatrixHazard] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);
  const [clickedDistrict, setClickedDistrict] = useState<ClickedDistrict | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleDistrictClick = (d: ClickedDistrict) => {
    setClickedDistrict(d);
    // Auto-apply typologies derived from dominant hazard
    if (d.typologies.length > 0) setSelectedTypologies(d.typologies);
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  const toggleHazard = (h: string) => {
    setSelectedHazards(prev => prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h]);
    setClickedDistrict(null);
  };

  const toggleTypology = (t: string) => {
    setSelectedTypologies(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const clearFilters = () => {
    setSelectedHazards([]);
    setSelectedTypologies([]);
    setLoadSliderPos(null);
    setSearchQuery('');
    setClickedDistrict(null);
    setActiveMatrixHazard(null);
  };

  const targetPopulation = loadSliderPos !== null ? sliderPosToPopulation(loadSliderPos) : null;

  const filtered = allTech.filter(tech => {
    const matchesSearch = !searchQuery ||
      tech.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tech.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesHazard = selectedHazards.length === 0 ||
      selectedHazards.some(h => tech.relatedHazards.includes(h));

    const matchesTypology = selectedTypologies.length === 0 ||
      selectedTypologies.some(t => tech.typology.includes(t));

    const matchesLoad = targetPopulation === null || (() => {
      const [min, max] = populationLoadRange(tech.slug);
      return targetPopulation >= min && targetPopulation <= max;
    })();

    // Matrix suitability filter — show only recommended or conditional for the active hazard
    const matchesSuitability = !activeMatrixHazard ||
      (tech.hazardSuitability && tech.hazardSuitability[activeMatrixHazard] !== 'not_suitable');

    return matchesSearch && matchesHazard && matchesTypology && matchesLoad && matchesSuitability;
  });

  const activeFilterCount = selectedHazards.length + selectedTypologies.length + (loadSliderPos !== null ? 1 : 0) + (searchQuery ? 1 : 0) + (activeMatrixHazard ? 1 : 0);

  const categoryOrder = ['sanitation', 'water', 'waste', 'adaptation'] as const;
  const categoryLabels = {
    sanitation: { label: 'Sanitation Technologies', icon: <Bath className="h-5 w-5 text-emerald-500" /> },
    water: { label: 'Water Technologies', icon: <Droplets className="h-5 w-5 text-blue-500" /> },
    waste: { label: 'Waste Management', icon: <Trash2 className="h-5 w-5 text-orange-500" /> },
    adaptation: { label: 'Climate Adaptation', icon: <Sprout className="h-5 w-5 text-green-500" /> },
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-technology-index">
      <PageHeader />

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4" data-testid="link-back-home">
            <ArrowLeft className="h-4 w-4" />
            Back to Map Dashboard
          </Link>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Climate-Resilient WASH Technologies</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Explore sanitation, water, and adaptation technologies suited to different climate hazards and landscape typologies across India's 735 districts.
          </p>
        </div>

        {/* Filter Panel */}
        <div className="bg-card border border-border rounded-xl p-5 mb-8 space-y-5 shadow-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Filter className="h-4 w-4 text-[#00AEEF]" />
              Filters
            </div>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-xs gap-1 text-muted-foreground" data-testid="button-clear-filters">
                <X className="h-3 w-3" /> Clear all ({activeFilterCount})
              </Button>
            )}
            <div className="ml-auto">
              <Button
                variant={showMap ? "default" : "outline"}
                size="sm"
                onClick={() => setShowMap(v => !v)}
                className={`h-7 px-3 text-xs gap-1.5 ${showMap ? 'bg-[#00AEEF] text-white hover:bg-[#0097d1]' : ''}`}
                data-testid="button-toggle-map"
              >
                <Map className="h-3 w-3" />
                {showMap ? 'Hide Map' : 'Show District Map'}
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search technologies..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-tech"
            />
          </div>

          {/* Hazard Filter */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
              By Climate Hazard
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_HAZARDS.map(h => (
                <button
                  key={h}
                  onClick={() => toggleHazard(h)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    selectedHazards.includes(h)
                      ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                      : 'bg-background text-foreground border-border hover:border-orange-400 hover:text-orange-600'
                  }`}
                  data-testid={`filter-hazard-${h.toLowerCase().replace(/ /g, '-')}`}
                >
                  <span>{HAZARD_ICONS[h]}</span> {h}
                </button>
              ))}
            </div>
          </div>

          {/* Typology Filter */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                By Landscape Typology
              </div>
              {selectedTypologies.length > 0 && (
                <span className="text-xs text-[#00AEEF] font-medium">
                  {filtered.length} tech{filtered.length !== 1 ? 's' : ''} match
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {ALL_TYPOLOGIES.map(t => (
                <button
                  key={t}
                  onClick={() => toggleTypology(t)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    selectedTypologies.includes(t)
                      ? 'bg-[#00AEEF] text-white border-[#00AEEF] shadow-sm'
                      : 'bg-background text-foreground border-border hover:border-[#00AEEF] hover:text-[#00AEEF]'
                  }`}
                  data-testid={`filter-typology-${t.toLowerCase().replace(/[ /]/g, '-')}`}
                >
                  <span>{TYPOLOGY_ICONS[t]}</span> {t}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Typology filters the <strong>technology list</strong> and <strong>highlights matching districts on the map</strong> (when no hazard is selected).
            </p>
          </div>

          {/* Population Load Filter */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                By Population Load
              </div>
              {loadSliderPos !== null && (
                <button
                  onClick={() => setLoadSliderPos(null)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
            <div className="flex items-center gap-4">
              <Slider
                min={0}
                max={POP_SLIDER_STEPS}
                step={1}
                value={[loadSliderPos ?? populationToSliderPos(200)]}
                onValueChange={([v]) => setLoadSliderPos(v)}
                className="flex-1"
                data-testid="slider-population-load"
              />
              <div className="shrink-0 w-40 text-sm font-semibold text-purple-600 flex items-center gap-1.5">
                <span>{iconForPopulation(targetPopulation ?? 200)}</span>
                {(targetPopulation ?? 200).toLocaleString()} people
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Each technology has a fixed real-world size range (e.g. a twin-pit is built 0.5-2.5m³, not any size you like) — this
              shows which ones are actually built for the population you pick, not an editable estimate.
            </p>
          </div>

          {/* Hazard Suitability Matrix Filter */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <span>🗂️</span> Climate Hazard Suitability (Matrix)
              </div>
              {activeMatrixHazard && (
                <button
                  onClick={() => setActiveMatrixHazard(null)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {MATRIX_HAZARDS.map(h => (
                <button
                  key={h}
                  onClick={() => setActiveMatrixHazard(prev => prev === h ? null : h)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    activeMatrixHazard === h
                      ? 'text-white shadow-sm border-transparent'
                      : 'bg-background text-foreground border-border hover:border-current'
                  }`}
                  style={activeMatrixHazard === h ? { background: MATRIX_HAZARD_COLORS[h] } : {
                    '--tw-ring-color': MATRIX_HAZARD_COLORS[h],
                  } as React.CSSProperties}
                  data-testid={`filter-matrix-hazard-${h.toLowerCase().replace(/[ /]/g, '-')}`}
                >
                  <span>{MATRIX_HAZARD_ICONS[h]}</span> {h}
                </button>
              ))}
            </div>
            {activeMatrixHazard ? (
              <p className="text-[11px] text-muted-foreground">
                Showing technologies <strong>Recommended ✓</strong> or <strong>Conditional ~</strong> for <strong>{activeMatrixHazard}</strong>.
                Each card shows its suitability rating for this hazard.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Select a hazard to filter by the <strong>WASH Technology Climate Matrix</strong> — shows ✓ Recommended, ~ Conditional, and hides ✗ Not Suitable technologies.
              </p>
            )}
          </div>
        </div>

        {/* District Hazard Map */}
        {showMap && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Map className="h-4 w-4 text-[#00AEEF]" />
                  District Hazard Map
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedHazards.length > 0
                    ? `Showing districts affected by: ${selectedHazards.join(', ')}. Click any district for details.`
                    : 'Select a hazard filter above to highlight affected districts. Click a district for details.'}
                </p>
              </div>
            </div>

            <div className="h-[420px] w-full rounded-xl overflow-hidden shadow-md">
              <HazardDistrictMap
                selectedHazards={selectedHazards}
                selectedTypologies={selectedTypologies}
                onDistrictClick={handleDistrictClick}
              />
            </div>

            {/* Clicked district info panel */}
            {clickedDistrict && (
              <div className="mt-3 p-4 bg-card border border-border rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="h-4 w-4 text-[#00AEEF]" />
                  <h3 className="font-semibold text-base">{clickedDistrict.name}</h3>
                  {clickedDistrict.state && (
                    <span className="text-xs text-muted-foreground">{clickedDistrict.state}</span>
                  )}
                  <button onClick={() => setClickedDistrict(null)} className="ml-auto text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {[
                    { label: 'Hazard', val: clickedDistrict.hazardScore ?? 0, max: 0.52 },
                    { label: 'Exposure', val: clickedDistrict.exposureScore ?? 0, max: 0.58 },
                    { label: 'Vulnerability', val: clickedDistrict.vulnerabilityScore, max: 1 },
                  ].map(({ label, val, max }) => {
                    const pct = Math.round((val / max) * 100);
                    const color = pct > 60 ? '#ef4444' : pct > 40 ? '#f97316' : pct > 20 ? '#eab308' : '#22c55e';
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-mono">{val.toFixed(3)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Use the <strong>hazard</strong> and <strong>typology</strong> filters above to find suitable technologies for this region.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Results count + district filter banner */}
        <div ref={resultsRef} className="flex items-center justify-between mb-4 scroll-mt-6">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {allTech.length} technologies
            {clickedDistrict && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-[#00AEEF]/10 text-[#00AEEF] border border-[#00AEEF]/25">
                <Map className="h-3 w-3" />
                Auto-filtered for {clickedDistrict.name}
                <button
                  onClick={clearFilters}
                  className="ml-1 hover:text-foreground transition-colors"
                  title="Clear district filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No technologies match your filters</h3>
            <p className="text-muted-foreground mb-4">Try removing some filters or adjusting your search.</p>
            <Button variant="outline" onClick={clearFilters} data-testid="button-clear-no-results">Clear Filters</Button>
          </div>
        ) : (
          <div className="space-y-10">
            {categoryOrder.map(cat => {
              const catTechs = filtered.filter(t => t.category === cat);
              if (catTechs.length === 0) return null;
              const { label, icon } = categoryLabels[cat];
              return (
                <section key={cat}>
                  <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                    {icon} {label}
                    <span className="text-sm font-normal text-muted-foreground ml-1">({catTechs.length})</span>
                  </h2>
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {catTechs.map(tech => (
                      <TechnologyCard key={tech.slug} tech={tech} selectedHazards={selectedHazards} selectedTypologies={selectedTypologies} activeMatrixHazard={activeMatrixHazard} />
                    ))}
                  </div>
                  <Separator className="mt-10" />
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function TechnologyCard({ tech, selectedHazards, selectedTypologies, activeMatrixHazard }: {
  tech: TechnologyInfo;
  selectedHazards: string[];
  selectedTypologies: string[];
  activeMatrixHazard?: string | null;
}) {
  const getLevelDot = (level: string) => {
    switch (level) {
      case 'Low': return 'bg-green-500';
      case 'Medium': return 'bg-yellow-500';
      case 'High': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  const suitability = activeMatrixHazard && tech.hazardSuitability
    ? tech.hazardSuitability[activeMatrixHazard] as HazardSuitability | undefined
    : undefined;

  const suitabilityConfig = {
    recommended: { label: '✓ Recommended', className: 'bg-green-500 text-white', border: 'border-green-400' },
    conditional: { label: '~ Conditional', className: 'bg-yellow-500 text-white', border: 'border-yellow-400' },
    not_suitable: { label: '✗ Not Suitable', className: 'bg-red-500 text-white', border: 'border-red-400' },
  };

  return (
    <Link href={`/technology/${tech.slug}`} data-testid={`link-technology-${tech.slug}`}>
      <Card className={`h-full hover:shadow-lg transition-all cursor-pointer group overflow-hidden ${
        suitability === 'recommended' ? 'border-green-400/60 hover:border-green-400' :
        suitability === 'conditional' ? 'border-yellow-400/60 hover:border-yellow-400' :
        suitability === 'not_suitable' ? 'border-red-400/30 opacity-70 hover:border-red-400/50' :
        'hover:border-[#00AEEF]/50'
      }`}>
        {tech.diagramUrl && (
          <img src={tech.diagramUrl} alt={`${tech.title} diagram`} className="w-full h-32 object-cover border-b border-border bg-muted" />
        )}
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base group-hover:text-[#00AEEF] transition-colors leading-tight">{tech.title}</CardTitle>
            {suitability && (
              <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${suitabilityConfig[suitability].className}`}>
                {suitabilityConfig[suitability].label}
              </span>
            )}
          </div>
          {activeMatrixHazard && tech.matrixContext && (
            <p className="text-[10px] text-muted-foreground italic mt-0.5">{tech.matrixContext}</p>
          )}
          <CardDescription className="line-clamp-2 text-xs mt-1">{tech.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Hazard badges - highlight matching ones */}
          {tech.relatedHazards.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tech.relatedHazards.map((h, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    selectedHazards.includes(h)
                      ? 'bg-orange-500 text-white'
                      : 'bg-orange-500/10 text-orange-600'
                  }`}
                >
                  {HAZARD_ICONS[h]} {h}
                </span>
              ))}
            </div>
          )}
          {/* Typology badges */}
          <div className="flex flex-wrap gap-1">
            {tech.typology.map((t, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  selectedTypologies.includes(t)
                    ? 'bg-[#00AEEF] text-white'
                    : 'bg-[#00AEEF]/10 text-[#00AEEF]'
                }`}
              >
                {TYPOLOGY_ICONS[t]} {t}
              </span>
            ))}
          </div>
          {/* Cost & Maintenance */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t border-border">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${getLevelDot(tech.maintenanceLevel)}`}></span>
              {tech.maintenanceLevel} Maint.
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${getLevelDot(tech.costLevel)}`}></span>
              {tech.costLevel} Cost
            </span>
            {tech.matrixCategory && (
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                {tech.matrixCategory}
              </span>
            )}
          </div>
          <div className="text-[10px] text-purple-600 flex items-center gap-1" title={populationLoadLabel(tech.slug)}>
            {iconForPopulation(populationLoadRange(tech.slug)[0])} {populationLoadLabel(tech.slug)}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
