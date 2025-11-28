import { DistrictData, MapViewMode } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, Users, ThermometerSun, Droplets, Zap, Activity, Mountain, Sprout, Bath, TrendingUp, Calendar } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';

interface SidebarProps {
  mode: MapViewMode;
  setMode: (mode: MapViewMode) => void;
  selectedDistrict: DistrictData | null;
}

export function Sidebar({ mode, setMode, selectedDistrict }: SidebarProps) {
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
                    <Badge variant="outline" className="text-xs font-mono">
                      POP: {(selectedDistrict.population / 1000).toFixed(1)}K
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-0">
                  
                  <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="w-full grid grid-cols-3 mb-4">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="infra">Infra & Geo</TabsTrigger>
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
