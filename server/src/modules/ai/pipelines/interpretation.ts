import { aiClient } from '../providers/openai-compatible.js';

/**
 * Generate a narrative interpretation of assessment results.
 */
export async function interpretResult(input: {
  scaleName: string;
  dimensions: { name: string; score: number; label: string; riskLevel?: string | null; advice?: string | null }[];
  totalScore: number;
  riskLevel?: string | null;
}): Promise<string> {
  const dimSummary = input.dimensions
    .map((d) => `- ${d.name}: ${d.score}分 (${d.label})${d.riskLevel ? ` [风险: ${d.riskLevel}]` : ''}`)
    .join('\n');

  return aiClient.generate(
    `你是一位专业的心理评估分析师。请根据测评数据为来访者生成一份简洁、专业的测评解读报告。
要求：
- 使用温和、关怀的语气
- 先总结整体情况，再分维度解读
- 对高分维度给出具体建议
- 不要做诊断性陈述，使用"可能"、"倾向于"等表述
- 控制在300字以内`,
    `量表: ${input.scaleName}
总分: ${input.totalScore}
综合风险等级: ${input.riskLevel || '未评定'}

各维度得分:
${dimSummary}`,
    { temperature: 0.6 },
  );
}
