import { aiClient } from '../providers/openai-compatible.js';

interface TriageInput {
  riskLevel: string;
  dimensions: { name: string; score: number; label: string }[];
  chiefComplaint?: string;
  availableInterventions: string[]; // ['course', 'group', 'counseling', 'referral']
}

interface TriageRecommendation {
  interventionType: string;
  reason: string;
  urgency: 'routine' | 'soon' | 'urgent' | 'immediate';
  additionalSuggestions: string[];
}

/**
 * AI-powered triage recommendation.
 * Suggests the best intervention type based on risk assessment.
 */
export async function recommendTriage(input: TriageInput): Promise<TriageRecommendation> {
  const dimSummary = input.dimensions
    .map((d) => `${d.name}: ${d.score}分 (${d.label})`)
    .join('\n');

  return aiClient.generateJSON<TriageRecommendation>(
    `你是一位心理咨询分流专家。基于来访者的测评风险等级和维度数据，推荐最合适的干预方式。

四级分流对应关系（参考，可根据具体情况调整）：
- level_1 → course（课程/心理健康教育）
- level_2 → group（团体辅导）
- level_3 → counseling（个体咨询）
- level_4 → referral（转介至精神科/危机干预）

返回JSON格式：
{
  "interventionType": "course|group|counseling|referral",
  "reason": "推荐理由（50字以内）",
  "urgency": "routine|soon|urgent|immediate",
  "additionalSuggestions": ["额外建议"]
}`,
    `风险等级: ${input.riskLevel}
${input.chiefComplaint ? `主诉: ${input.chiefComplaint}` : ''}
可用干预方式: ${input.availableInterventions.join(', ')}

维度得分:
${dimSummary}`,
    { temperature: 0.3 },
  );
}
