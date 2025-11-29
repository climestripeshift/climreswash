import { useState, useEffect } from "react";
import { MapComponent } from "@/components/MapComponent";
import { Sidebar } from "@/components/Sidebar";
import { DistrictData, MapViewMode, Alert, AqiObservation, Intervention, CommunityReport } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Settings, AlertTriangle, Bell, X, Wind, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

const severityColors = {
  advisory: { bg: 'bg-blue-500/20', border: 'border-blue-500', text: 'text-blue-400', badge: 'bg-blue-500' },
  watch: { bg: 'bg-yellow-500/20', border: 'border-yellow-500', text: 'text-yellow-400', badge: 'bg-yellow-500' },
  warning: { bg: 'bg-orange-500/20', border: 'border-orange-500', text: 'text-orange-400', badge: 'bg-orange-500' },
  emergency: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-400', badge: 'bg-red-500' }
};

export default function Dashboard() {
  const [mode, setMode] = useState<MapViewMode>('vulnerability');
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictData | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [aqiData, setAqiData] = useState<Record<string, { latest: AqiObservation | null; history: AqiObservation[] }>>({});
  const [interventions, setInterventions] = useState<Record<string, Intervention[]>>({});
  const [communityReports, setCommunityReports] = useState<Record<string, CommunityReport[]>>({});
  const [showAlertBanner, setShowAlertBanner] = useState(true);

  useEffect(() => {
    fetch('/api/alerts')
      .then(res => res.json())
      .then(data => setAlerts(data))
      .catch(err => console.error('Failed to fetch alerts:', err));
  }, []);

  useEffect(() => {
    if (selectedDistrict) {
      fetch(`/api/districts/${selectedDistrict.id}/aqi?days=7`)
        .then(res => res.json())
        .then(data => {
          setAqiData(prev => ({
            ...prev,
            [selectedDistrict.id]: data
          }));
        })
        .catch(err => console.error('Failed to fetch AQI:', err));
      
      fetch(`/api/districts/${selectedDistrict.id}/interventions`)
        .then(res => res.json())
        .then(data => {
          setInterventions(prev => ({
            ...prev,
            [selectedDistrict.id]: data
          }));
        })
        .catch(err => console.error('Failed to fetch interventions:', err));
      
      fetch(`/api/districts/${selectedDistrict.id}/community-reports`)
        .then(res => res.json())
        .then(data => {
          setCommunityReports(prev => ({
            ...prev,
            [selectedDistrict.id]: data
          }));
        })
        .catch(err => console.error('Failed to fetch community reports:', err));
    }
  }, [selectedDistrict?.id]);

  const highPriorityAlerts = alerts.filter(a => a.severity === 'emergency' || a.severity === 'warning');
  const districtAlerts = selectedDistrict 
    ? alerts.filter(a => a.districtId === selectedDistrict.id)
    : [];
  const currentAqi = selectedDistrict ? aqiData[selectedDistrict.id] : null;
  const districtInterventions = selectedDistrict ? interventions[selectedDistrict.id] || [] : [];
  const districtCommunityReports = selectedDistrict ? communityReports[selectedDistrict.id] || [] : [];

  return (
    <div className="h-screen w-full bg-background flex flex-col overflow-hidden relative">
      
      {/* Alert Banner */}
      <AnimatePresence>
        {showAlertBanner && highPriorityAlerts.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`w-full ${severityColors[highPriorityAlerts[0].severity].bg} border-b ${severityColors[highPriorityAlerts[0].severity].border} relative overflow-hidden`}
          >
            <div className="container mx-auto px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-full ${severityColors[highPriorityAlerts[0].severity].badge} animate-pulse`}>
                  <AlertTriangle className="h-4 w-4 text-white" />
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`${severityColors[highPriorityAlerts[0].severity].text} border-current uppercase text-xs font-bold`}>
                    {highPriorityAlerts[0].severity}
                  </Badge>
                  <span className={`font-medium ${severityColors[highPriorityAlerts[0].severity].text}`}>
                    {highPriorityAlerts[0].title}
                  </span>
                  {highPriorityAlerts.length > 1 && (
                    <Badge variant="secondary" className="ml-2">
                      +{highPriorityAlerts.length - 1} more
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`${severityColors[highPriorityAlerts[0].severity].text} hover:bg-white/10`}
                  data-testid="button-view-alerts"
                >
                  View All <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={() => setShowAlertBanner(false)}
                  data-testid="button-dismiss-alert"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 p-4 flex flex-col lg:flex-row gap-4 overflow-hidden relative">
        {/* Top Right Controls */}
        <div className="absolute top-2 right-2 z-[50] flex items-center gap-2">
          {alerts.length > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 relative"
              data-testid="button-alerts-indicator"
            >
              <Bell className="h-4 w-4" />
              <span className="sr-only">Alerts</span>
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                {alerts.length}
              </span>
            </Button>
          )}
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
          districtAlerts={districtAlerts}
          districtAqi={currentAqi}
          districtInterventions={districtInterventions}
          districtCommunityReports={districtCommunityReports}
        />
        <div className="flex-1 h-full min-h-[400px]">
          <MapComponent 
            mode={mode} 
            onDistrictSelect={setSelectedDistrict} 
            selectedDistrictId={selectedDistrict?.id || null}
          />
        </div>
      </div>
    </div>
  );
}
