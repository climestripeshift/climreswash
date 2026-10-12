"""Deterministic rendering: the evidence block and the verified-results fallback.

Everything here is produced by code from tool results; the model writes none of it.
"""
from __future__ import annotations

DATA_CLASS_LABEL = {
    "screening_index": "Rule-based screening index (not a probability, not validated against impacts)",
    "weather_forecast_screening_index": "Weather-forecast screening index (not a probability)",
    "satellite_gauge_estimate": "Satellite-gauge rainfall estimate (CHIRPS), not a station observation",
    "reanalysis": "Reanalysis (ERA5, model-based), not a station observation",
    "reported_event_records": "Reported event records (IFI), not measured inundation",
    "survey": "Survey / administrative estimate",
    "documentation": "Project documentation",
    "navigation": "Navigation link",
    "gazetteer": "Gazetteer lookup",
}
TEMPORAL_LABEL = {"historical": "historical", "current_release": "current model release", "forecast": "forecast",
                  "static": "static"}


def _prov(p: dict) -> str:
    bits = [p.get("file", "?")]
    if p.get("line"):
        bits[0] += f":{p['line']}"
    if p.get("sha256"):
        bits.append("sha256 " + p["sha256"][:12])
    for k in ("period", "generated_at", "source"):
        if p.get(k):
            bits.append(str(p[k]))
    return " · ".join(bits)


def evidence_block(results) -> str:
    out, seen_lim = [], set()
    for r in results:
        if r.status == "control":
            continue
        sem = r.semantics
        head = f"**{r.tool}** — {DATA_CLASS_LABEL.get(sem.get('data_class'), sem.get('data_class', ''))}"
        if sem.get("temporal_class"):
            head += f" · {TEMPORAL_LABEL.get(sem['temporal_class'], sem['temporal_class'])}"
        if sem.get("coverage"):
            head += f" · coverage: {sem['coverage']}"
        out.append(head)
        if r.status not in ("ok", "stale"):
            out.append(f"- status: {r.status} — {r.summary}")
        for f in r.facts:
            out.append(f"- [{f.id}] {f.label}: {f.display()}")
        if sem.get("spatial"):
            out.append(f"- spatial unit: {sem['spatial']}")
        for p in r.provenance:
            out.append(f"- source: {_prov(p)}")
        for lim in r.limitations:
            if lim not in seen_lim:
                seen_lim.add(lim)
                out.append(f"- limitation: {lim}")
        out.append("")
    return "\n".join(out).strip()


def fallback_answer(results, note: str = "", lead: str = "") -> str:
    """Verified tool results with no model prose. `lead` is a deterministic limitation statement."""
    lines = []
    if lead:
        lines.append("Limitation: " + lead)
    if note:
        lines.append(note)
    for r in results:
        if r.status == "control":
            continue
        if r.status in ("ambiguous", "not_found", "unsupported", "error"):
            lines.append(f"{r.tool}: {r.summary}")
            continue
        lines.append(r.summary)
        for f in r.facts:
            lines.append(f"- {f.label}: {f.display()} [{f.id}]")
    return "\n".join(lines).strip() or "No tool results are available for this request."
