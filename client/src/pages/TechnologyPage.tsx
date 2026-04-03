import { useState, useEffect, useCallback, useRef } from "react";
import { useRoute, Link } from "wouter";
import { getTechnologyBySlug, getAllTechnologies, ALL_HAZARDS, ALL_TYPOLOGIES, TechnologyInfo, getRecommendedTechnologies, MATRIX_HAZARDS, MATRIX_HAZARD_ICONS, MATRIX_HAZARD_COLORS, HazardSuitability } from "@/lib/technologyContent";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Input } from "@/components/ui/input";
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
  soilType?: string;
  waterAccessPercent?: number;
  toiletCoveragePercent?: number;
}

const TYPOLOGY_MAP_COLORS: Record<string, string> = {
  'Plains / Alluvial': '#4ade80',
  'Desert / Arid': '#fb923c',
  'Rocky / Hilly': '#a78bfa',
  'Coastal': '#38bdf8',
  'Rain Intensive': '#22d3ee',
  'Flood Prone': '#60a5fa',
};

function getDistrictTypologies(d: any): string[] {
  const soil: string = d.soilType || '';
  const rock: string = d.rockType || '';
  const risks: string[] = d.climateRisks || [];
  const result: string[] = [];
  if (['Alluvial', 'Loamy', 'Black Cotton'].includes(soil)) result.push('Plains / Alluvial');
  if (soil === 'Sandy') result.push('Desert / Arid');
  if (['Granite', 'Basalt', 'Limestone', 'Shale', 'Sandstone'].includes(rock) && soil !== 'Alluvial') result.push('Rocky / Hilly');
  if (risks.includes('Cyclone')) result.push('Coastal');
  if (risks.includes('Flood') && ['Alluvial', 'Loamy'].includes(soil)) result.push('Rain Intensive');
  if (risks.includes('Flood')) result.push('Flood Prone');
  return result;
}

function HazardDistrictMap({ selectedHazards, selectedTypologies, onDistrictClick }: {
  selectedHazards: string[];
  selectedTypologies: string[];
  onDistrictClick: (d: ClickedDistrict) => void;
}) {
  const [geoJsonData, setGeoJsonData] = useState<any>(null);
  const [districtDataMap, setDistrictDataMap] = useState<Record<string, any>>({});

  const { data: districts } = useQuery<any[]>({
    queryKey: ['districts'],
    queryFn: () => fetch('/api/districts').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    fetch('/data/india.json')
      .then(r => r.json())
      .then(setGeoJsonData)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (districts) {
      const rec: Record<string, any> = {};
      districts.forEach((d: any) => { rec[d.name.toUpperCase()] = d; });
      setDistrictDataMap(rec);
    }
  }, [districts]);

  const style = useCallback((feature: any) => {
    const name = feature.properties.DISTRICT?.toUpperCase();
    const data = name ? districtDataMap[name] : undefined;
    if (!data) return { fillColor: '#334155', weight: 0.5, opacity: 1, color: '#1e293b', fillOpacity: 0.25 };

    // Typology mode: when typologies are selected and no hazards
    if (selectedHazards.length === 0 && selectedTypologies.length > 0) {
      const districtTypologies = getDistrictTypologies(data);
      const matchingTypology = selectedTypologies.find(t => districtTypologies.includes(t));
      if (!matchingTypology) {
        return { fillColor: '#334155', weight: 0.5, opacity: 1, color: '#0f172a', fillOpacity: 0.15 };
      }
      return {
        fillColor: TYPOLOGY_MAP_COLORS[matchingTypology] || '#94a3b8',
        weight: 1,
        opacity: 1,
        color: '#1e293b',
        fillOpacity: 0.8,
      };
    }

    // No filters: color by vulnerability
    if (selectedHazards.length === 0) {
      const v = data.vulnerabilityScore ?? 0;
      let fillColor = '#16a34a';
      if (v > 0.8) fillColor = '#ef4444';
      else if (v > 0.6) fillColor = '#f97316';
      else if (v > 0.4) fillColor = '#eab308';
      else if (v > 0.2) fillColor = '#22c55e';
      return { fillColor, weight: 0.5, opacity: 1, color: '#1e293b', fillOpacity: 0.55 };
    }

    // Hazard mode — color by number of matching hazards
    const risks: string[] = data.climateRisks || [];
    const intensities: Record<string, number> = data.hazardIntensities || {};
    const matchingHazards = selectedHazards.filter(h => risks.includes(h));
    if (matchingHazards.length === 0) {
      return { fillColor: '#334155', weight: 0.5, opacity: 1, color: '#0f172a', fillOpacity: 0.2 };
    }
    if (matchingHazards.length >= 3) {
      // 3+ hazards: critical multi-hazard — violet
      return { fillColor: '#7c3aed', weight: 1.5, opacity: 1, color: '#1e293b', fillOpacity: 0.9 };
    }
    if (matchingHazards.length === 2) {
      // 2 hazards: compound risk — rose/red
      return { fillColor: '#f43f5e', weight: 1.5, opacity: 1, color: '#1e293b', fillOpacity: 0.85 };
    }
    // Exactly 1 matching hazard — use that hazard's specific color
    const intensity = intensities[matchingHazards[0]] ?? null;
    const fillOpacity = intensity !== null ? 0.25 + intensity * 0.7 : 0.75;
    return {
      fillColor: HAZARD_COLORS[matchingHazards[0]] || '#888',
      weight: 1,
      opacity: 1,
      color: '#1e293b',
      fillOpacity,
    };
  }, [districtDataMap, selectedHazards, selectedTypologies]);

  const onEachFeature = useCallback((feature: any, layer: L.Layer) => {
    const name = feature.properties.DISTRICT?.toUpperCase();
    const data = name ? districtDataMap[name] : undefined;
    if (!data) return;

    const risks: string[] = data.climateRisks || [];
    const isAffected = selectedHazards.length === 0 || selectedHazards.some(h => risks.includes(h));

    (layer as any).on({
      mouseover: (e: any) => {
        e.target.setStyle({ weight: 2, color: '#ffffff', fillOpacity: 0.95 });
        e.target.bringToFront();
      },
      mouseout: (e: any) => {
        e.target.setStyle({
          weight: isAffected ? 1 : 0.5,
          color: isAffected ? '#1e293b' : '#0f172a',
          fillOpacity: isAffected ? (selectedHazards.length === 0 ? 0.55 : 0.8) : 0.2,
        });
      },
      click: () => {
        onDistrictClick({
          name: data.name,
          state: data.state || '',
          hazards: risks,
          typologies: getDistrictTypologies(data),
          vulnerabilityScore: data.vulnerabilityScore ?? 0,
          soilType: data.soilType,
          waterAccessPercent: data.waterAccessPercent,
          toiletCoveragePercent: data.toiletCoveragePercent,
        });
      },
    });

    const matchCount = selectedHazards.length > 0
      ? selectedHazards.filter(h => risks.includes(h)).length
      : 0;
    const intensities: Record<string, number> = data.hazardIntensities || {};

    const intensityLines = selectedHazards
      .filter(h => risks.includes(h) && intensities[h] != null)
      .map(h => `<span style="color:${HAZARD_COLORS[h]}">${HAZARD_ICONS[h]} ${h}: <strong>${Math.round(intensities[h] * 100)}%</strong></span>`)
      .join('<br/>');

    const districtTypologies = getDistrictTypologies(data);
    const matchingTypologies = selectedTypologies.filter(t => districtTypologies.includes(t));
    const typologyLine = matchingTypologies.length > 0
      ? `<br/><span style="color:#94a3b8;font-size:11px">Landscape: </span>${matchingTypologies.map(t => `<span style="color:${TYPOLOGY_MAP_COLORS[t]}">${t}</span>`).join(', ')}`
      : '';

    (layer as any).bindTooltip(
      `<div style="font-size:12px;line-height:1.6">
        <strong>${data.name}</strong>${data.state ? `, ${data.state}` : ''}<br/>
        ${risks.length > 0 ? risks.map((r: string) => `<span style="color:${HAZARD_COLORS[r] || '#aaa'}">${HAZARD_ICONS[r] || '⚠️'} ${r}</span>`).join(' · ') : 'No risk data'}
        ${typologyLine}
        ${intensityLines ? `<br/><span style="font-size:11px;color:#94a3b8">Intensity:</span><br/>${intensityLines}` : ''}
        ${matchCount >= 3 && !intensityLines ? `<br/><span style="color:#a78bfa;font-size:11px;font-weight:600">⚠ ${matchCount} hazards — Critical Multi-Hazard</span>` : matchCount === 2 && !intensityLines ? `<br/><span style="color:#f43f5e;font-size:11px;font-weight:600">⚠ 2 hazards — Compound Risk</span>` : matchCount === 1 && !intensityLines ? `<br/><span style="color:#86efac;font-size:11px">1 hazard match</span>` : ''}
      </div>`,
      { sticky: true, className: 'leaflet-hazard-tooltip' }
    );
  }, [districtDataMap, selectedHazards, selectedTypologies, onDistrictClick]);

  if (!geoJsonData || Object.keys(districtDataMap).length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-950 rounded-lg text-white">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">Loading district map...</span>
      </div>
    );
  }

  const affectedCount = selectedHazards.length > 0
    ? Object.values(districtDataMap).filter(d => {
        const risks: string[] = d.climateRisks || [];
        return selectedHazards.some(h => risks.includes(h));
      }).length
    : 0;

  return (
    <div className="relative h-full w-full rounded-lg overflow-hidden border border-border">
      <MapContainer
        center={[22.5, 82.0]}
        zoom={4}
        className="h-full w-full bg-slate-950"
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {geoJsonData && (
          <GeoJSON
            data={geoJsonData}
            style={style}
            onEachFeature={onEachFeature}
            key={`map-${selectedHazards.join(',')}-${selectedTypologies.join(',')}-${Object.keys(districtDataMap).length}`}
          />
        )}
      </MapContainer>

      {/* Stats overlay */}
      {selectedHazards.length > 0 && (
        <div className="absolute top-3 left-3 z-[1000] bg-card/95 backdrop-blur border border-border px-3 py-2 rounded-md text-xs">
          <div className="font-semibold text-foreground">{affectedCount} districts affected</div>
          <div className="text-muted-foreground">by {selectedHazards.join(' or ')}</div>
        </div>
      )}
      {selectedHazards.length === 0 && selectedTypologies.length > 0 && (
        <div className="absolute top-3 left-3 z-[1000] bg-card/95 backdrop-blur border border-border px-3 py-2 rounded-md text-xs">
          <div className="font-semibold text-foreground">
            {Object.values(districtDataMap).filter(d => selectedTypologies.some(t => getDistrictTypologies(d).includes(t))).length} districts match
          </div>
          <div className="text-muted-foreground">{selectedTypologies.join(', ')}</div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-[1000] bg-card/95 backdrop-blur border border-border p-2.5 rounded-md text-xs space-y-1.5 max-w-[180px]">
        {selectedHazards.length > 0 ? (
          <>
            <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Hazard Filter</div>
            {selectedHazards.map(h => (
              <div key={h} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: HAZARD_COLORS[h] }} />
                <span>{HAZARD_ICONS[h]} {h} only</span>
              </div>
            ))}
            {selectedHazards.length > 1 && (
              <>
                <div className="border-t border-border my-1" />
                <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Multi-Hazard</div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: '#f43f5e' }} />
                  <span>2 hazards</span>
                </div>
                {selectedHazards.length > 2 && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: '#7c3aed' }} />
                    <span>3+ hazards</span>
                  </div>
                )}
              </>
            )}
            <div className="flex items-center gap-1.5 pt-1 border-t border-border">
              <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-slate-600" />
              <span className="text-muted-foreground">Not affected</span>
            </div>
          </>
        ) : selectedTypologies.length > 0 ? (
          <>
            <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Landscape Typology</div>
            {selectedTypologies.map(t => (
              <div key={t} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TYPOLOGY_MAP_COLORS[t] || '#888' }} />
                <span>{t}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 pt-1 border-t border-border">
              <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-slate-600 opacity-50" />
              <span className="text-muted-foreground">Not matching</span>
            </div>
          </>
        ) : (
          <>
            <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Vulnerability Index</div>
            {[['#ef4444','Very High'],['#f97316','High'],['#eab308','Moderate'],['#22c55e','Low'],['#16a34a','Very Low']].map(([c,l]) => (
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

function TechnologyDetail({ tech }: { tech: TechnologyInfo }) {
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
                </div>
              </div>
              <CardDescription className="text-base mt-2" data-testid="text-technology-description">
                {tech.description}
              </CardDescription>
            </CardHeader>
          </Card>

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
                  Source: WASH Technology Climate Matrix (UNICEF / WHO). ✓ Recommended — deploy with standard design.&nbsp;
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
  const allTech = getAllTechnologies();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHazards, setSelectedHazards] = useState<string[]>([]);
  const [selectedTypologies, setSelectedTypologies] = useState<string[]>([]);
  const [activeMatrixHazard, setActiveMatrixHazard] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [clickedDistrict, setClickedDistrict] = useState<ClickedDistrict | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleDistrictClick = (d: ClickedDistrict) => {
    setClickedDistrict(d);
    // Auto-apply hazard and typology filters from the district
    if (d.hazards.length > 0) setSelectedHazards(d.hazards);
    if (d.typologies.length > 0) setSelectedTypologies(d.typologies);
    // Scroll to the technology results
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
    setSearchQuery('');
    setClickedDistrict(null);
    setActiveMatrixHazard(null);
  };

  const filtered = allTech.filter(tech => {
    const matchesSearch = !searchQuery ||
      tech.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tech.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesHazard = selectedHazards.length === 0 ||
      selectedHazards.some(h => tech.relatedHazards.includes(h));

    const matchesTypology = selectedTypologies.length === 0 ||
      selectedTypologies.some(t => tech.typology.includes(t));

    // Matrix suitability filter — show only recommended or conditional for the active hazard
    const matchesSuitability = !activeMatrixHazard ||
      (tech.hazardSuitability && tech.hazardSuitability[activeMatrixHazard] !== 'not_suitable');

    return matchesSearch && matchesHazard && matchesTypology && matchesSuitability;
  });

  const activeFilterCount = selectedHazards.length + selectedTypologies.length + (searchQuery ? 1 : 0) + (activeMatrixHazard ? 1 : 0);

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
              <div className="mt-3 p-4 bg-card border border-border rounded-lg flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Info className="h-4 w-4 text-[#00AEEF]" />
                    <h3 className="font-semibold text-base">{clickedDistrict.name}</h3>
                    {clickedDistrict.state && (
                      <span className="text-xs text-muted-foreground">{clickedDistrict.state}</span>
                    )}
                    <button onClick={() => setClickedDistrict(null)} className="ml-auto text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {clickedDistrict.hazards.map(h => (
                      <span
                        key={h}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
                        style={{ background: HAZARD_COLORS[h] || '#888' }}
                      >
                        {HAZARD_ICONS[h]} {h}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Vulnerability score: <span className="font-medium text-foreground">{(clickedDistrict.vulnerabilityScore * 100).toFixed(0)}/100</span>
                  </p>
                </div>
                <div className="shrink-0 min-w-0 w-full sm:w-auto">
                  <p className="text-xs text-muted-foreground mb-1.5">Context-matched recommendations:</p>
                  <div className="flex flex-col gap-1.5">
                    {getRecommendedTechnologies({
                      climateRisks: clickedDistrict.hazards,
                      soilType: clickedDistrict.soilType,
                      waterAccessPercent: clickedDistrict.waterAccessPercent,
                      toiletCoveragePercent: clickedDistrict.toiletCoveragePercent,
                      vulnerabilityScore: clickedDistrict.vulnerabilityScore,
                    }).slice(0, 5).map(({ tech, reason, priority }) => {
                      const priColor = priority === 'High' ? '#ef4444' : priority === 'Medium' ? '#f97316' : '#22c55e';
                      return (
                        <Link key={tech.slug} href={`/technology/${tech.slug}`}>
                          <div className="flex items-start gap-2 px-2 py-1.5 rounded-md border border-border hover:bg-accent cursor-pointer transition-colors">
                            <span
                              className="text-[10px] font-bold px-1 py-0.5 rounded shrink-0 mt-0.5 uppercase"
                              style={{ background: priColor + '20', color: priColor }}
                            >
                              {priority[0]}
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-foreground leading-tight">{tech.title}</div>
                              <div className="text-[10px] text-muted-foreground leading-snug line-clamp-1 mt-0.5">{reason}</div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
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
      <Card className={`h-full hover:shadow-lg transition-all cursor-pointer group ${
        suitability === 'recommended' ? 'border-green-400/60 hover:border-green-400' :
        suitability === 'conditional' ? 'border-yellow-400/60 hover:border-yellow-400' :
        suitability === 'not_suitable' ? 'border-red-400/30 opacity-70 hover:border-red-400/50' :
        'hover:border-[#00AEEF]/50'
      }`}>
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
        </CardContent>
      </Card>
    </Link>
  );
}
