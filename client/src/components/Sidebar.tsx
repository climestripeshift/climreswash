import { DistrictData, MapViewMode } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, Users, ThermometerSun, Droplets, Zap, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";

interface SidebarProps {
  mode: MapViewMode;
  setMode: (mode: MapViewMode) => void;
  selectedDistrict: DistrictData | null;
}

export function Sidebar({ mode, setMode, selectedDistrict }: SidebarProps) {
  return (
    <div className="w-full lg:w-[400px] flex flex-col gap-4 h-full overflow-hidden">
      
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
      <div className="flex-1 overflow-y-auto pr-1">
        <AnimatePresence mode="wait">
          {selectedDistrict ? (
            <motion.div 
              key={selectedDistrict.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Card className="border-l-4" style={{ borderLeftColor: mode === 'vulnerability' ? 'hsl(var(--destructive))' : 'hsl(var(--primary))' }}>
                <CardHeader>
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
                <CardContent className="space-y-6">
                  
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
