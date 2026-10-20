import { HAZARD_IDS, Hazard4DPage, type HazardId } from "./Hazard4DPage";

// /4d, optionally /4d?hazard=flood (any hazard id)
export default function Hazard4DRoute() {
  const h = new URLSearchParams(window.location.search).get("hazard");
  const initial = HAZARD_IDS.find((id) => id === h) ?? "heat";
  return <Hazard4DPage initialHazard={initial as HazardId} />;
}
