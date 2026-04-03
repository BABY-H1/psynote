import type { RiskLevel, ScoringMode, BatchTargetType, BatchStatus, ReportType, CollectMode, CustomQuestionType, AssessmentBlockType, AssessmentType, AssessmentStatus, DistributionMode, DistributionStatus } from './enums';

export interface Scale {
  id: string;
  orgId?: string;
  title: string;
  description?: string;
  instructions?: string;
  scoringMode: ScoringMode;
  isPublic: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  dimensions?: ScaleDimension[];
  items?: ScaleItem[];
}

export interface ScaleDimension {
  id: string;
  scaleId: string;
  name: string;
  description?: string;
  calculationMethod: ScoringMode;
  sortOrder: number;
  rules?: DimensionRule[];
}

export interface DimensionRule {
  id: string;
  dimensionId: string;
  minScore: number;
  maxScore: number;
  label: string;
  description?: string;
  advice?: string;
  riskLevel?: RiskLevel;
}

export interface ScaleItem {
  id: string;
  scaleId: string;
  dimensionId?: string;
  text: string;
  isReverseScored: boolean;
  options: ScaleOption[];
  sortOrder: number;
}

export interface ScaleOption {
  label: string;
  value: number;
}

export interface Assessment {
  id: string;
  orgId: string;
  title: string;
  description?: string;
  assessmentType: AssessmentType;
  demographics: DemographicField[];
  blocks: AssessmentBlock[];
  screeningRules: ScreeningRules;
  collectMode: CollectMode;
  resultDisplay: ResultDisplayConfig;
  shareToken?: string;
  allowClientReport: boolean;
  status: AssessmentStatus;
  isActive: boolean;
  createdBy?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentBlock {
  id: string;
  type: AssessmentBlockType;
  sortOrder: number;
  scaleId?: string;
  fields?: DemographicField[];
  questions?: CustomQuestion[];
}

export interface CustomQuestion {
  id: string;
  type: CustomQuestionType;
  text: string;
  required: boolean;
  options?: string[];
}

export interface ResultDisplayConfig {
  mode: 'none' | 'custom';
  show: ResultDisplayItem[];
}

export type ResultDisplayItem = 'totalScore' | 'riskLevel' | 'dimensionScores' | 'interpretation' | 'advice' | 'aiInterpret';

/** Tracking assessment config */
export interface TrackingConfig {
  scheduleType: 'manual' | 'recurring';
  recurring?: {
    frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
    count?: number;
    startDate?: string;
  };
}

/** Screening rules — supports multi-condition combinations */
export interface ScreeningRules {
  enabled: boolean;
  conditions: ScreeningCondition[];
  logic: 'AND' | 'OR';
}

export interface ScreeningCondition {
  id: string;
  type: 'total_score' | 'dimension_score' | 'item_value' | 'risk_level';
  operator: '>=' | '<=' | '>' | '<' | '==' | '!=';
  /** scaleId or dimensionId or itemId depending on type */
  targetId?: string;
  targetLabel?: string;
  value: number | string;
  /** Result flag when triggered */
  flag: 'high_risk' | 'moderate_risk' | 'pass' | 'fail' | 'attention';
  flagLabel?: string;
}

/** Distribution task */
export interface Distribution {
  id: string;
  orgId: string;
  assessmentId: string;
  mode: DistributionMode;
  batchLabel?: string;
  targets: DistributionTarget[];
  schedule: DistributionSchedule;
  status: DistributionStatus;
  completedCount: number;
  createdBy?: string;
  createdAt: string;
}

export interface DistributionTarget {
  userId?: string;
  name?: string;
  email?: string;
  phone?: string;
}

export interface DistributionSchedule {
  type: 'immediate' | 'scheduled' | 'recurring' | 'multi_date';
  /** ISO date for scheduled */
  startDate?: string;
  /** Cron-like for recurring: e.g. { frequency: 'monthly', dayOfMonth: 1 } */
  recurring?: { frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly'; count?: number };
  /** Array of ISO dates for multi_date */
  dates?: string[];
}

export interface DemographicField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date';
  required: boolean;
  options?: string[];
}

export interface AssessmentResult {
  id: string;
  orgId: string;
  assessmentId: string;
  userId?: string;
  careEpisodeId?: string;
  demographicData: Record<string, unknown>;
  answers: Record<string, number>;
  customAnswers: Record<string, unknown>;
  dimensionScores: Record<string, number>;
  totalScore: number;
  riskLevel?: RiskLevel;
  aiInterpretation?: string;
  batchId?: string;
  createdBy?: string;
  deletedAt?: string;
  createdAt: string;
}

export interface AssessmentBatch {
  id: string;
  orgId: string;
  assessmentId: string;
  title: string;
  targetType: BatchTargetType;
  targetConfig: Record<string, unknown>;
  deadline?: string;
  status: BatchStatus;
  stats: Record<string, unknown>;
  createdBy?: string;
  createdAt: string;
}

export interface AssessmentReport {
  id: string;
  orgId: string;
  title: string;
  reportType: ReportType;
  resultIds?: string[];
  batchId?: string;
  assessmentId?: string;
  scaleId?: string;
  content: Record<string, unknown>;
  aiNarrative?: string;
  generatedBy?: string;
  createdAt: string;
}
