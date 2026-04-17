import { aiClient } from '../providers/openai-compatible.js';
import type { AiCallContext } from '../usage-tracker.js';

interface RiskAssessmentInput {
  dimensions: { name: string; score: number; label: string; riskLevel?: string | null }[];
  totalScore: number;
  ruleBasedRisk: string | null;
  demographics?: Record<string, unknown>;
  chiefComplaint?: string;
}

interface RiskAssessmentResult {
  riskLevel: string;
  confidence: number;
  summary: string;
  factors: string[];
  recommendations: string[];
}

/**
 * AI-enhanced risk assessment.
 * Combines rule-based risk level with AI analysis for a richer risk picture.
 *
 * `track` is optional — when supplied (by callers that know the orgId), the
 * client logs token usage to `ai_call_logs` for the SubscriptionTab's monthly
 * quota meter.
 */
export async function assessRisk(
  input: RiskAssessmentInput,
  track?: Partial<AiCallContext>,
): Promise<RiskAssessmentResult> {
  const dimSummary = input.dimensions
    .map((d) => `${d.name}: ${d.score}分 (${d.label}, 规则风险: ${d.riskLevel || '未设定'})`)
    .join('\n');

  return aiClient.generateJSON<RiskAssessmentResult>(
    `你是一位心理健康风险评估专家。请基于以下测评数据进行风险分析。

风险等级定义：
- level_1: 一般心理困扰（适应问题、轻度情绪波动）→ 推荐课程
- level_2: 需要关注（人际困难、中度焦虑/抑郁）→ 推荐团体辅导
- level_3: 严重心理问题（重度焦虑/抑郁、创伤）→ 推荐个体咨询
- level_4: 危机状态（自伤倾向、精神障碍疑似）→ 推荐转介

返回JSON格式：
{
  "riskLevel": "level_1|level_2|level_3|level_4",
  "confidence": 0.0-1.0,
  "summary": "简要风险分析（100字以内）",
  "factors": ["风险因素1", "风险因素2"],
  "recommendations": ["建议1", "建议2"]
}`,
    `规则引擎判定风险等级: ${input.ruleBasedRisk || '未判定'}
总分: ${input.totalScore}
${input.chiefComplaint ? `主诉: ${input.chiefComplaint}` : ''}

维度得分:
${dimSummary}`,
    {
      temperature: 0.3,
      track: track?.orgId
        ? { orgId: track.orgId, userId: track.userId, pipeline: track.pipeline ?? 'risk-detection' }
        : undefined,
    },
  );
}
