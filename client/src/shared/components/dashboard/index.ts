/**
 * Phase 14c — Shared dashboard UI building blocks.
 *
 * These are small, presentational, prop-only components that any main page
 * (SchoolDashboard, HRDashboardHome, OrgAdminDashboard, CrisisDashboardTab)
 * can assemble into its own unique layout.
 *
 * Rule: **小组件复用，大布局独立**. Don't put page-level composition
 * (section heading + card wrapper + layout) here — those live in the pages.
 */
export { StatTile } from './StatTile';
export type { StatTileProps, StatTileTone } from './StatTile';
export { RiskBarStack } from './RiskBarStack';
export type { RiskBarStackProps, RiskBarStackRow } from './RiskBarStack';
export { MonthlyTrendChart } from './MonthlyTrendChart';
export type { MonthlyTrendPoint, MonthlyTrendChartProps } from './MonthlyTrendChart';
export { RiskLevelBreakdown } from './RiskLevelBreakdown';
export type { RiskLevelBreakdownProps } from './RiskLevelBreakdown';
