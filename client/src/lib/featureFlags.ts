/**
 * Feature flags for demo-safe deployment.
 *
 * SHOW_FUTURE_2050: gates all 2050/pre-empt surfaces.
 * Set to false until the CMIP6 pipeline fix is complete (post-demo).
 * When true, re-enables: 2050 risk column, Δ escalation, pre-empt split,
 * hazard-shift badge, gap-analysis nav, ReportPage 2050 MetricCard,
 * PDF brief 2050 outlook, GapAnalysisPage data view.
 *
 * Fix tracked in: reports/future_direction_diagnostic.md
 */
export const SHOW_FUTURE_2050 = false;
