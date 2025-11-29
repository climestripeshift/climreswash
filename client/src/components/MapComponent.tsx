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

const getColor = (score: number, mode: MapViewMode) => {
  if (mode === 'vulnerability') {
    // Red scale for vulnerability (High score = Bad)
    return score > 80 ? '#ef4444' :
           score > 60 ? '#f97316' :
           score > 40 ? '#eab308' :
                        '#22c55e';
  } else {
    // Blue/Green scale for adaptation (High score = Good)
    return score > 70 ? '#22c55e' :
           score > 50 ? '#3b82f6' :
           score > 30 ? '#eab308' :
                        '#ef4444';
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
    fetch('/data/rajasthan.json')
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
      districts.forEach(d => map.set(d.name.toUpperCase(), d));
      setDistrictDataMap(map);
    }
  }, [districts]);

  // Style function for GeoJSON
  const style = (feature: any) => {
    const districtName = feature.properties.DISTRICT;
    const data = districtDataMap.get(districtName.toUpperCase());
    if (!data) return { fillColor: '#666', weight: 1, opacity: 1, color: '#1e293b', fillOpacity: 0.3 };
    
    const score = mode === 'vulnerability' ? data.vulnerabilityScore : data.adaptationScore;
    
    const isSelected = selectedDistrictId === districtName;

    return {
      fillColor: getColor(score, mode),
      weight: isSelected ? 3 : 1,
      opacity: 1,
      color: isSelected ? 'white' : '#1e293b', // Slate-800 border
      dashArray: '',
      fillOpacity: isSelected ? 0.8 : 0.6
    };
  };

  const onEachFeature = (feature: any, layer: L.Layer) => {
    const districtName = feature.properties.DISTRICT;
    const data = districtDataMap.get(districtName.toUpperCase());
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
        // We rely on the main style function to reset, but simple reset here:
        // Ideally we call a resetStyle method if we had reference to the GeoJSON layer
        layer.setStyle({
          weight: selectedDistrictId === districtName ? 3 : 1,
          color: selectedDistrictId === districtName ? 'white' : '#1e293b',
          fillOpacity: selectedDistrictId === districtName ? 0.8 : 0.6
        });
      },
      click: () => {
        onDistrictSelect(data);
      }
    });
  };

  if (!geoJsonData || districtsLoading) {
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
        center={[26.5, 74.0]} // Approximate center of Rajasthan
        zoom={7} 
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
            key={mode} // Force re-render when mode changes to update colors immediately
          />
        )}
      </MapContainer>
      
      {/* Legend Overlay */}
      <div className="absolute bottom-4 right-4 bg-card/90 backdrop-blur border border-border p-3 rounded-md z-[1000] text-xs">
        <h4 className="font-bold mb-2 text-foreground">
          {mode === 'vulnerability' ? 'Vulnerability Index' : 'Adaptation Readiness'}
        </h4>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: mode === 'vulnerability' ? '#ef4444' : '#22c55e' }}></span>
            <span>{mode === 'vulnerability' ? 'High Risk (>80)' : 'High Readiness (>70)'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: mode === 'vulnerability' ? '#f97316' : '#3b82f6' }}></span>
            <span>{mode === 'vulnerability' ? 'Moderate Risk (60-80)' : 'Moderate (>50)'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: mode === 'vulnerability' ? '#eab308' : '#eab308' }}></span>
            <span>{mode === 'vulnerability' ? 'Low Risk (40-60)' : 'Low (>30)'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: mode === 'vulnerability' ? '#22c55e' : '#ef4444' }}></span>
            <span>{mode === 'vulnerability' ? 'Safe (<40)' : 'Critical Gap (<30)'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
