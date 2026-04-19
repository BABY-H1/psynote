/**
 * Shared types for ScaleDetail's edit-mode state tree.
 *
 * These are the UI's mirror of the backend scale shape, flattened to
 * make nested `useState` updates ergonomic. They're intentionally
 * plain (no branded ids, no readonly) because every sub-panel below
 * ScaleDetail mutates through setState and would otherwise need
 * casts on every call site.
 */

export type SubTab = 'overview' | 'dimensions' | 'items' | 'options';

export interface RuleEdit {
  minScore: number;
  maxScore: number;
  label: string;
  description: string;
  advice: string;
  riskLevel: string;
}

export interface DimensionEdit {
  name: string;
  description: string;
  calculationMethod: string;
  rules: RuleEdit[];
}

export interface ItemEdit {
  text: string;
  dimensionIndex: number;
  isReverseScored: boolean;
}

export interface OptionEdit {
  label: string;
  value: number;
}

export interface EditState {
  title: string;
  description: string;
  instructions: string;
  scoringMode: string;
  isPublic: boolean;
  dimensions: DimensionEdit[];
  items: ItemEdit[];
  /** Options are shared across every item — stored once, broadcast on save. */
  options: OptionEdit[];
}

export const RISK_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '无风险等级' },
  { value: 'level_1', label: '一级（一般）' },
  { value: 'level_2', label: '二级（关注）' },
  { value: 'level_3', label: '三级（严重）' },
  { value: 'level_4', label: '四级（危机）' },
];

export const SCORING_MODE_LABELS: Record<string, string> = {
  sum: '总分求和',
  average: '平均分',
};
