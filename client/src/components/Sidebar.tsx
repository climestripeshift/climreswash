import { DistrictData, MapViewMode, Alert, AqiObservation, Intervention, CommunityReport, GeographicLevel, BlockData } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, Users, ThermometerSun, Droplets, Zap, Activity, Sprout, Bath, TrendingUp, Calendar, Heart, Baby, HeartPulse, GraduationCap, Hand, Wind, Bell, CheckCircle, ChevronRight, ClipboardList, MessageSquare, Phone, Clock, Target, FileText, Download, Home, Building2, ExternalLink, Trash2, IndianRupee, PieChart } from "lucide-react";
import { estimateDistrictFunding, aggregateFunding, formatIndianCurrency } from "@/lib/fundingEstimates";
import { Link } from "wouter";
import { getTechnologySlugFromName } from "@/lib/technologyContent";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend, AreaChart, Area } from 'recharts';

interface SidebarProps {
  mode: MapViewMode;
  setMode: (mode: MapViewMode) => void;
  selectedDistrict: DistrictData | null;
  selectedBlock?: BlockData | null;
  blocks?: BlockData[];
  onBlockSelect?: (block: BlockData) => void;
  onDistrictSelect?: (district: DistrictData) => void;
  districtAlerts?: Alert[];
  districtAqi?: { latest: AqiObservation | null; history: AqiObservation[] } | null;
  districtInterventions?: Intervention[];
  districtCommunityReports?: CommunityReport[];
  currentLevel?: GeographicLevel;
  countryData?: { name: string; population: number; totalStates: number; totalDistricts: number; avgVulnerabilityScore: number; avgAdaptationScore: number; totalChildrenAtRisk: number; totalElderlyAtRisk: number; activeAlerts: number; criticalDistricts: number; } | null;
  stateData?: { name: string; population: number; totalDistricts: number; totalBlocks: number; avgVulnerabilityScore: number; avgAdaptationScore: number; totalChildrenAtRisk: number; totalElderlyAtRisk: number; activeAlerts: number; criticalDistricts: number; topClimateRisks: string[]; } | null;
  allDistricts?: DistrictData[];
  allAlerts?: Alert[];
}

const severityConfig = {
  advisory: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: '📘' },
  watch: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: '⚠️' },
  warning: { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', icon: '🔶' },
  emergency: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: '🚨' }
};

const aqiColors: Record<string, string> = {
  'Good': '#00e400',
  'Satisfactory': '#92d050',
  'Moderate': '#ffff00',
  'Poor': '#ff7e00',
  'Very Poor': '#ff0000',
  'Severe': '#7e0023'
};

function getAqiColor(category: string): string {
  return aqiColors[category] || '#888';
}

const priorityConfig = {
  critical: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  high: { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  medium: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  low: { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' }
};

const statusConfig = {
  pending: { color: 'text-gray-400', bg: 'bg-gray-500/10', label: 'Pending' },
  in_progress: { color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'In Progress' },
  completed: { color: 'text-green-400', bg: 'bg-green-500/10', label: 'Completed' },
  cancelled: { color: 'text-red-400', bg: 'bg-red-500/10', label: 'Cancelled' }
};

const modeConfig: Record<MapViewMode, { label: string; color: string; bgColor: string; getValue: (d: DistrictData) => number | null }> = {
  hazard: { 
    label: 'Hazard', 
    color: 'text-orange-500', 
    bgColor: 'bg-orange-500',
    getValue: (d) => (d.hazardScore !== undefined && d.hazardScore !== null) ? d.hazardScore : null 
  },
  exposure: { 
    label: 'Exposure', 
    color: 'text-purple-500', 
    bgColor: 'bg-purple-500',
    getValue: (d) => (d.exposureScore !== undefined && d.exposureScore !== null) ? d.exposureScore : null 
  },
  vulnerability: { 
    label: 'Vulnerability', 
    color: 'text-red-500', 
    bgColor: 'bg-red-500',
    getValue: (d) => (d.vulnerabilityScore !== undefined && d.vulnerabilityScore !== null) ? d.vulnerabilityScore : null 
  },
  risk: { 
    label: 'Risk', 
    color: 'text-red-700', 
    bgColor: 'bg-red-700',
    getValue: (d) => (d.riskScore !== undefined && d.riskScore !== null) ? d.riskScore : null 
  },
  adaptation: { 
    label: 'Adaptation', 
    color: 'text-green-500', 
    bgColor: 'bg-green-500',
    getValue: (d) => (d.adaptationScore !== undefined && d.adaptationScore !== null) ? d.adaptationScore : null 
  }
};

export function Sidebar({ mode, setMode, selectedDistrict, selectedBlock, blocks = [], onBlockSelect, onDistrictSelect, districtAlerts = [], districtAqi, districtInterventions = [], districtCommunityReports = [], currentLevel = 'state', countryData, stateData, allDistricts = [], allAlerts = [] }: SidebarProps) {
  const activeAlerts = districtAlerts.filter(a => a.isActive === 1);
  const pendingInterventions = districtInterventions.filter(i => i.status !== 'completed');
  
  const sortedDistricts = [...allDistricts].sort((a, b) => b.vulnerabilityScore - a.vulnerabilityScore);

  const rankedDistricts = [...allDistricts]
    .filter(d => modeConfig[mode].getValue(d) !== null)
    .sort((a, b) => {
      const aVal = modeConfig[mode].getValue(a) ?? 0;
      const bVal = modeConfig[mode].getValue(b) ?? 0;
      return bVal - aVal;
    });
  
  const top5Districts = rankedDistricts.slice(0, 5);
  const bottom5Districts = rankedDistricts.slice(-5).reverse();
  
  const alertsByMonth = activeAlerts.reduce((acc, alert) => {
    const month = alert.forecastMonth || 'Current';
    if (!acc[month]) acc[month] = [];
    acc[month].push(alert);
    return acc;
  }, {} as Record<string, Alert[]>);
  
  return (
    <div className="w-full lg:w-[450px] flex flex-col gap-4 h-full overflow-hidden">
      
      {/* Control Panel */}
      <Card className="shrink-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            ClimateAdapt India
          </CardTitle>
          <CardDescription>
            National Climate Vulnerability & Early Warning System
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-1">
            <Button 
              variant={mode === 'hazard' ? "default" : "outline"}
              onClick={() => setMode('hazard')}
              size="sm"
              className={mode === 'hazard' ? "bg-orange-600 text-white hover:bg-orange-700" : ""}
            >
              Hazard
            </Button>
            <Button 
              variant={mode === 'exposure' ? "default" : "outline"}
              onClick={() => setMode('exposure')}
              size="sm"
              className={mode === 'exposure' ? "bg-purple-600 text-white hover:bg-purple-700" : ""}
            >
              Exposure
            </Button>
            <Button 
              variant={mode === 'vulnerability' ? "default" : "outline"}
              onClick={() => setMode('vulnerability')}
              size="sm"
              className={mode === 'vulnerability' ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              Vuln.
            </Button>
            <Button 
              variant={mode === 'risk' ? "default" : "outline"}
              onClick={() => setMode('risk')}
              size="sm"
              className={mode === 'risk' ? "bg-red-700 text-white hover:bg-red-800" : ""}
            >
              Risk
            </Button>
            <Button 
              variant={mode === 'adaptation' ? "default" : "outline"}
              onClick={() => setMode('adaptation')}
              size="sm"
              className={mode === 'adaptation' ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
            >
              Adapt.
            </Button>
          </div>
          
          {/* District Rankings by Current Filter */}
          {allDistricts.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-medium uppercase text-muted-foreground">
                  Districts by {modeConfig[mode].label}
                </h4>
                <Badge variant="outline" className={`text-xs ${modeConfig[mode].color}`}>
                  {rankedDistricts.length} districts
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Top 5 - Highest */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1 mb-2">
                    <TrendingUp className="h-3 w-3 text-red-500" />
                    <span className="text-xs font-medium text-red-500">Top 5 (Highest)</span>
                  </div>
                  {top5Districts.map((district, index) => {
                    const value = modeConfig[mode].getValue(district);
                    const isSelected = selectedDistrict?.id === district.id;
                    return (
                      <button
                        key={district.id}
                        onClick={() => onDistrictSelect?.(district)}
                        className={`w-full flex items-center justify-between p-1.5 rounded text-xs transition-colors ${
                          isSelected 
                            ? 'bg-primary text-primary-foreground' 
                            : 'hover:bg-accent'
                        }`}
                        data-testid={`rank-top-${index + 1}-${district.id}`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${isSelected ? 'bg-primary-foreground text-primary' : 'bg-red-500/20 text-red-500'}`}>
                            {index + 1}
                          </span>
                          <span className="truncate">{district.name}</span>
                        </span>
                        <span className={`font-mono font-medium ${isSelected ? '' : modeConfig[mode].color}`}>
                          {value !== null ? (mode === 'adaptation' ? value.toFixed(0) : value.toFixed(3)) : 'N/A'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                
                {/* Bottom 5 - Lowest */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1 mb-2">
                    <TrendingUp className="h-3 w-3 text-green-500 rotate-180" />
                    <span className="text-xs font-medium text-green-500">Bottom 5 (Lowest)</span>
                  </div>
                  {bottom5Districts.map((district, index) => {
                    const value = modeConfig[mode].getValue(district);
                    const isSelected = selectedDistrict?.id === district.id;
                    const rank = rankedDistricts.length - (bottom5Districts.length - 1 - index);
                    return (
                      <button
                        key={district.id}
                        onClick={() => onDistrictSelect?.(district)}
                        className={`w-full flex items-center justify-between p-1.5 rounded text-xs transition-colors ${
                          isSelected 
                            ? 'bg-primary text-primary-foreground' 
                            : 'hover:bg-accent'
                        }`}
                        data-testid={`rank-bottom-${index + 1}-${district.id}`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${isSelected ? 'bg-primary-foreground text-primary' : 'bg-green-500/20 text-green-500'}`}>
                            {rank > 0 ? rank : 1}
                          </span>
                          <span className="truncate">{district.name}</span>
                        </span>
                        <span className={`font-mono font-medium ${isSelected ? '' : modeConfig[mode].color}`}>
                          {value !== null ? (mode === 'adaptation' ? value.toFixed(0) : value.toFixed(3)) : 'N/A'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* District Details */}
      <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-secondary">
        <AnimatePresence mode="wait">
          {selectedDistrict ? (
            <motion.div 
              key={selectedDistrict.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-4 pb-10"
            >
              <Card className="border-l-4" style={{ borderLeftColor: mode === 'vulnerability' ? 'hsl(var(--destructive))' : 'hsl(var(--primary))' }}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-2xl">{selectedDistrict.name}</CardTitle>
                      <CardDescription className="mt-1">District ID: {selectedDistrict.id}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {activeAlerts.length > 0 && (
                        <Badge variant="destructive" className="animate-pulse">
                          <Bell className="h-3 w-3 mr-1" />
                          {activeAlerts.length} Alert{activeAlerts.length > 1 ? 's' : ''}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs font-mono">
                        POP: {(selectedDistrict.population / 1000).toFixed(1)}K
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-0">
                  
                  <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="w-full grid grid-cols-4 mb-2">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="alerts" className="relative">
                        Alerts
                        {activeAlerts.length > 0 && (
                          <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground text-[10px] rounded-full flex items-center justify-center">
                            {activeAlerts.length}
                          </span>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="actions" className="relative">
                        Actions
                        {pendingInterventions.length > 0 && (
                          <span className="absolute -top-1 -right-1 h-4 w-4 bg-orange-500 text-white text-[10px] rounded-full flex items-center justify-center">
                            {pendingInterventions.length}
                          </span>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="community">
                        Community
                      </TabsTrigger>
                    </TabsList>
                    <TabsList className="w-full grid grid-cols-3 mb-4">
                      <TabsTrigger value="health">Health</TabsTrigger>
                      <TabsTrigger value="infra">Infra</TabsTrigger>
                      <TabsTrigger value="seasonal">Trends</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-6 animate-in slide-in-from-left-2 duration-300">
                      {/* H/E/V/R Scores from CSV */}
                      <div className="bg-secondary/30 p-3 rounded-lg border border-border">
                        <h4 className="text-xs font-medium uppercase text-muted-foreground mb-3">Climate Risk Metrics (from CSV)</h4>
                        <div className="grid grid-cols-4 gap-2 text-center">
                          <div className="bg-background p-2 rounded">
                            <div className="text-xs text-muted-foreground">Hazard</div>
                            <div className="text-lg font-mono font-bold text-orange-500">{selectedDistrict.hazardScore?.toFixed(3) ?? 'N/A'}</div>
                          </div>
                          <div className="bg-background p-2 rounded">
                            <div className="text-xs text-muted-foreground">Exposure</div>
                            <div className="text-lg font-mono font-bold text-blue-500">{selectedDistrict.exposureScore?.toFixed(3) ?? 'N/A'}</div>
                          </div>
                          <div className="bg-background p-2 rounded">
                            <div className="text-xs text-muted-foreground">Vuln.</div>
                            <div className="text-lg font-mono font-bold text-red-500">{(selectedDistrict.vulnerabilityScore / 100).toFixed(3)}</div>
                          </div>
                          <div className="bg-background p-2 rounded">
                            <div className="text-xs text-muted-foreground">Risk</div>
                            <div className="text-lg font-mono font-bold text-purple-500">{selectedDistrict.riskScore?.toFixed(4) ?? 'N/A'}</div>
                          </div>
                        </div>
                      </div>

                      {/* Scores */}
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-muted-foreground">Vulnerability Index</span>
                            <span className="font-mono font-bold text-destructive">{selectedDistrict.vulnerabilityScore}/100</span>
                          </div>
                          <Progress value={selectedDistrict.vulnerabilityScore} className="h-2 bg-secondary" indicatorClassName="bg-destructive" />
                        </div>
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-muted-foreground">Adaptation Readiness</span>
                            <span className="font-mono font-bold text-primary">{selectedDistrict.adaptationScore}/100</span>
                          </div>
                          <Progress value={selectedDistrict.adaptationScore} className="h-2 bg-secondary" indicatorClassName="bg-primary" />
                        </div>
                      </div>

                      <Separator />

                      {/* Funding Requirements */}
                      {(() => {
                        const funding = estimateDistrictFunding(selectedDistrict);
                        const mitigationPercent = funding.totalFunding > 0 ? Math.round((funding.mitigationFunding / funding.totalFunding) * 100) : 50;
                        const adaptationPercent = 100 - mitigationPercent;
                        return (
                          <div className="bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 p-4 rounded-lg" data-testid="funding-district">
                            <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                              <IndianRupee className="h-4 w-4 text-emerald-500" />
                              Estimated Funding Required
                            </h4>
                            <div className="text-2xl font-mono font-bold text-emerald-500 mb-3" data-testid="funding-total">
                              {formatIndianCurrency(funding.totalFunding)}
                            </div>
                            <div className="space-y-2">
                              <div>
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-muted-foreground flex items-center gap-1">
                                    <Shield className="h-3 w-3" /> Mitigation
                                  </span>
                                  <span className="font-mono font-medium text-blue-400" data-testid="funding-mitigation">{formatIndianCurrency(funding.mitigationFunding)}</span>
                                </div>
                                <Progress value={mitigationPercent} className="h-1.5 bg-secondary" indicatorClassName="bg-blue-500" />
                              </div>
                              <div>
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-muted-foreground flex items-center gap-1">
                                    <Sprout className="h-3 w-3" /> Adaptation
                                  </span>
                                  <span className="font-mono font-medium text-emerald-400" data-testid="funding-adaptation">{formatIndianCurrency(funding.adaptationFunding)}</span>
                                </div>
                                <Progress value={adaptationPercent} className="h-1.5 bg-secondary" indicatorClassName="bg-emerald-500" />
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 mt-3">
                              <PieChart className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">Based on risk, vulnerability, population & WASH gaps</span>
                            </div>
                          </div>
                        );
                      })()}

                      <Separator />

                      {/* Key Metrics */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-secondary/50 p-3 rounded-lg">
                          <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <Users className="h-4 w-4" />
                            <span className="text-xs uppercase">Children at Risk</span>
                          </div>
                          <div className="text-xl font-mono font-bold">
                            {selectedDistrict.vulnerablePopulation.children.toLocaleString()}
                          </div>
                        </div>
                        <div className="bg-secondary/50 p-3 rounded-lg">
                          <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <Users className="h-4 w-4" />
                            <span className="text-xs uppercase">Elderly at Risk</span>
                          </div>
                          <div className="text-xl font-mono font-bold">
                            {selectedDistrict.vulnerablePopulation.elderly.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* Dropout Rate */}
                      <div className="bg-secondary/50 p-3 rounded-lg border border-border">
                        <div className="flex items-center justify-between mb-2">
                           <div className="flex items-center gap-2 text-muted-foreground">
                            <TrendingUp className="h-4 w-4" />
                            <span className="text-xs uppercase">School Dropout Rate</span>
                          </div>
                          <span className="text-lg font-bold font-mono text-orange-500">{selectedDistrict.dropoutRate}%</span>
                        </div>
                         <Progress value={selectedDistrict.dropoutRate * 5} className="h-1.5 bg-background" indicatorClassName="bg-orange-500" />
                      </div>

                      {/* Risks */}
                      <div>
                        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                          <ThermometerSun className="h-4 w-4 text-orange-500" />
                          Projected Risks
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedDistrict.climateRisks.map((risk, i) => (
                            <Badge key={i} variant="secondary" className="bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 border-orange-500/20">
                              {risk}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                       {/* Impact Warning */}
                      <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-lg">
                        <h4 className="text-sm font-bold text-destructive mb-1 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          Impact of Inaction
                        </h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {selectedDistrict.impactIfNoAction}
                        </p>
                      </div>
                    </TabsContent>

                    {/* Alerts Tab with Multi-Month Timeline */}
                    <TabsContent value="alerts" className="space-y-4 animate-in slide-in-from-left-2 duration-300">
                      {activeAlerts.length === 0 ? (
                        <div className="text-center py-8">
                          <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-3" />
                          <h4 className="text-lg font-medium text-green-500">No Active Alerts</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            This district currently has no climate-related warnings.
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Forecast Timeline */}
                          <div className="bg-secondary/30 p-3 rounded-lg border border-border mb-4">
                            <h4 className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-3 flex items-center gap-2">
                              <Calendar className="h-3 w-3" />
                              3-Month Forecast Timeline
                            </h4>
                            <div className="flex gap-2">
                              {Object.entries(alertsByMonth).map(([month, monthAlerts]) => (
                                <div 
                                  key={month} 
                                  className={`flex-1 p-2 rounded text-center border ${
                                    monthAlerts.some(a => a.severity === 'emergency') ? 'bg-red-500/20 border-red-500/40' :
                                    monthAlerts.some(a => a.severity === 'warning') ? 'bg-orange-500/20 border-orange-500/40' :
                                    monthAlerts.some(a => a.severity === 'watch') ? 'bg-yellow-500/20 border-yellow-500/40' :
                                    'bg-blue-500/20 border-blue-500/40'
                                  }`}
                                >
                                  <div className="text-xs font-medium">{month}</div>
                                  <div className="text-lg font-bold">{monthAlerts.length}</div>
                                  <div className="text-[10px] text-muted-foreground">alert{monthAlerts.length !== 1 ? 's' : ''}</div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Risk Score Trend */}
                          {activeAlerts.length > 1 && (
                            <div className="h-[80px] w-full mb-4">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={activeAlerts.map(a => ({ 
                                  month: a.forecastMonth?.split(' ')[0] || 'Current', 
                                  risk: a.riskScore,
                                  type: a.type
                                }))}>
                                  <Bar 
                                    dataKey="risk" 
                                    fill="hsl(var(--destructive))"
                                    radius={[4, 4, 0, 0]}
                                  />
                                  <XAxis 
                                    dataKey="month" 
                                    tick={{fontSize: 10, fill: 'hsl(var(--muted-foreground))'}}
                                    axisLine={false}
                                    tickLine={false}
                                  />
                                  <Tooltip 
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', fontSize: '12px' }}
                                    formatter={(value: any) => [`Risk Score: ${value.toFixed(0)}`, '']}
                                  />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          )}

                          {/* Alerts by Month */}
                          <div className="space-y-4">
                            {Object.entries(alertsByMonth).map(([month, monthAlerts]) => (
                              <div key={month}>
                                <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2 flex items-center gap-2">
                                  <Clock className="h-3 w-3" />
                                  {month}
                                </h4>
                                <div className="space-y-2">
                                  {monthAlerts.map((alert) => (
                                    <div 
                                      key={alert.id}
                                      className={`p-3 rounded-lg ${severityConfig[alert.severity].bg} border ${severityConfig[alert.severity].border}`}
                                    >
                                      <div className="flex items-start gap-2">
                                        <span className="text-lg">{severityConfig[alert.severity].icon}</span>
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <Badge variant="outline" className={`${severityConfig[alert.severity].color} border-current uppercase text-[10px]`}>
                                              {alert.severity}
                                            </Badge>
                                            <Badge variant="secondary" className="text-[10px]">
                                              {alert.type.replace('_', ' ')}
                                            </Badge>
                                            <span className="text-[10px] text-muted-foreground ml-auto">
                                              Risk: {alert.riskScore?.toFixed(0) || 'N/A'}%
                                            </span>
                                          </div>
                                          <h4 className={`text-sm font-bold ${severityConfig[alert.severity].color}`}>{alert.title}</h4>
                                          <p className="text-xs text-muted-foreground mt-1">{alert.description}</p>
                                          
                                          <div className="mt-2 grid grid-cols-2 gap-2">
                                            <div className="p-1.5 rounded bg-background/50 text-center">
                                              <div className="text-[10px] text-muted-foreground">Impacted</div>
                                              <div className="text-xs font-mono font-bold">{alert.impactedPopulation.toLocaleString()}</div>
                                            </div>
                                            <div className="p-1.5 rounded bg-background/50 text-center">
                                              <div className="text-[10px] text-muted-foreground">Valid Until</div>
                                              <div className="text-xs font-mono">{new Date(alert.validUntil).toLocaleDateString()}</div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Prediction Insight */}
                      <div className="bg-secondary/50 p-4 rounded-lg border border-border">
                        <h4 className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-2">Early Warning System</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Alerts are generated based on seasonal hazard patterns, vulnerability scores, and health indicators. 
                          The timeline shows predicted threats for the next 3 months based on historical patterns.
                        </p>
                      </div>
                    </TabsContent>
                    
                    {/* Actions Tab - Intervention Planning */}
                    <TabsContent value="actions" className="space-y-4 animate-in slide-in-from-left-2 duration-300">
                      {districtInterventions.length === 0 ? (
                        <div className="text-center py-8">
                          <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                          <h4 className="text-lg font-medium text-muted-foreground">No Action Plans</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            No interventions have been created for this district yet.
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Action Summary */}
                          <div className="grid grid-cols-3 gap-2 mb-4">
                            <div className="p-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-center">
                              <div className="text-lg font-bold text-gray-400">
                                {districtInterventions.filter(i => i.status === 'pending').length}
                              </div>
                              <div className="text-[10px] text-muted-foreground">Pending</div>
                            </div>
                            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
                              <div className="text-lg font-bold text-blue-400">
                                {districtInterventions.filter(i => i.status === 'in_progress').length}
                              </div>
                              <div className="text-[10px] text-muted-foreground">In Progress</div>
                            </div>
                            <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                              <div className="text-lg font-bold text-green-400">
                                {districtInterventions.filter(i => i.status === 'completed').length}
                              </div>
                              <div className="text-[10px] text-muted-foreground">Completed</div>
                            </div>
                          </div>

                          {/* Intervention List */}
                          <div className="space-y-3">
                            {districtInterventions.map((intervention) => (
                              <div 
                                key={intervention.id}
                                className={`p-3 rounded-lg border ${priorityConfig[intervention.priority].bg} ${priorityConfig[intervention.priority].border}`}
                              >
                                <div className="flex items-start gap-3">
                                  <Target className={`h-5 w-5 mt-0.5 ${priorityConfig[intervention.priority].color}`} />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      <Badge variant="outline" className={`${priorityConfig[intervention.priority].color} border-current uppercase text-[10px]`}>
                                        {intervention.priority}
                                      </Badge>
                                      <Badge variant="secondary" className="text-[10px]">
                                        {intervention.category}
                                      </Badge>
                                      <Badge className={`${statusConfig[intervention.status].bg} ${statusConfig[intervention.status].color} text-[10px] ml-auto`}>
                                        {statusConfig[intervention.status].label}
                                      </Badge>
                                    </div>
                                    <h4 className="font-bold text-sm">{intervention.title}</h4>
                                    <p className="text-xs text-muted-foreground mt-1">{intervention.description}</p>
                                    
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                                      {intervention.assignedDepartment && (
                                        <div className="p-1.5 rounded bg-background/50">
                                          <span className="text-muted-foreground">Dept: </span>
                                          <span className="font-medium">{intervention.assignedDepartment}</span>
                                        </div>
                                      )}
                                      {intervention.dueDate && (
                                        <div className="p-1.5 rounded bg-background/50">
                                          <span className="text-muted-foreground">Due: </span>
                                          <span className="font-medium">{new Date(intervention.dueDate).toLocaleDateString()}</span>
                                        </div>
                                      )}
                                      {intervention.estimatedCost && (
                                        <div className="p-1.5 rounded bg-background/50 col-span-2">
                                          <span className="text-muted-foreground">Est. Cost: </span>
                                          <span className="font-medium font-mono">₹{intervention.estimatedCost.toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          {/* Download Report Button */}
                          <Button variant="outline" className="w-full" size="sm" data-testid="button-download-report">
                            <Download className="h-4 w-4 mr-2" />
                            Download Action Plan Report
                          </Button>
                        </>
                      )}
                    </TabsContent>

                    {/* Community Tab - Engagement & Reports */}
                    <TabsContent value="community" className="space-y-4 animate-in slide-in-from-left-2 duration-300">
                      {/* SMS Alert Panel (Dummy) */}
                      <div className="p-4 rounded-lg bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border border-purple-500/20">
                        <h4 className="text-sm font-medium flex items-center gap-2 text-purple-400 mb-3">
                          <Phone className="h-4 w-4" />
                          SMS/WhatsApp Alerts
                        </h4>
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center justify-between p-2 bg-background/50 rounded">
                            <span className="text-muted-foreground">Registered Numbers</span>
                            <span className="font-mono font-bold">12,450</span>
                          </div>
                          <div className="flex items-center justify-between p-2 bg-background/50 rounded">
                            <span className="text-muted-foreground">Alerts Sent (24h)</span>
                            <span className="font-mono font-bold text-green-400">3,240</span>
                          </div>
                          <div className="flex items-center justify-between p-2 bg-background/50 rounded">
                            <span className="text-muted-foreground">Delivery Rate</span>
                            <span className="font-mono font-bold text-blue-400">94.2%</span>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="w-full mt-3" disabled>
                          <MessageSquare className="h-3 w-3 mr-2" />
                          Send Broadcast (Demo)
                        </Button>
                      </div>

                      {/* Community Reports */}
                      <div>
                        <h4 className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-3 flex items-center gap-2">
                          <FileText className="h-3 w-3" />
                          Community Reports ({districtCommunityReports.length})
                        </h4>
                        
                        {districtCommunityReports.length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground">
                            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No community reports yet</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {districtCommunityReports.slice(0, 5).map((report) => (
                              <div 
                                key={report.id}
                                className="p-3 rounded-lg bg-secondary/30 border border-border"
                              >
                                <div className="flex items-start gap-2">
                                  <div className={`w-2 h-2 rounded-full mt-1.5 ${
                                    report.severity === 'high' ? 'bg-red-500' :
                                    report.severity === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                                  }`} />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <Badge variant="outline" className="text-[10px]">
                                        {report.reportType.replace('_', ' ')}
                                      </Badge>
                                      <Badge className={`text-[10px] ${
                                        report.status === 'addressed' ? 'bg-green-500/20 text-green-400' :
                                        report.status === 'verified' ? 'bg-blue-500/20 text-blue-400' :
                                        'bg-gray-500/20 text-gray-400'
                                      }`}>
                                        {report.status}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-foreground">{report.description}</p>
                                    {report.location && (
                                      <p className="text-[10px] text-muted-foreground mt-1">📍 {report.location}</p>
                                    )}
                                    <p className="text-[10px] text-muted-foreground mt-1">
                                      {new Date(report.createdAt).toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Participation Stats */}
                      <div className="bg-secondary/50 p-3 rounded-lg border border-border">
                        <h4 className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-2">Community Participation</h4>
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="p-2 rounded bg-background/50">
                            <div className="text-lg font-mono font-bold text-primary">847</div>
                            <div className="text-[10px] text-muted-foreground">Active Reporters</div>
                          </div>
                          <div className="p-2 rounded bg-background/50">
                            <div className="text-lg font-mono font-bold text-green-400">92%</div>
                            <div className="text-[10px] text-muted-foreground">Reports Verified</div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="health" className="space-y-4 animate-in slide-in-from-left-2 duration-300">
                      {/* AQI Display */}
                      {districtAqi?.latest && (
                        <div 
                          className="p-4 rounded-lg border-2"
                          style={{ 
                            borderColor: getAqiColor(districtAqi.latest.aqiCategory),
                            backgroundColor: `${getAqiColor(districtAqi.latest.aqiCategory)}15`
                          }}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Wind className="h-5 w-5" style={{ color: getAqiColor(districtAqi.latest.aqiCategory) }} />
                              <span className="font-medium">Air Quality Index (AQI)</span>
                            </div>
                            <Badge 
                              style={{ 
                                backgroundColor: getAqiColor(districtAqi.latest.aqiCategory),
                                color: ['Good', 'Satisfactory', 'Moderate'].includes(districtAqi.latest.aqiCategory) ? '#000' : '#fff'
                              }}
                            >
                              {districtAqi.latest.aqiCategory}
                            </Badge>
                          </div>
                          
                          <div className="flex items-baseline gap-2 mb-3">
                            <span 
                              className="text-4xl font-mono font-bold"
                              style={{ color: getAqiColor(districtAqi.latest.aqiCategory) }}
                            >
                              {districtAqi.latest.aqiValue}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              Dominant: {districtAqi.latest.dominantPollutant || 'PM2.5'}
                            </span>
                          </div>

                          {/* Pollutant breakdown */}
                          <div className="grid grid-cols-3 gap-2 text-center mb-3">
                            <div className="p-2 rounded bg-background/50">
                              <div className="text-xs text-muted-foreground">PM2.5</div>
                              <div className="font-mono font-bold">{districtAqi.latest.pm25}</div>
                            </div>
                            <div className="p-2 rounded bg-background/50">
                              <div className="text-xs text-muted-foreground">PM10</div>
                              <div className="font-mono font-bold">{districtAqi.latest.pm10}</div>
                            </div>
                            <div className="p-2 rounded bg-background/50">
                              <div className="text-xs text-muted-foreground">NO₂</div>
                              <div className="font-mono font-bold">{districtAqi.latest.no2}</div>
                            </div>
                          </div>

                          {/* 7-day trend */}
                          {districtAqi.history.length > 1 && (
                            <div className="h-[80px] w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={[...districtAqi.history].reverse()}>
                                  <defs>
                                    <linearGradient id="aqiGradient" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor={getAqiColor(districtAqi.latest.aqiCategory)} stopOpacity={0.3}/>
                                      <stop offset="95%" stopColor={getAqiColor(districtAqi.latest.aqiCategory)} stopOpacity={0}/>
                                    </linearGradient>
                                  </defs>
                                  <Area 
                                    type="monotone" 
                                    dataKey="aqiValue" 
                                    stroke={getAqiColor(districtAqi.latest.aqiCategory)}
                                    fill="url(#aqiGradient)"
                                    strokeWidth={2}
                                  />
                                  <Tooltip 
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', fontSize: '12px' }}
                                    formatter={(value: any) => [`AQI: ${value}`, '']}
                                    labelFormatter={(label: any) => new Date(label).toLocaleDateString()}
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          )}

                          <p className="text-xs text-muted-foreground mt-2">
                            {districtAqi.latest.healthAdvisory}
                          </p>
                          
                          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                            <span>Source: {districtAqi.latest.source}</span>
                            <span className="mx-1">•</span>
                            <span>Risk Multiplier: {districtAqi.latest.respiratoryRiskMultiplier}x</span>
                          </div>
                        </div>
                      )}

                      {/* WASH Indicators */}
                      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 space-y-3">
                        <h4 className="text-sm font-medium flex items-center gap-2 text-blue-400">
                          <Droplets className="h-4 w-4" />
                          Water, Sanitation & Hygiene (WASH)
                        </h4>
                        <div className="space-y-3">
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-muted-foreground">Piped Water Access</span>
                              <span className="font-mono font-bold text-blue-400">{selectedDistrict.waterAccessPercent}%</span>
                            </div>
                            <Progress value={selectedDistrict.waterAccessPercent} className="h-1.5 bg-background" indicatorClassName="bg-blue-400" />
                          </div>
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-muted-foreground">Toilet Coverage</span>
                              <span className="font-mono font-bold text-emerald-400">{selectedDistrict.toiletCoveragePercent}%</span>
                            </div>
                            <Progress value={selectedDistrict.toiletCoveragePercent} className="h-1.5 bg-background" indicatorClassName="bg-emerald-400" />
                          </div>
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Hand className="h-3 w-3" /> Handwashing Facilities
                              </span>
                              <span className="font-mono font-bold text-cyan-400">{selectedDistrict.handwashingFacilityPercent}%</span>
                            </div>
                            <Progress value={selectedDistrict.handwashingFacilityPercent} className="h-1.5 bg-background" indicatorClassName="bg-cyan-400" />
                          </div>
                        </div>
                      </div>

                      {/* Mortality Indicators */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                          <div className="flex items-center gap-2 text-rose-400 mb-2">
                            <Baby className="h-4 w-4" />
                            <span className="text-xs font-medium">IMR</span>
                          </div>
                          <div className="text-2xl font-mono font-bold text-rose-400">{selectedDistrict.infantMortalityRate}</div>
                          <div className="text-xs text-muted-foreground">per 1000 live births</div>
                        </div>
                        <div className="p-3 rounded-lg bg-pink-500/10 border border-pink-500/20">
                          <div className="flex items-center gap-2 text-pink-400 mb-2">
                            <HeartPulse className="h-4 w-4" />
                            <span className="text-xs font-medium">MMR</span>
                          </div>
                          <div className="text-2xl font-mono font-bold text-pink-400">{selectedDistrict.maternalMortalityRatio}</div>
                          <div className="text-xs text-muted-foreground">per 100k births</div>
                        </div>
                      </div>

                      {/* Malnutrition */}
                      <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-3">
                        <h4 className="text-sm font-medium flex items-center gap-2 text-amber-400">
                          <Heart className="h-4 w-4" />
                          Child Malnutrition (Under 5)
                        </h4>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="p-2 rounded bg-background/50">
                            <div className="text-lg font-mono font-bold text-amber-400">{selectedDistrict.malnutritionStunting}%</div>
                            <div className="text-xs text-muted-foreground">Stunting</div>
                          </div>
                          <div className="p-2 rounded bg-background/50">
                            <div className="text-lg font-mono font-bold text-orange-400">{selectedDistrict.malnutritionWasting}%</div>
                            <div className="text-xs text-muted-foreground">Wasting</div>
                          </div>
                          <div className="p-2 rounded bg-background/50">
                            <div className="text-lg font-mono font-bold text-red-400">{selectedDistrict.malnutritionUnderweight}%</div>
                            <div className="text-xs text-muted-foreground">Underweight</div>
                          </div>
                        </div>
                      </div>

                      {/* Social Indicators */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                          <div className="flex items-center gap-2 text-purple-400 mb-2">
                            <Heart className="h-4 w-4" />
                            <span className="text-xs font-medium">Child Marriage</span>
                          </div>
                          <div className="text-2xl font-mono font-bold text-purple-400">{selectedDistrict.childMarriageRate}%</div>
                          <div className="text-xs text-muted-foreground">girls &lt;18 yrs</div>
                        </div>
                        <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                          <div className="flex items-center gap-2 text-orange-400 mb-2">
                            <GraduationCap className="h-4 w-4" />
                            <span className="text-xs font-medium">School Dropout</span>
                          </div>
                          <div className="text-2xl font-mono font-bold text-orange-400">{selectedDistrict.dropoutRate}%</div>
                          <div className="text-xs text-muted-foreground">primary level</div>
                        </div>
                      </div>

                      {/* Correlation Insight */}
                      <div className="bg-secondary/50 p-3 rounded-lg border border-border">
                        <h4 className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-2">Climate-Health Correlation</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {districtAqi?.latest && districtAqi.latest.aqiValue > 150 
                            ? `Poor air quality (AQI ${districtAqi.latest.aqiValue}) increases respiratory risks by ${districtAqi.latest.respiratoryRiskMultiplier}x, especially impacting children and elderly.`
                            : `Districts with lower water access (${selectedDistrict.waterAccessPercent}%) show higher malnutrition (${selectedDistrict.malnutritionStunting}% stunting) and elevated infant mortality (${selectedDistrict.infantMortalityRate}/1000). Climate stress exacerbates these vulnerabilities.`
                          }
                        </p>
                      </div>
                    </TabsContent>

                    <TabsContent value="infra" className="space-y-4 animate-in slide-in-from-right-2 duration-300">
                      <div className="grid grid-cols-1 gap-4">
                        
                        <div className="p-4 rounded-lg bg-secondary/30 border border-border space-y-3">
                          <h4 className="text-sm font-medium flex items-center gap-2 text-primary">
                            <Sprout className="h-4 w-4" />
                            Soil & Geology
                          </h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="block text-xs text-muted-foreground mb-1">Soil Type</span>
                              <span className="font-medium">{selectedDistrict.soilType}</span>
                            </div>
                            <div>
                              <span className="block text-xs text-muted-foreground mb-1">Rock Type</span>
                              <span className="font-medium">{selectedDistrict.rockType}</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 rounded-lg bg-secondary/30 border border-border space-y-3">
                          <h4 className="text-sm font-medium flex items-center gap-2 text-blue-400">
                            <Droplets className="h-4 w-4" />
                            Water & Sanitation
                          </h4>
                          <div className="space-y-3 text-sm">
                            <div>
                              <span className="block text-xs text-muted-foreground mb-1">Water Supply Strategy</span>
                              <div className="flex items-center gap-2">
                                {getTechnologySlugFromName(selectedDistrict.waterSupplyStrategy) ? (
                                  <Link href={`/technology/${getTechnologySlugFromName(selectedDistrict.waterSupplyStrategy)}`} data-testid="link-water-tech">
                                    <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 cursor-pointer hover:bg-blue-500/20">
                                      {selectedDistrict.waterSupplyStrategy}
                                      <ExternalLink className="h-3 w-3 ml-1" />
                                    </Badge>
                                  </Link>
                                ) : (
                                  <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                                    {selectedDistrict.waterSupplyStrategy}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div>
                              <span className="block text-xs text-muted-foreground mb-1">Toilet Technology</span>
                              <div className="flex items-center gap-2">
                                {getTechnologySlugFromName(selectedDistrict.toiletTechnology) ? (
                                  <Link href={`/technology/${getTechnologySlugFromName(selectedDistrict.toiletTechnology)}`} data-testid="link-toilet-tech">
                                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 cursor-pointer hover:bg-emerald-500/20">
                                      <Bath className="h-3 w-3 mr-1" />
                                      {selectedDistrict.toiletTechnology}
                                      <ExternalLink className="h-3 w-3 ml-1" />
                                    </Badge>
                                  </Link>
                                ) : (
                                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                    <Bath className="h-3 w-3 mr-1" />
                                    {selectedDistrict.toiletTechnology}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 rounded-lg bg-secondary/30 border border-border space-y-3">
                          <h4 className="text-sm font-medium flex items-center gap-2 text-orange-400">
                            <Trash2 className="h-4 w-4" />
                            Waste Management Technologies
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            <Link href="/technology/solid-waste" data-testid="link-solid-waste">
                              <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/20 cursor-pointer hover:bg-orange-500/20">
                                Solid Waste
                                <ExternalLink className="h-3 w-3 ml-1" />
                              </Badge>
                            </Link>
                            <Link href="/technology/dewats" data-testid="link-dewats">
                              <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20 cursor-pointer hover:bg-purple-500/20">
                                DEWATS (Liquid Waste)
                                <ExternalLink className="h-3 w-3 ml-1" />
                              </Badge>
                            </Link>
                          </div>
                        </div>

                        {/* Strategies */}
                        <div>
                          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                            <Zap className="h-4 w-4 text-primary" />
                            Recommended Tech
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedDistrict.adaptationStrategies.map((strategy, i) => (
                              <Badge key={i} variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">
                                {strategy}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <Link href="/technology" className="block" data-testid="link-all-technologies">
                          <Button variant="outline" className="w-full">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View All Technologies
                          </Button>
                        </Link>

                      </div>
                    </TabsContent>

                    <TabsContent value="seasonal" className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                       <div className="p-3 bg-secondary/30 rounded-lg border border-border">
                          <h4 className="text-sm font-medium mb-4 flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-orange-500" />
                            Seasonal Impact: Dropout Rate vs Heat
                          </h4>
                          <div className="h-[200px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={selectedDistrict.seasonalData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                <XAxis 
                                  dataKey="month" 
                                  tick={{fontSize: 10, fill: 'hsl(var(--muted-foreground))'}} 
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <YAxis 
                                  yAxisId="left"
                                  orientation="left" 
                                  stroke="hsl(var(--destructive))"
                                  tick={{fontSize: 10, fill: 'hsl(var(--destructive))'}}
                                  domain={[0, 100]}
                                  label={{ value: 'Heat Intensity', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(var(--destructive))' }}
                                />
                                <YAxis 
                                  yAxisId="right" 
                                  orientation="right" 
                                  stroke="hsl(var(--foreground))"
                                  tick={{fontSize: 10, fill: 'hsl(var(--foreground))'}}
                                  domain={[0, 25]}
                                  label={{ value: 'Dropout %', angle: 90, position: 'insideRight', fontSize: 10, fill: 'hsl(var(--foreground))' }}
                                />
                                <Tooltip 
                                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', fontSize: '12px' }}
                                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '10px' }} />
                                <Line 
                                  yAxisId="left"
                                  type="monotone" 
                                  dataKey="hazardIntensity" 
                                  name="Heat Intensity" 
                                  stroke="hsl(var(--destructive))" 
                                  strokeWidth={2}
                                  dot={false}
                                />
                                <Line 
                                  yAxisId="right"
                                  type="monotone" 
                                  dataKey="impactValue" 
                                  name="Dropout Rate %" 
                                  stroke="hsl(var(--foreground))" 
                                  strokeWidth={2}
                                  dot={{ r: 3 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                       </div>

                       <div className="space-y-3">
                          <h4 className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Hazard Analysis</h4>
                          {selectedDistrict.seasonalData
                            .filter(d => d.hazard !== 'None')
                            .map((d, i) => (
                            <div key={i} className="flex items-start gap-3 text-sm p-2 rounded hover:bg-secondary/50 transition-colors">
                              <Badge variant="outline" className="w-12 shrink-0 justify-center">{d.month}</Badge>
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-bold text-foreground">{d.hazard}</span>
                                  <span className="text-xs text-muted-foreground">Intensity: {d.hazardIntensity}</span>
                                </div>
                                <p className="text-muted-foreground text-xs">{d.description}</p>
                              </div>
                            </div>
                          ))}
                       </div>
                    </TabsContent>
                  </Tabs>

                </CardContent>
              </Card>

              {blocks.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Home className="h-4 w-4 text-primary" />
                      Drill Down to Block Level
                    </CardTitle>
                    <CardDescription>
                      {blocks.length} blocks in {selectedDistrict.name}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {blocks.map((block) => (
                        <button
                          key={block.id}
                          onClick={() => onBlockSelect?.(block)}
                          className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                            selectedBlock?.id === block.id
                              ? "bg-primary/10 border-primary"
                              : "bg-secondary/30 border-border hover:bg-secondary/50"
                          }`}
                          data-testid={`block-select-${block.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">{block.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {block.activeAlerts > 0 && (
                              <Badge variant="destructive" className="text-xs px-1.5 py-0">
                                {block.activeAlerts}
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={`text-xs px-1.5 py-0 ${
                                block.vulnerabilityScore >= 70
                                  ? "text-red-500 border-red-500"
                                  : block.vulnerabilityScore >= 50
                                  ? "text-yellow-500 border-yellow-500"
                                  : "text-green-500 border-green-500"
                              }`}
                            >
                              {block.vulnerabilityScore.toFixed(0)}%
                            </Badge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedBlock && (
                <Card className="border-l-4 border-l-primary">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Home className="h-4 w-4" />
                          {selectedBlock.name}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {selectedBlock.gramPanchayats} Gram Panchayats | {selectedBlock.villages} Villages
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="text-xs font-mono">
                        POP: {(selectedBlock.population / 1000).toFixed(1)}K
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-secondary/50 p-3 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Vulnerability</div>
                        <div className="text-lg font-mono font-bold text-destructive">
                          {selectedBlock.vulnerabilityScore.toFixed(1)}%
                        </div>
                        <Progress value={selectedBlock.vulnerabilityScore} className="h-1.5 mt-1 bg-secondary" indicatorClassName="bg-destructive" />
                      </div>
                      <div className="bg-secondary/50 p-3 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Adaptation</div>
                        <div className="text-lg font-mono font-bold text-primary">
                          {selectedBlock.adaptationScore.toFixed(1)}%
                        </div>
                        <Progress value={selectedBlock.adaptationScore} className="h-1.5 mt-1 bg-secondary" indicatorClassName="bg-primary" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2 p-2 bg-secondary/30 rounded">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-xs text-muted-foreground">Children</div>
                          <div className="font-mono">{selectedBlock.childrenAtRisk.toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-2 bg-secondary/30 rounded">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-xs text-muted-foreground">Elderly</div>
                          <div className="font-mono">{selectedBlock.elderlyAtRisk.toLocaleString()}</div>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <h4 className="text-xs uppercase text-muted-foreground font-bold">WASH Indicators</h4>
                      <div className="space-y-2">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Water Access</span>
                            <span className="font-mono">{selectedBlock.waterAccessPercent.toFixed(0)}%</span>
                          </div>
                          <Progress value={selectedBlock.waterAccessPercent} className="h-1.5 bg-secondary" indicatorClassName="bg-blue-500" />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Toilet Coverage</span>
                            <span className="font-mono">{selectedBlock.toiletCoveragePercent.toFixed(0)}%</span>
                          </div>
                          <Progress value={selectedBlock.toiletCoveragePercent} className="h-1.5 bg-secondary" indicatorClassName="bg-green-500" />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Handwashing</span>
                            <span className="font-mono">{selectedBlock.handwashingFacilityPercent.toFixed(0)}%</span>
                          </div>
                          <Progress value={selectedBlock.handwashingFacilityPercent} className="h-1.5 bg-secondary" indicatorClassName="bg-purple-500" />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {selectedBlock.climateRisks.map((risk, i) => (
                        <Badge key={i} variant="destructive" className="text-xs">
                          {risk}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {(currentLevel === 'state' || currentLevel === 'country') && stateData && (
                <Card className="border-l-4 border-l-primary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      India Overview
                    </CardTitle>
                    <CardDescription>
                      {stateData.totalDistricts} Districts across 28 States & 8 UTs
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">Avg. Vulnerability</span>
                          <span className="font-mono font-bold text-destructive">{stateData.avgVulnerabilityScore.toFixed(1)}/100</span>
                        </div>
                        <Progress value={stateData.avgVulnerabilityScore} className="h-2 bg-secondary" indicatorClassName="bg-destructive" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">Avg. Adaptation</span>
                          <span className="font-mono font-bold text-primary">{stateData.avgAdaptationScore.toFixed(1)}/100</span>
                        </div>
                        <Progress value={stateData.avgAdaptationScore} className="h-2 bg-secondary" indicatorClassName="bg-primary" />
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-secondary/50 p-3 rounded-lg">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Users className="h-4 w-4" />
                          <span className="text-xs uppercase">Population</span>
                        </div>
                        <div className="text-lg font-mono font-bold">
                          {(stateData.population / 1000000).toFixed(1)}M
                        </div>
                      </div>
                      <div className="bg-secondary/50 p-3 rounded-lg">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-xs uppercase">Critical</span>
                        </div>
                        <div className="text-lg font-mono font-bold text-destructive">
                          {stateData.criticalDistricts} Districts
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-secondary/50 p-3 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Children at Risk</div>
                        <div className="text-lg font-mono font-bold">{stateData.totalChildrenAtRisk.toLocaleString()}</div>
                      </div>
                      <div className="bg-secondary/50 p-3 rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">Elderly at Risk</div>
                        <div className="text-lg font-mono font-bold">{stateData.totalElderlyAtRisk.toLocaleString()}</div>
                      </div>
                    </div>

                    {stateData.topClimateRisks && stateData.topClimateRisks.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="text-xs uppercase text-muted-foreground font-bold mb-2">Top Climate Risks</h4>
                          <div className="flex flex-wrap gap-1">
                            {stateData.topClimateRisks.map((risk, i) => (
                              <Badge key={i} variant="destructive" className="text-xs">
                                {risk}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {allDistricts.length > 0 && (() => {
                      const nationalFunding = aggregateFunding(allDistricts);
                      const mitigationPercent = nationalFunding.totalFunding > 0 ? Math.round((nationalFunding.mitigationFunding / nationalFunding.totalFunding) * 100) : 50;
                      const adaptationPercent = 100 - mitigationPercent;
                      return (
                        <>
                          <Separator />
                          <div className="bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 p-4 rounded-lg" data-testid="funding-national">
                            <h4 className="text-xs uppercase text-muted-foreground font-bold mb-2 flex items-center gap-1.5">
                              <IndianRupee className="h-3.5 w-3.5 text-emerald-500" />
                              National Funding Requirements
                            </h4>
                            <div className="text-xl font-mono font-bold text-emerald-500 mb-3" data-testid="funding-national-total">
                              {formatIndianCurrency(nationalFunding.totalFunding)}
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              <div className="bg-background/60 p-2 rounded">
                                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Shield className="h-2.5 w-2.5" /> Mitigation
                                </div>
                                <div className="text-sm font-mono font-bold text-blue-400" data-testid="funding-national-mitigation">
                                  {formatIndianCurrency(nationalFunding.mitigationFunding)}
                                </div>
                              </div>
                              <div className="bg-background/60 p-2 rounded">
                                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Sprout className="h-2.5 w-2.5" /> Adaptation
                                </div>
                                <div className="text-sm font-mono font-bold text-emerald-400" data-testid="funding-national-adaptation">
                                  {formatIndianCurrency(nationalFunding.adaptationFunding)}
                                </div>
                              </div>
                            </div>
                            <div className="flex w-full h-2 rounded-full overflow-hidden bg-secondary">
                              <div className="bg-blue-500 transition-all" style={{ width: `${mitigationPercent}%` }} />
                              <div className="bg-emerald-500 transition-all" style={{ width: `${adaptationPercent}%` }} />
                            </div>
                            <div className="flex justify-between mt-1">
                              <span className="text-[10px] text-blue-400">{mitigationPercent}% Mitigation</span>
                              <span className="text-[10px] text-emerald-400">{adaptationPercent}% Adaptation</span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              {sortedDistricts.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      Districts by Vulnerability
                    </CardTitle>
                    <CardDescription>Click map to view district details</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {sortedDistricts.slice(0, 10).map((district) => (
                        <div
                          key={district.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                        >
                          <span className="font-medium text-sm">{district.name}</span>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                district.vulnerabilityScore >= 70
                                  ? "text-red-500 border-red-500"
                                  : district.vulnerabilityScore >= 50
                                  ? "text-yellow-500 border-yellow-500"
                                  : "text-green-500 border-green-500"
                              }`}
                            >
                              {district.vulnerabilityScore}%
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {allAlerts.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Bell className="h-4 w-4 text-destructive" />
                      Active Alerts ({allAlerts.filter(a => a.isActive).length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {allAlerts.filter(a => a.isActive).slice(0, 5).map((alert) => (
                        <div key={alert.id} className={`p-2 rounded-lg ${severityConfig[alert.severity].bg} border ${severityConfig[alert.severity].border}`}>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`${severityConfig[alert.severity].color} border-current text-xs`}>
                              {alert.severity}
                            </Badge>
                            <span className="text-sm font-medium">{alert.title}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {(!stateData && sortedDistricts.length === 0) && (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center border-2 border-dashed border-border rounded-lg">
                  <Droplets className="h-12 w-12 mb-4 opacity-20" />
                  <h3 className="text-lg font-medium mb-2">Select a District</h3>
                  <p className="text-sm max-w-[200px]">
                    Click on any district in the map to view detailed climate analytics.
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
