import { aiClient } from '../providers/openai-compatible.js';

interface SuggestInput {
  chiefComplaint?: string;
  riskLevel: string;
  assessmentSummary?: string;
  sessionNotes?: string;
}

interface SuggestedGoal {
  description: string;
  rationale: string;
}

interface SuggestedIntervention {
  description: string;
  frequency?: string;
  rationale: string;
}

interface TreatmentPlanSuggestion {
  suggestedGoals: SuggestedGoal[];
  suggestedInterventions: SuggestedIntervention[];
  sessionPlanSuggestion: string;
  rationale: string;
}

/**
 * AI-powered treatment plan suggestion.
 * Generates goals and intervention strategies based on client context.
 * These are suggestions only — the counselor has full control to modify.
 */
export async function suggestTreatmentPlan(input: SuggestInput): Promise<TreatmentPlanSuggestion> {
  const contextParts: string[] = [];
  if (input.chiefComplaint) contextParts.push(`主诉: ${input.chiefComplaint}`);
  contextParts.push(`当前风险等级: ${input.riskLevel}`);
  if (input.assessmentSummary) contextParts.push(`评估概要:\n${input.assessmentSummary}`);
  if (input.sessionNotes) contextParts.push(`近期会谈记录:\n${input.sessionNotes}`);

  return aiClient.generateJSON<TreatmentPlanSuggestion>(
    `你是一位经验丰富的心理咨询师督导。根据来访者的信息，为咨询师提供治疗计划的建议。

重要原则：
- 你提供的是建议，不是指令。咨询师有自己的专业判断和理论取向。
- 目标应该是具体、可衡量、可达成的。
- 干预策略应该是务实的，不要假设咨询师的理论取向。
- 用中文回复。

返回JSON格式：
{
  "suggestedGoals": [{ "description": "具体目标描述", "rationale": "为什么建议这个目标" }],
  "suggestedInterventions": [{ "description": "策略描述", "frequency": "建议频率", "rationale": "为什么建议" }],
  "sessionPlanSuggestion": "建议的咨询安排（频率、预计次数等）",
  "rationale": "整体治疗方向建议的理由（简要）"
}

建议3-5个目标，2-4个干预策略。`,
    contextParts.join('\n\n'),
    { temperature: 0.5 },
  );
}
