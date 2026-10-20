import { lazy, Suspense } from "react";
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
import HexMapV2Page from "@/pages/HexMapV2Page";
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
import ElNinoPage from "@/pages/ElNinoPage";
import SHVRRajasthanPage from "@/pages/SHVRRajasthanPage";
import JJMRajasthanPage from "@/pages/JJMRajasthanPage";
import CSRRajasthanPage from "@/pages/CSRRajasthanPage";
import CSRCostAssumptionsPage from "@/pages/CSRCostAssumptionsPage";

const BhoomiBetaPage = lazy(() => import("@/pages/BhoomiBetaPage"));
const BhoomiBetaAdminPage = lazy(() => import("@/pages/BhoomiBetaAdminPage"));
const Heat4DPage = lazy(() => import("@/pages/Heat4DPage"));
const Flood4DPage = lazy(() => import("@/pages/Flood4DPage"));
const Drought4DPage = lazy(() => import("@/pages/Drought4DPage"));
const Wetbulb4DPage = lazy(() => import("@/pages/Wetbulb4DPage"));
const Landslide4DPage = lazy(() => import("@/pages/Landslide4DPage"));
const Coldwave4DPage = lazy(() => import("@/pages/Coldwave4DPage"));
const Flashflood4DPage = lazy(() => import("@/pages/Flashflood4DPage"));
const Hazard4DRoute = lazy(() => import("@/pages/Hazard4DRoute"));

function Router() {
  return (
    <Switch>
      <Route path="/bhoomiai/admin">{() => <Suspense fallback={null}><BhoomiBetaAdminPage /></Suspense>}</Route>
      <Route path="/bhoomiai">{() => <Suspense fallback={null}><BhoomiBetaPage /></Suspense>}</Route>
      <Route path="/" component={HomePage} />
      <Route path="/simulator" component={SimulatorPage} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/live-data" component={LiveDataPage} />
      <Route path="/grid" component={HexMapPage} />
      <Route path="/4d">{() => <Suspense fallback={null}><Hazard4DRoute /></Suspense>}</Route>
      <Route path="/heat-4d">{() => <Suspense fallback={null}><Heat4DPage /></Suspense>}</Route>
      <Route path="/flood-4d">{() => <Suspense fallback={null}><Flood4DPage /></Suspense>}</Route>
      <Route path="/drought-4d">{() => <Suspense fallback={null}><Drought4DPage /></Suspense>}</Route>
      <Route path="/wetbulb-4d">{() => <Suspense fallback={null}><Wetbulb4DPage /></Suspense>}</Route>
      <Route path="/landslide-4d">{() => <Suspense fallback={null}><Landslide4DPage /></Suspense>}</Route>
      <Route path="/coldwave-4d">{() => <Suspense fallback={null}><Coldwave4DPage /></Suspense>}</Route>
      <Route path="/flashflood-4d">{() => <Suspense fallback={null}><Flashflood4DPage /></Suspense>}</Route>
      <Route path="/grid-v2" component={HexMapV2Page} />
      <Route path="/forecast" component={ForecastPage} />
      <Route path="/report/:district" component={ReportPage} />
      <Route path="/states" component={StateSummaryPage} />
      <Route path="/gap-analysis" component={GapAnalysisPage} />
      <Route path="/methodology" component={MethodologyPage} />
      <Route path="/action-plan" component={ActionPlanPage} />
      <Route path="/screener" component={ScreenerPage} />
      <Route path="/insights" component={InsightsPage} />
      <Route path="/el-nino" component={ElNinoPage} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/technology" component={TechnologyPage} />
      <Route path="/technology/:slug" component={TechnologyPage} />
      <Route path="/wash-assess" component={WashAssessPage} />
      <Route path="/shvr-rajasthan" component={SHVRRajasthanPage} />
      <Route path="/jjm-rajasthan" component={JJMRajasthanPage} />
      <Route path="/csr-rajasthan" component={CSRRajasthanPage} />
      <Route path="/csr-rajasthan/costs" component={CSRCostAssumptionsPage} />
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
