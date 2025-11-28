import { useState } from "react";
import { MapComponent } from "@/components/MapComponent";
import { Sidebar } from "@/components/Sidebar";
import { DistrictData, MapViewMode } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const [mode, setMode] = useState<MapViewMode>('vulnerability');
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictData | null>(null);

  return (
    <div className="h-screen w-full bg-background p-4 flex flex-col lg:flex-row gap-4 overflow-hidden relative">
      
      {/* Admin Link Overlay */}
      <div className="absolute top-6 right-6 z-[50]">
        <Link href="/admin">
          <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full shadow-md opacity-50 hover:opacity-100 transition-opacity">
            <Settings className="h-4 w-4" />
          </Button>
        </Link>
      </div>

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
