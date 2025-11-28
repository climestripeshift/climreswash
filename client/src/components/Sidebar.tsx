import { DistrictData, MapViewMode, Alert, AqiObservation } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, Users, ThermometerSun, Droplets, Zap, Activity, Sprout, Bath, TrendingUp, Calendar, Heart, Baby, HeartPulse, GraduationCap, Hand, Wind, Bell, CheckCircle, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend, AreaChart, Area } from 'recharts';

interface SidebarProps {
  mode: MapViewMode;
  setMode: (mode: MapViewMode) => void;
  selectedDistrict: DistrictData | null;
  districtAlerts?: Alert[];
  districtAqi?: { latest: AqiObservation | null; history: AqiObservation[] } | null;
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

export function Sidebar({ mode, setMode, selectedDistrict, districtAlerts = [], districtAqi }: SidebarProps) {
  const activeAlerts = districtAlerts.filter(a => a.isActive === 1);
  
  return (
    <div className="w-full lg:w-[450px] flex flex-col gap-4 h-full overflow-hidden">
      
      {/* Control Panel */}
      <Card className="shrink-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Climate Watch
          </CardTitle>
          <CardDescription>
            Rajasthan Climate Vulnerability & Adaptation Monitor
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant={mode === 'vulnerability' ? "default" : "outline"}
              onClick={() => setMode('vulnerability')}
              className={mode === 'vulnerability' ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Vulnerability
            </Button>
            <Button 
              variant={mode === 'adaptation' ? "default" : "outline"}
              onClick={() => setMode('adaptation')}
              className={mode === 'adaptation' ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
            >
              <Shield className="mr-2 h-4 w-4" />
              Adaptation
            </Button>
          </div>
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
                    <TabsList className="w-full grid grid-cols-5 mb-4">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="alerts" className="relative">
                        Alerts
                        {activeAlerts.length > 0 && (
                          <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground text-[10px] rounded-full flex items-center justify-center">
                            {activeAlerts.length}
                          </span>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="health">Health</TabsTrigger>
                      <TabsTrigger value="infra">Infra</TabsTrigger>
                      <TabsTrigger value="seasonal">Trends</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-6 animate-in slide-in-from-left-2 duration-300">
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

                    {/* Alerts Tab */}
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
                        <div className="space-y-3">
                          {activeAlerts.map((alert) => (
                            <div 
                              key={alert.id}
                              className={`p-4 rounded-lg ${severityConfig[alert.severity].bg} border ${severityConfig[alert.severity].border}`}
                            >
                              <div className="flex items-start gap-3">
                                <span className="text-2xl">{severityConfig[alert.severity].icon}</span>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline" className={`${severityConfig[alert.severity].color} border-current uppercase text-xs`}>
                                      {alert.severity}
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs">
                                      {alert.type.replace('_', ' ')}
                                    </Badge>
                                  </div>
                                  <h4 className={`font-bold ${severityConfig[alert.severity].color}`}>{alert.title}</h4>
                                  <p className="text-sm text-muted-foreground mt-1">{alert.description}</p>
                                  
                                  <div className="mt-3 p-2 rounded bg-background/50">
                                    <div className="text-xs text-muted-foreground mb-1">Impacted Population</div>
                                    <div className="font-mono font-bold">{alert.impactedPopulation.toLocaleString()}</div>
                                  </div>
                                  
                                  <div className="mt-3">
                                    <div className="text-xs font-medium mb-2">Recommended Actions:</div>
                                    <ul className="text-xs text-muted-foreground space-y-1">
                                      {alert.recommendedActions.slice(0, 3).map((action, i) => (
                                        <li key={i} className="flex items-start gap-2">
                                          <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                                          {action}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Prediction Insight */}
                      <div className="bg-secondary/50 p-4 rounded-lg border border-border">
                        <h4 className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-2">Early Warning System</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Alerts are generated based on seasonal hazard patterns, vulnerability scores, and health indicators. 
                          The system analyzes historical data and current conditions to predict potential impacts.
                        </p>
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
                                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                                  {selectedDistrict.waterSupplyStrategy}
                                </Badge>
                              </div>
                            </div>
                            <div>
                              <span className="block text-xs text-muted-foreground mb-1">Toilet Technology</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                  <Bath className="h-3 w-3 mr-1" />
                                  {selectedDistrict.toiletTechnology}
                                </Badge>
                              </div>
                            </div>
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
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center border-2 border-dashed border-border rounded-lg">
              <Droplets className="h-12 w-12 mb-4 opacity-20" />
              <h3 className="text-lg font-medium mb-2">Select a District</h3>
              <p className="text-sm max-w-[200px]">
                Click on any district in the map to view detailed climate analytics.
              </p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
