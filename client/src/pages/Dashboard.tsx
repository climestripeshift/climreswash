import { useState, useEffect, useMemo, useCallback } from "react";
import { MapComponent } from "@/components/MapComponent";
import { Sidebar } from "@/components/Sidebar";
import { GeographicNavigation } from "@/components/GeographicNavigation";
import { DistrictData, MapViewMode, Alert, AqiObservation, Intervention, CommunityReport, GeographicLevel, CountryData, StateData, BlockData } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, AlertTriangle, Bell, X, Wind, ChevronRight, Menu, MapPin, Globe } from "lucide-react";
import { Link } from "wouter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const severityColors = {
  advisory: { bg: 'bg-blue-500/20', border: 'border-blue-500', text: 'text-blue-400', badge: 'bg-blue-500' },
  watch: { bg: 'bg-yellow-500/20', border: 'border-yellow-500', text: 'text-yellow-400', badge: 'bg-yellow-500' },
  warning: { bg: 'bg-orange-500/20', border: 'border-orange-500', text: 'text-orange-400', badge: 'bg-orange-500' },
  emergency: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-400', badge: 'bg-red-500' }
};

interface GeographicBreadcrumb {
  level: GeographicLevel;
  id: string;
  name: string;
}

export default function Dashboard() {
  const [mode, setMode] = useState<MapViewMode>('vulnerability');
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictData | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<BlockData | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [aqiData, setAqiData] = useState<Record<string, { latest: AqiObservation | null; history: AqiObservation[] }>>({});
  const [interventions, setInterventions] = useState<Record<string, Intervention[]>>({});
  const [communityReports, setCommunityReports] = useState<Record<string, CommunityReport[]>>({});
  const [showAlertBanner, setShowAlertBanner] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const [currentLevel, setCurrentLevel] = useState<GeographicLevel>('state');
  const [countryData, setCountryData] = useState<CountryData | null>(null);
  const [stateData, setStateData] = useState<StateData | null>(null);
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const [allDistricts, setAllDistricts] = useState<DistrictData[]>([]);
  const [selectedCountryId, setSelectedCountryId] = useState<string>('ALL');
  const [allCountries, setAllCountries] = useState<CountryData[]>([]);

  useEffect(() => {
    fetch('/api/countries')
      .then(res => res.json())
      .then((data: CountryData[]) => {
        setAllCountries(data);
        if (data.length > 0) setCountryData(data[0]);
      })
      .catch(err => console.error('Failed to fetch countries:', err));

    fetch('/api/states')
      .then(res => res.json())
      .then(data => {
        if (data.length > 0) setStateData(data[0]);
      })
      .catch(err => console.error('Failed to fetch states:', err));
  }, []);

  // Reload districts when country changes
  useEffect(() => {
    const url = selectedCountryId === 'ALL'
      ? '/api/districts'
      : `/api/districts?country=${selectedCountryId}`;
    fetch(url)
      .then(res => res.json())
      .then(data => setAllDistricts(data))
      .catch(err => console.error('Failed to fetch districts:', err));

    // Update countryData for the selected country
    if (selectedCountryId !== 'ALL') {
      const found = allCountries.find(c => c.id === selectedCountryId);
      if (found) setCountryData(found);
    } else {
      setCountryData(null);
    }
  }, [selectedCountryId, allCountries]);

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
      
      fetch(`/api/districts/${selectedDistrict.id}/blocks`)
        .then(res => res.json())
        .then(data => setBlocks(data))
        .catch(err => console.error('Failed to fetch blocks:', err));
    }
  }, [selectedDistrict?.id]);

  const breadcrumbs = useMemo<GeographicBreadcrumb[]>(() => {
    const crumbs: GeographicBreadcrumb[] = [];
    
    if (countryData) {
      crumbs.push({ level: 'country', id: countryData.id, name: countryData.name });
    }
    
    if (stateData && currentLevel !== 'country') {
      crumbs.push({ level: 'state', id: stateData.id, name: stateData.name });
    }
    
    if (selectedDistrict && (currentLevel === 'district' || currentLevel === 'block')) {
      crumbs.push({ level: 'district', id: selectedDistrict.id, name: selectedDistrict.name });
    }
    
    if (selectedBlock && currentLevel === 'block') {
      crumbs.push({ level: 'block', id: selectedBlock.id, name: selectedBlock.name });
    }
    
    return crumbs;
  }, [countryData, stateData, selectedDistrict, selectedBlock, currentLevel]);

  const handleNavigate = useCallback((level: GeographicLevel, id?: string) => {
    setCurrentLevel(level);
    
    if (level === 'country') {
      setSelectedDistrict(null);
      setSelectedBlock(null);
      setBlocks([]);
    } else if (level === 'state') {
      setSelectedDistrict(null);
      setSelectedBlock(null);
      setBlocks([]);
    } else if (level === 'district') {
      setSelectedBlock(null);
      if (id && allDistricts.length > 0) {
        const district = allDistricts.find(d => d.id === id);
        if (district) {
          setSelectedDistrict(district);
        }
      }
    } else if (level === 'block' && id) {
      const block = blocks.find(b => b.id === id);
      if (block) {
        setSelectedBlock(block);
      }
    }
  }, [allDistricts, blocks]);

  const handleDistrictSelect = (district: DistrictData | null) => {
    setSelectedDistrict(district);
    if (district) {
      setCurrentLevel('district');
    }
  };

  const handleBlockSelect = (block: BlockData) => {
    setSelectedBlock(block);
    setCurrentLevel('block');
  };

  const highPriorityAlerts = alerts.filter(a => a.severity === 'emergency' || a.severity === 'warning');
  const districtAlerts = selectedDistrict 
    ? alerts.filter(a => a.districtId === selectedDistrict.id)
    : [];
  const currentAqi = selectedDistrict ? aqiData[selectedDistrict.id] : null;
  const districtInterventions = selectedDistrict ? interventions[selectedDistrict.id] || [] : [];
  const districtCommunityReports = selectedDistrict ? communityReports[selectedDistrict.id] || [] : [];

  const navStats = useMemo(() => {
    if (currentLevel === 'country' && countryData) {
      return {
        activeAlerts: countryData.activeAlerts,
        criticalAreas: countryData.criticalDistricts,
        totalPopulation: countryData.population
      };
    } else if (currentLevel === 'state' && stateData) {
      return {
        activeAlerts: stateData.activeAlerts,
        criticalAreas: stateData.criticalDistricts,
        totalPopulation: stateData.population
      };
    } else if (currentLevel === 'district' && selectedDistrict) {
      return {
        activeAlerts: districtAlerts.length,
        criticalAreas: selectedDistrict.vulnerabilityScore >= 70 ? 1 : 0,
        totalPopulation: selectedDistrict.population
      };
    } else if (currentLevel === 'block' && selectedBlock) {
      return {
        activeAlerts: selectedBlock.activeAlerts,
        criticalAreas: selectedBlock.vulnerabilityScore >= 70 ? 1 : 0,
        totalPopulation: selectedBlock.population
      };
    }
    return {};
  }, [currentLevel, countryData, stateData, selectedDistrict, selectedBlock, districtAlerts]);

  return (
    <div className="h-screen w-full bg-background flex flex-col overflow-hidden relative">
      
      <GeographicNavigation
        currentLevel={currentLevel}
        breadcrumbs={breadcrumbs}
        onNavigate={handleNavigate}
        stats={navStats}
      />
      
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

      <div className="flex-1 p-2 sm:p-4 flex flex-col lg:flex-row gap-2 sm:gap-4 overflow-hidden relative">
        <div className="absolute top-2 right-2 z-[50] flex items-center gap-1 sm:gap-2">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="lg:hidden gap-2"
                data-testid="button-mobile-menu"
              >
                <Menu className="h-4 w-4" />
                <span className="hidden sm:inline">Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-full sm:w-[400px] p-0 overflow-y-auto">
              <div className="p-4">
                <Sidebar 
                  mode={mode} 
                  setMode={setMode} 
                  selectedDistrict={selectedDistrict}
                  selectedBlock={selectedBlock}
                  blocks={blocks}
                  onBlockSelect={handleBlockSelect}
                  onDistrictSelect={(d) => { handleDistrictSelect(d); setMobileMenuOpen(false); }}
                  districtAlerts={districtAlerts}
                  districtAqi={currentAqi}
                  districtInterventions={districtInterventions}
                  districtCommunityReports={districtCommunityReports}
                  currentLevel={currentLevel}
                  countryData={countryData}
                  stateData={stateData}
                  allDistricts={allDistricts}
                  allAlerts={alerts}
                />
              </div>
            </SheetContent>
          </Sheet>
          {alerts.length > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-1 sm:gap-2 relative px-2 sm:px-3"
              data-testid="button-alerts-indicator"
            >
              <Bell className="h-4 w-4" />
              <span className="sr-only">Alerts</span>
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                {alerts.length}
              </span>
            </Button>
          )}
          {/* Country Selector */}
          <div className="flex items-center gap-1">
            <Globe className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <Select value={selectedCountryId} onValueChange={setSelectedCountryId}>
              <SelectTrigger
                className="h-8 w-[130px] sm:w-[160px] text-xs border-border"
                data-testid="select-country"
              >
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" data-testid="option-country-ALL">
                  🌍 All Countries
                </SelectItem>
                {allCountries.map(c => (
                  <SelectItem key={c.id} value={c.id} data-testid={`option-country-${c.id}`}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ThemeToggle />
          <Link href="/admin">
            <Button variant="outline" size="sm" className="gap-1 sm:gap-2 px-2 sm:px-3" data-testid="link-admin">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Admin</span>
            </Button>
          </Link>
        </div>

        {selectedDistrict && (
          <div className="lg:hidden absolute bottom-4 left-2 right-2 z-[40] bg-background/95 backdrop-blur border rounded-lg p-3 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">{selectedDistrict.name}</span>
                <Badge variant="secondary" className="text-xs">
                  Risk: {(selectedDistrict.riskScore ?? 0).toFixed(3)}
                </Badge>
              </div>
              <Button 
                size="sm" 
                onClick={() => setMobileMenuOpen(true)}
                data-testid="button-view-details"
              >
                Details
              </Button>
            </div>
          </div>
        )}

        <div className="hidden lg:block">
          <Sidebar 
            mode={mode} 
            setMode={setMode} 
            selectedDistrict={selectedDistrict}
            selectedBlock={selectedBlock}
            blocks={blocks}
            onBlockSelect={handleBlockSelect}
            onDistrictSelect={handleDistrictSelect}
            districtAlerts={districtAlerts}
            districtAqi={currentAqi}
            districtInterventions={districtInterventions}
            districtCommunityReports={districtCommunityReports}
            currentLevel={currentLevel}
            countryData={countryData}
            stateData={stateData}
            allDistricts={allDistricts}
            allAlerts={alerts}
          />
        </div>
        <div className="flex-1 h-full min-h-[300px] sm:min-h-[400px]">
          <MapComponent 
            mode={mode} 
            onDistrictSelect={handleDistrictSelect} 
            selectedDistrictId={selectedDistrict?.id || null}
            currentLevel={currentLevel}
            countryId={selectedCountryId}
          />
        </div>
      </div>
    </div>
  );
}
