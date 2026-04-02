import type { RiskLevel, ScoringMode, BatchTargetType, BatchStatus, ReportType } from './enums';

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
  demographics: DemographicField[];
  isActive: boolean;
  createdBy?: string;
  deletedAt?: string;
  createdAt: string;
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
