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
import HexMapPage from "@/pages/HexMapPage";
import ForecastPage from "@/pages/ForecastPage";
import ReportPage from "@/pages/ReportPage";
import StateSummaryPage from "@/pages/StateSummaryPage";
import GapAnalysisPage from "@/pages/GapAnalysisPage";
import MethodologyPage from "@/pages/MethodologyPage";
import ActionPlanPage from "@/pages/ActionPlanPage";
import SimulatorPage from "@/pages/SimulatorPage";
import WashAssessPage from "@/pages/WashAssessPage";
import ScreenerPage from "@/pages/ScreenerPage";
import InsightsPage from "@/pages/InsightsPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/simulator" component={SimulatorPage} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/live-data" component={LiveDataPage} />
      <Route path="/grid" component={HexMapPage} />
      <Route path="/forecast" component={ForecastPage} />
      <Route path="/report/:district" component={ReportPage} />
      <Route path="/states" component={StateSummaryPage} />
      <Route path="/gap-analysis" component={GapAnalysisPage} />
      <Route path="/methodology" component={MethodologyPage} />
      <Route path="/action-plan" component={ActionPlanPage} />
      <Route path="/screener" component={ScreenerPage} />
      <Route path="/insights" component={InsightsPage} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/technology" component={TechnologyPage} />
      <Route path="/technology/:slug" component={TechnologyPage} />
      <Route path="/wash-assess" component={WashAssessPage} />
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
