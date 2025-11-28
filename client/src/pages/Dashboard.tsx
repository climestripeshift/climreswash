import { useState } from "react";
import { MapComponent } from "@/components/MapComponent";
import { Sidebar } from "@/components/Sidebar";
import { DistrictData, MapViewMode } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { Link } from "wouter";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Dashboard() {
  const [mode, setMode] = useState<MapViewMode>('vulnerability');
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictData | null>(null);

  return (
    <div className="h-screen w-full bg-background p-4 flex flex-col lg:flex-row gap-4 overflow-hidden relative">
      
      {/* Top Right Controls */}
      <div className="absolute top-6 right-6 z-[50] flex items-center gap-2">
        <ThemeToggle />
        <Link href="/admin">
          <Button variant="outline" size="sm" className="gap-2" data-testid="link-admin">
            <Settings className="h-4 w-4" />
            Admin
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
