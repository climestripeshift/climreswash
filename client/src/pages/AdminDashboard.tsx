import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Save, RefreshCw, Database, CloudRain, Droplets, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchDistricts, deleteDistrict, fetchIntegrations, updateIntegration } from "@/lib/api";

export default function AdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: districts = [], isLoading: districtsLoading } = useQuery({
    queryKey: ['districts'],
    queryFn: fetchDistricts
  });

  const { data: integrations = [] } = useQuery({
    queryKey: ['integrations'],
    queryFn: fetchIntegrations
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDistrict,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['districts'] });
      toast({
        title: "District Removed",
        description: "District data has been removed from the registry.",
        variant: "destructive"
      });
    }
  });

  const updateIntegrationMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateIntegration(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    }
  });

  const handleConnect = (integrationId: string, service: string, connected: boolean) => {
    updateIntegrationMutation.mutate({
      id: integrationId,
      data: { 
        isConnected: connected ? 1 : 0,
        lastSync: connected ? new Date() : null
      }
    });
    
    if (connected) {
      toast({
        title: "Service Connected",
        description: `Successfully established connection with ${service} API.`,
      });
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const imdIntegration = integrations.find((i: any) => i.type === 'imd');
  const groundwaterIntegration = integrations.find((i: any) => i.type === 'groundwater');

  return (
    <div className="min-h-screen bg-background p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-3xl font-mono font-bold tracking-tight">Admin Console</h1>
          </div>
          <p className="text-muted-foreground ml-14">Manage data sources, API integrations, and district registries.</p>
        </div>
        <Button>
          <Save className="mr-2 h-4 w-4" />
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="data" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent space-x-6">
          <TabsTrigger value="data" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3">
            Data Management
          </TabsTrigger>
          <TabsTrigger value="integrations" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3">
            API Integrations
          </TabsTrigger>
          <TabsTrigger value="settings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3">
            System Settings
          </TabsTrigger>
        </TabsList>

        {/* Data Management Tab */}
        <TabsContent value="data" className="pt-6 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>District Registry</CardTitle>
                <CardDescription>Manage district-level vulnerability data.</CardDescription>
              </div>
              <Button size="sm" variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Add District
              </Button>
            </CardHeader>
            <CardContent>
              {districtsLoading ? (
                <div className="flex items-center justify-center p-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>District ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Population</TableHead>
                      <TableHead>Risk Profile</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {districts.map((district: any) => {
                      const risk = district.vulnerabilityScore > 80 ? "Critical" :
                                   district.vulnerabilityScore > 60 ? "High" :
                                   district.vulnerabilityScore > 40 ? "Moderate" : "Low";
                      return (
                        <TableRow key={district.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{district.id}</TableCell>
                          <TableCell className="font-medium">{district.name}</TableCell>
                          <TableCell>{(district.population / 1000000).toFixed(1)}M</TableCell>
                          <TableCell>
                            <Badge variant={risk === "Critical" ? "destructive" : "outline"} 
                                   className={risk === "Critical" ? "" : 
                                              risk === "High" ? "border-orange-500 text-orange-500" : 
                                              risk === "Moderate" ? "border-yellow-500 text-yellow-500" : "border-green-500 text-green-500"}>
                              {risk}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(district.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Import Data</CardTitle>
                <CardDescription>Upload GeoJSON or CSV files to update bulk data.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center text-center hover:bg-secondary/50 transition-colors cursor-pointer">
                  <Database className="h-8 w-8 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">Drag & Drop files here</p>
                  <p className="text-xs text-muted-foreground mt-1">Support for .json, .csv, .xlsx</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Manual Entry</CardTitle>
                <CardDescription>Add a new data point manually.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>District Name</Label>
                  <Input placeholder="e.g. Bikaner" />
                </div>
                <div className="space-y-2">
                  <Label>Vulnerability Score (0-100)</Label>
                  <Input type="number" placeholder="85" />
                </div>
                <Button className="w-full" variant="secondary">Add Entry</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* API Integrations Tab */}
        <TabsContent value="integrations" className="pt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* IMD API Card */}
            <Card className={imdIntegration?.isConnected ? "border-primary" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CloudRain className="h-8 w-8 text-blue-400 mb-2" />
                  <Switch 
                    checked={!!imdIntegration?.isConnected} 
                    onCheckedChange={(c) => handleConnect("imd-weather", "IMD Weather", c)} 
                  />
                </div>
                <CardTitle>IMD Weather API</CardTitle>
                <CardDescription>Real-time weather forecast and historical climate data.</CardDescription>
              </CardHeader>
              <CardContent>
                {imdIntegration?.isConnected ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge className="bg-emerald-500 hover:bg-emerald-600">Connected</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Last Sync</span>
                      <span className="font-mono">Just now</span>
                    </div>
                    <div className="bg-secondary/50 p-2 rounded text-xs font-mono mt-2">
                      GET /api/v1/forecast/raj
                      <span className="text-emerald-500 float-right">200 OK</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-secondary/30 p-3 rounded text-sm text-muted-foreground">
                    Connect to fetch live rainfall, temperature, and humidity data from Indian Meteorological Department.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Groundwater API Card */}
            <Card className={groundwaterIntegration?.isConnected ? "border-primary" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <Droplets className="h-8 w-8 text-cyan-400 mb-2" />
                  <Switch 
                    checked={!!groundwaterIntegration?.isConnected} 
                    onCheckedChange={(c) => handleConnect("cgwb-groundwater", "CGWB Groundwater", c)} 
                  />
                </div>
                <CardTitle>CGWB Groundwater</CardTitle>
                <CardDescription>Central Ground Water Board aquifer monitoring data.</CardDescription>
              </CardHeader>
              <CardContent>
                {groundwaterIntegration?.isConnected ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge className="bg-emerald-500 hover:bg-emerald-600">Connected</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Last Sync</span>
                      <span className="font-mono">2 hours ago</span>
                    </div>
                    <div className="bg-secondary/50 p-2 rounded text-xs font-mono mt-2">
                      GET /api/aquifer/levels
                      <span className="text-emerald-500 float-right">200 OK</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-secondary/30 p-3 rounded text-sm text-muted-foreground">
                    Access piezometer readings and water quality reports from CGWB network.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Custom API Card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <Database className="h-8 w-8 text-purple-400 mb-2" />
                  <Button variant="outline" size="sm">Configure</Button>
                </div>
                <CardTitle>Custom Endpoint</CardTitle>
                <CardDescription>Connect your own REST or GraphQL endpoint.</CardDescription>
              </CardHeader>
              <CardContent>
                 <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant="outline">Not Configured</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Add a custom data source for localized sensor networks or NGO surveys.
                    </p>
                 </div>
              </CardContent>
            </Card>

          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="pt-6">
           <Card>
             <CardHeader>
               <CardTitle>System Configuration</CardTitle>
               <CardDescription>Global settings for the dashboard.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-4">
               <div className="flex items-center justify-between">
                 <div className="space-y-0.5">
                   <Label>Auto-refresh Data</Label>
                   <p className="text-sm text-muted-foreground">Automatically fetch new data every 15 minutes</p>
                 </div>
                 <Switch />
               </div>
               <Separator />
               <div className="flex items-center justify-between">
                 <div className="space-y-0.5">
                   <Label>Public Access</Label>
                   <p className="text-sm text-muted-foreground">Allow public viewing of the dashboard without login</p>
                 </div>
                 <Switch defaultChecked />
               </div>
               <Separator />
               <div className="flex items-center justify-between">
                 <div className="space-y-0.5">
                   <Label>Maintenance Mode</Label>
                   <p className="text-sm text-muted-foreground">Show maintenance page to visitors</p>
                 </div>
                 <Switch />
               </div>
             </CardContent>
           </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
