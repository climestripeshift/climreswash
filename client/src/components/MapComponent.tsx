import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DistrictData, MapViewMode, GeographicLevel } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Auto-fit map to GeoJSON bounds when data changes
function FitBounds({ geoJsonData }: { geoJsonData: any }) {
  const map = useMap();
  useEffect(() => {
    if (!geoJsonData?.features?.length) return;
    try {
      const layer = L.geoJSON(geoJsonData);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 8 });
      }
    } catch (_) {}
  }, [geoJsonData, map]);
  return null;
}

interface MapComponentProps {
  mode: MapViewMode;
  onDistrictSelect: (data: DistrictData | null) => void;
  selectedDistrictId: string | null;
  currentLevel?: GeographicLevel;
  countryId?: string;
}

const getHazardColor = (score: number): string => {
  if (score > 0.30) return '#ef4444';
  if (score > 0.22) return '#f97316';
  if (score > 0.15) return '#eab308';
  if (score > 0.10) return '#22c55e';
  return '#16a34a';
};

const getExposureColor = (score: number): string => {
  if (score > 0.48) return '#ef4444';
  if (score > 0.40) return '#f97316';
  if (score > 0.32) return '#eab308';
  if (score > 0.25) return '#22c55e';
  return '#16a34a';
};

const getVulnerabilityColor = (score: number): string => {
  if (score > 0.8) return '#ef4444';
  if (score > 0.6) return '#f97316';
  if (score > 0.4) return '#eab308';
  if (score > 0.2) return '#22c55e';
  return '#16a34a';
};

const getRiskColor = (score: number): string => {
  if (score > 0.07) return '#ef4444';
  if (score > 0.05) return '#f97316';
  if (score > 0.03) return '#eab308';
  if (score > 0.015) return '#22c55e';
  return '#16a34a';
};

const getAdaptationColor = (score: number): string => {
  if (score >= 80) return '#16a34a';
  if (score >= 60) return '#22c55e';
  if (score >= 40) return '#eab308';
  if (score >= 20) return '#f97316';
  return '#ef4444';
};

const getColorForMode = (data: DistrictData, mode: MapViewMode): string => {
  switch (mode) {
    case 'hazard': return getHazardColor(data.hazardScore ?? 0);
    case 'exposure': return getExposureColor(data.exposureScore ?? 0);
    case 'risk': return getRiskColor(data.riskScore ?? 0);
    case 'vulnerability': return getVulnerabilityColor(data.vulnerabilityScore);
    case 'adaptation': return getAdaptationColor(data.adaptationScore);
    default: return '#666';
  }
};

const getModeLabel = (mode: MapViewMode): string => {
  switch (mode) {
    case 'hazard': return 'Hazard Index';
    case 'exposure': return 'Exposure Index';
    case 'risk': return 'Risk Index';
    case 'adaptation': return 'Adaptation Readiness';
    default: return 'Vulnerability Index';
  }
};

export function MapComponent({
  mode,
  onDistrictSelect,
  selectedDistrictId,
  currentLevel = 'state',
  countryId = 'IND'
}: MapComponentProps) {
  const [geoJsonData, setGeoJsonData] = useState<any>(null);
  const [geoLoading, setGeoLoading] = useState(true);
  const prevCountryRef = useRef<string>('');

  // Fetch districts for the selected country
  const { data: districts, isLoading: districtsLoading } = useQuery({
    queryKey: ['districts', countryId],
    queryFn: async () => {
      const url = countryId === 'ALL'
        ? '/api/districts'
        : `/api/districts?country=${countryId}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch districts');
      return res.json() as Promise<DistrictData[]>;
    }
  });

  // Load GeoJSON: DB endpoint for all cases (now India has geometry too)
  useEffect(() => {
    if (prevCountryRef.current === countryId) return;
    prevCountryRef.current = countryId;
    setGeoJsonData(null);
    setGeoLoading(true);

    const url = countryId === 'ALL'
      ? '/api/districts/geojson'
      : `/api/districts/geojson?country=${countryId}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        setGeoJsonData(data);
        setGeoLoading(false);
      })
      .catch(err => {
        console.error("Failed to load GeoJSON", err);
        setGeoLoading(false);
      });
  }, [countryId]);

  // Build districtDataMap keyed by district ID
  const districtDataMap = useMemo(() => {
    const map = new Map<string, DistrictData>();
    if (districts) {
      districts.forEach(d => map.set(d.id, d));
    }
    return map;
  }, [districts]);

  const [renderKey, setRenderKey] = useState(Date.now());
  useEffect(() => { setRenderKey(Date.now()); }, [mode, countryId]);

  const style = useCallback((feature: any) => {
    const id = feature.properties?.ID || feature.properties?.id;
    const data = districtDataMap.get(id);
    if (!data) {
      return { fillColor: '#444', weight: 1, opacity: 0.7, color: '#1e293b', fillOpacity: 0.25 };
    }
    const isSelected = selectedDistrictId === data.id;
    const color = getColorForMode(data, mode);
    return {
      fillColor: color,
      weight: isSelected ? 3 : 1,
      opacity: 1,
      color: isSelected ? 'white' : '#1e293b',
      dashArray: '',
      fillOpacity: isSelected ? 0.85 : 0.65
    };
  }, [districtDataMap, mode, selectedDistrictId]);

  const onEachFeature = useCallback((feature: any, layer: L.Layer) => {
    const id = feature.properties?.ID || feature.properties?.id;
    const data = districtDataMap.get(id);
    if (!data) return;

    layer.on({
      mouseover: (e) => {
        e.target.setStyle({ weight: 3, color: '#fff', fillOpacity: 0.9 });
        e.target.bringToFront();
      },
      mouseout: (e) => {
        const isSelected = selectedDistrictId === data.id;
        e.target.setStyle({
          weight: isSelected ? 3 : 1,
          color: isSelected ? 'white' : '#1e293b',
          fillOpacity: isSelected ? 0.85 : 0.65
        });
      },
      click: () => { onDistrictSelect(data); }
    });
  }, [districtDataMap, selectedDistrictId, onDistrictSelect]);

  // Show loading overlay while GeoJSON or districts are loading
  // Don't block on districtDataMap.size since 'ALL' loads thousands of records
  const isLoading = geoLoading || districtsLoading;

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border border-border shadow-lg relative z-0">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-[999] text-white">
          <Loader2 className="h-8 w-8 animate-spin mr-2" />
          <span>Loading Map…</span>
        </div>
      )}
      <MapContainer
        center={[22.5, 82.0]}
        zoom={5}
        className="h-full w-full bg-slate-950"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {geoJsonData && (
          <>
            <FitBounds geoJsonData={geoJsonData} />
            <GeoJSON
              data={geoJsonData}
              style={style}
              onEachFeature={onEachFeature}
              key={`${countryId}-${mode}-${selectedDistrictId}-${districtDataMap.size}-${renderKey}`}
            />
          </>
        )}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-card/90 backdrop-blur border border-border p-3 rounded-md z-[1000] text-xs">
        <h4 className="font-bold mb-2 text-foreground">{getModeLabel(mode)}</h4>
        <div className="flex flex-col gap-1">
          {mode === 'adaptation' ? (
            <>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-600"></span><span>High Readiness</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500"></span><span>Moderate</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-500"></span><span>Low</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500"></span><span>Critical Gap</span></div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500"></span><span>Very High</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-orange-500"></span><span>High</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-500"></span><span>Moderate</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500"></span><span>Low</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-700"></span><span>Very Low</span></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
