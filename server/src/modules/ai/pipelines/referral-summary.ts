import { aiClient } from '../providers/openai-compatible.js';

interface ReferralInput {
  reason: string;
  riskLevel: string;
  dimensions: { name: string; score: number; label: string }[];
  chiefComplaint?: string;
  sessionHistory?: string; // brief history from session notes
  targetType?: string;
}

/**
 * Generate a professional referral summary for external providers.
 */
export async function generateReferralSummary(input: ReferralInput): Promise<string> {
  const dimSummary = input.dimensions
    .map((d) => `${d.name}: ${d.score}分 (${d.label})`)
    .join('\n');

  return aiClient.generate(
    `你是一位心理咨询转介专家。请生成一份专业的转介摘要，供接收机构/医生参考。

格式要求：
1. 来访者概况（不含真实身份信息）
2. 当前风险评估
3. 主要问题描述
4. 已实施的干预
5. 转介原因
6. 建议关注事项

注意：
- 使用专业临床术语
- 客观描述，不带价值判断
- 控制在300字以内`,
    `转介原因: ${input.reason}
当前风险等级: ${input.riskLevel}
转介目标: ${input.targetType || '未指定'}
${input.chiefComplaint ? `主诉: ${input.chiefComplaint}` : ''}
${input.sessionHistory ? `\n咨询历史摘要: ${input.sessionHistory}` : ''}

测评数据:
${dimSummary}`,
    { temperature: 0.4 },
  );
}
