import type { RiskLevel, AssessmentType, CollectMode } from '@psynote/shared';

export const RISK_LABELS: Record<string, string> = {
  level_1: '一级',
  level_2: '二级',
  level_3: '三级',
  level_4: '四级',
};

export const RISK_COLORS: Record<string, string> = {
  level_1: 'bg-green-50 text-green-700',
  level_2: 'bg-yellow-50 text-yellow-700',
  level_3: 'bg-orange-50 text-orange-700',
  level_4: 'bg-red-50 text-red-700',
};

export const ASSESSMENT_TYPE_LABELS: Record<string, string> = {
  screening: '心理筛查',
  intake: '入组筛选',
  tracking: '追踪评估',
  survey: '调查问卷',
};

export const COLLECT_MODE_LABELS: Record<string, string> = {
  anonymous: '完全匿名',
  optional_register: '可选注册',
  require_register: '必须登录',
};
