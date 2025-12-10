import { useState, useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DistrictData, MapViewMode, GeographicLevel } from "@/lib/types";
import { fetchDistricts } from "@/lib/api";
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

interface MapComponentProps {
  mode: MapViewMode;
  onDistrictSelect: (data: DistrictData | null) => void;
  selectedDistrictId: string | null;
  currentLevel?: GeographicLevel;
}

const getCategoryColor = (category: string | null | undefined): string => {
  if (!category) return '#666';
  const cat = category.toLowerCase();
  if (cat.includes('very high')) return '#ef4444';
  if (cat.includes('high')) return '#f97316';
  if (cat.includes('moderate')) return '#eab308';
  if (cat.includes('low')) return '#22c55e';
  if (cat.includes('very low')) return '#16a34a';
  return '#666';
};

const getAdaptationColor = (score: number): string => {
  return score > 70 ? '#22c55e' :
         score > 50 ? '#3b82f6' :
         score > 30 ? '#eab308' :
                      '#ef4444';
};

const getColorForMode = (data: DistrictData, mode: MapViewMode): string => {
  switch (mode) {
    case 'hazard': return getCategoryColor(data.hazardCategory);
    case 'exposure': return getCategoryColor(data.exposureCategory);
    case 'risk': return getCategoryColor(data.riskCategory);
    case 'vulnerability': return getCategoryColor(data.vulnerabilityCategory);
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

export function MapComponent({ mode, onDistrictSelect, selectedDistrictId, currentLevel = 'state' }: MapComponentProps) {
  const [geoJsonData, setGeoJsonData] = useState<any>(null);
  const [districtDataMap, setDistrictDataMap] = useState<Map<string, DistrictData>>(new Map());

  const { data: districts, isLoading: districtsLoading } = useQuery({
    queryKey: ['districts'],
    queryFn: fetchDistricts
  });

  useEffect(() => {
    fetch('/data/india.json')
      .then(res => res.json())
      .then(data => {
        setGeoJsonData(data);
      })
      .catch(err => {
        console.error("Failed to load map data", err);
      });
  }, []);

  useEffect(() => {
    if (districts) {
      const map = new Map<string, DistrictData>();
      districts.forEach(d => {
        map.set(d.id, d);
        map.set(d.name.toUpperCase(), d);
      });
      setDistrictDataMap(map);
    }
  }, [districts]);

  // Style function for GeoJSON
  const style = (feature: any) => {
    const districtId = feature.properties.ID;
    const districtName = feature.properties.DISTRICT;
    const data = districtDataMap.get(districtId) || districtDataMap.get(districtName?.toUpperCase());
    if (!data) {
      return { fillColor: '#666', weight: 1, opacity: 1, color: '#1e293b', fillOpacity: 0.3 };
    }
    
    const isSelected = selectedDistrictId === data.id;

    return {
      fillColor: getColorForMode(data, mode),
      weight: isSelected ? 3 : 1,
      opacity: 1,
      color: isSelected ? 'white' : '#1e293b',
      dashArray: '',
      fillOpacity: isSelected ? 0.8 : 0.6
    };
  };

  const onEachFeature = (feature: any, layer: L.Layer) => {
    const districtId = feature.properties.ID;
    const districtName = feature.properties.DISTRICT;
    const data = districtDataMap.get(districtId) || districtDataMap.get(districtName?.toUpperCase());
    if (!data) return;

    layer.on({
      mouseover: (e) => {
        const layer = e.target;
        layer.setStyle({
          weight: 3,
          color: '#fff',
          fillOpacity: 0.9
        });
        layer.bringToFront();
      },
      mouseout: (e) => {
        const layer = e.target;
        const isSelected = selectedDistrictId === data.id;
        layer.setStyle({
          weight: isSelected ? 3 : 1,
          color: isSelected ? 'white' : '#1e293b',
          fillOpacity: isSelected ? 0.8 : 0.6
        });
      },
      click: () => {
        onDistrictSelect(data);
      }
    });
  };

  if (!geoJsonData || districtsLoading || districtDataMap.size === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin mr-2" />
        <span>Loading Map Data...</span>
      </div>
    );
  }

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border border-border shadow-lg relative z-0">
      <MapContainer 
        center={[22.5, 82.0]} // Center of India
        zoom={5} 
        className="h-full w-full bg-slate-950"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {geoJsonData && (
          <GeoJSON 
            data={geoJsonData} 
            style={style} 
            onEachFeature={onEachFeature}
            key={`${mode}-${selectedDistrictId}-${districtDataMap.size}`}
          />
        )}
      </MapContainer>
      
      {/* Legend Overlay */}
      <div className="absolute bottom-4 right-4 bg-card/90 backdrop-blur border border-border p-3 rounded-md z-[1000] text-xs">
        <h4 className="font-bold mb-2 text-foreground">
          {getModeLabel(mode)}
        </h4>
        <div className="flex flex-col gap-1">
          {mode === 'adaptation' ? (
            <>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }}></span>
                <span>High Readiness</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: '#3b82f6' }}></span>
                <span>Moderate</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: '#eab308' }}></span>
                <span>Low</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }}></span>
                <span>Critical Gap</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }}></span>
                <span>Very High</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: '#f97316' }}></span>
                <span>High</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: '#eab308' }}></span>
                <span>Moderate</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }}></span>
                <span>Low</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: '#16a34a' }}></span>
                <span>Very Low</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
