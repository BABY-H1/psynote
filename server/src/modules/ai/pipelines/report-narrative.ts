import { aiClient } from '../providers/openai-compatible.js';

/** Generate an individual report narrative based on assessment results */
export async function generateIndividualNarrative(input: {
  assessmentType: string;
  totalScore: number | string;
  riskLevel?: string;
  dimensions: { name: string; score: number; label: string; riskLevel?: string; advice?: string }[];
}): Promise<string> {
  const dimText = input.dimensions.map((d) =>
    `- ${d.name}: ${d.score}分, ${d.label}${d.riskLevel ? ` (${d.riskLevel})` : ''}${d.advice ? `, 建议: ${d.advice}` : ''}`,
  ).join('\n');

  const prompt = `基于以下心理测评结果，撰写一段专业、温和、有建设性的个人化解读（200字以内）：

测评类型: ${input.assessmentType}
总分: ${input.totalScore}
风险等级: ${input.riskLevel || '无'}
维度评估:
${dimText}

要求：语气温和专业，避免制造恐慌，提供具体可行的建议。`;

  return aiClient.generate(
    '你是一位专业的心理咨询师，擅长撰写心理测评报告的个性化解读。',
    prompt,
    { temperature: 0.5, maxTokens: 500 },
  );
}

/** Generate a group report narrative summary */
export async function generateGroupNarrative(input: {
  assessmentType: string;
  participantCount: number;
  riskDistribution: Record<string, number>;
  dimensionStats: Record<string, { mean: number; stdDev: number }>;
}): Promise<string> {
  const riskText = Object.entries(input.riskDistribution)
    .map(([level, count]) => `${level}: ${count}人`)
    .join(', ');

  const dimText = Object.entries(input.dimensionStats)
    .map(([name, s]) => `${name}: 均值${s.mean}, 标准差${s.stdDev}`)
    .join('; ');

  const prompt = `基于以下团体心理测评数据，撰写一段专业的团体分析摘要（300字以内）：

测评类型: ${input.assessmentType}
参与人数: ${input.participantCount}
风险分布: ${riskText}
维度统计: ${dimText}

要求：分析群体整体心理健康状况，指出需要关注的风险人群比例，提出针对性的群体干预建议。`;

  return aiClient.generate(
    '你是一位心理健康管理专家，擅长分析群体心理测评数据并撰写团体报告。',
    prompt,
    { temperature: 0.5, maxTokens: 600 },
  );
}

/** Generate a trend analysis narrative */
export async function generateTrendNarrative(input: {
  timeline: { index: number; totalScore: string | number; riskLevel?: string; dimensionScores: Record<string, number> }[];
  trends: Record<string, 'improving' | 'worsening' | 'stable'>;
}): Promise<string> {
  const timelineText = input.timeline.map((t) =>
    `第${t.index}次: 总分${t.totalScore}, 风险${t.riskLevel || '无'}`,
  ).join('\n');

  const trendText = Object.entries(input.trends)
    .map(([dim, trend]) => `${dim}: ${trend === 'improving' ? '改善' : trend === 'worsening' ? '恶化' : '稳定'}`)
    .join(', ');

  const prompt = `基于以下追踪评估数据，撰写一段纵向变化分析（200字以内）：

测评时间线:
${timelineText}

变化趋势: ${trendText}

要求：分析变化原因，对改善的维度给予肯定，对恶化的维度提出关注建议。`;

  return aiClient.generate(
    '你是一位心理咨询师，擅长分析来访者的心理状态变化趋势。',
    prompt,
    { temperature: 0.5, maxTokens: 500 },
  );
}
