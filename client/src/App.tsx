import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/HomePage";
import Dashboard from "@/pages/Dashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminLogin from "@/pages/AdminLogin";
import TechnologyPage from "@/pages/TechnologyPage";
import LiveDataPage from "@/pages/LiveDataPage";
import StressTestPage from "@/pages/StressTestPage";
import AdaptPage from "@/pages/AdaptPage";
import RiskMapPage from "@/pages/RiskMapPage";
import HexMapPage from "@/pages/HexMapPage";
import ForecastPage from "@/pages/ForecastPage";
import ReportPage from "@/pages/ReportPage";
import StateSummaryPage from "@/pages/StateSummaryPage";
import GapAnalysisPage from "@/pages/GapAnalysisPage";
import MethodologyPage from "@/pages/MethodologyPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/live-data" component={LiveDataPage} />
      <Route path="/stress-test" component={StressTestPage} />
      <Route path="/adapt" component={AdaptPage} />
      <Route path="/risk-map" component={RiskMapPage} />
      <Route path="/grid" component={HexMapPage} />
      <Route path="/forecast" component={ForecastPage} />
      <Route path="/report/:district" component={ReportPage} />
      <Route path="/states" component={StateSummaryPage} />
      <Route path="/gap-analysis" component={GapAnalysisPage} />
      <Route path="/methodology" component={MethodologyPage} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/technology" component={TechnologyPage} />
      <Route path="/technology/:slug" component={TechnologyPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
