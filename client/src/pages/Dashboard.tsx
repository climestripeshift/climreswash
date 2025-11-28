import { useState } from "react";
import { MapComponent } from "@/components/MapComponent";
import { Sidebar } from "@/components/Sidebar";
import { DistrictData, MapViewMode } from "@/lib/types";

export default function Dashboard() {
  const [mode, setMode] = useState<MapViewMode>('vulnerability');
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictData | null>(null);

  return (
    <div className="h-screen w-full bg-background p-4 flex flex-col lg:flex-row gap-4 overflow-hidden">
      <Sidebar 
        mode={mode} 
        setMode={setMode} 
        selectedDistrict={selectedDistrict} 
      />
      <div className="flex-1 h-full min-h-[400px]">
        <MapComponent 
          mode={mode} 
          onDistrictSelect={setSelectedDistrict} 
          selectedDistrictId={selectedDistrict?.id || null}
        />
      </div>
    </div>
  );
}
