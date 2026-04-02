import type { ReportType } from './enums';

export interface AssessmentReportContent {
  type: ReportType;
}

/** Single person, single assessment */
export interface IndividualSingleReport extends AssessmentReportContent {
  type: 'individual_single';
  userId: string;
  demographics: Record<string, unknown>;
  dimensionScores: Record<string, number>;
  totalScore: number;
  riskLevel: string;
  interpretationPerDimension: DimensionInterpretation[];
}

/** Single person, multiple assessments over time */
export interface IndividualTrendReport extends AssessmentReportContent {
  type: 'individual_trend';
  userId: string;
  comparisons: TimePointComparison[];
  scaleConsistency: 'same_version' | 'different_version';
  trendAnalysis: Record<string, 'improving' | 'stable' | 'worsening'>;
  aiProgressSummary?: string;
}

/** Multiple people, single assessment */
export interface GroupSingleReport extends AssessmentReportContent {
  type: 'group_single';
  participantCount: number;
  completionRate: number;
  riskDistribution: Record<string, number>;
  dimensionStats: Record<string, DimensionStats>;
  highRiskList: unknown[];
  demographicBreakdowns: Record<string, Record<string, { meanTotal: number; count: number }>>;
}

/** Multiple people, multiple assessments (pre/post comparison) */
export interface GroupTrendReport extends AssessmentReportContent {
  type: 'group_trend';
  timePoints: string[];
  scaleConsistency: 'same_version' | 'different_version';
  matchedParticipants: number;
  unmatched: { preOnly: number; postOnly: number };
  pairedComparison: Record<string, PairedStats>;
  riskMigration: Record<string, number>;
}

export interface DimensionInterpretation {
  dimension: string;
  score: number;
  label: string;
  advice?: string;
}

export interface TimePointComparison {
  date: string;
  totalScore: number;
  riskLevel: string;
  dimensionScores: Record<string, number>;
}

export interface DimensionStats {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
}

export interface PairedStats {
  preMean: number;
  postMean: number;
  effectSize?: number;
  pValue?: number;
}
