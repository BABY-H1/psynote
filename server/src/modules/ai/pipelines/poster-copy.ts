import { aiClient } from '../providers/openai-compatible.js';

/**
 * Generate marketing copy for a group/course promotional poster.
 */
export async function generatePosterCopy(input: {
  title: string;
  description?: string;
  schedule?: string;
  location?: string;
}): Promise<{ headline: string; subtitle: string; points: string[] }> {
  const raw = await aiClient.generate(
    `你是一位心理健康服务营销文案专家。根据团辅/课程信息，生成吸引目标受众的宣传海报文案。

要求：
- headline: 一句有力的宣传标语（10-20字），可以适当修饰原标题
- subtitle: 一句补充说明（15-30字），突出价值主张
- points: 3个卖点（每个8-15字），突出专业性、安全性、效果

直接输出 JSON 格式，不要加 markdown 标记：
{"headline":"...","subtitle":"...","points":["...","...","..."]}`,

    `活动名称: ${input.title}
${input.description ? `活动简介: ${input.description}` : ''}
${input.schedule ? `时间安排: ${input.schedule}` : ''}
${input.location ? `地点: ${input.location}` : ''}`,

    { temperature: 0.7 },
  );

  try {
    // Try to parse JSON from the response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        headline: parsed.headline || input.title,
        subtitle: parsed.subtitle || '',
        points: Array.isArray(parsed.points) ? parsed.points.slice(0, 3) : [],
      };
    }
  } catch {
    // Fallback
  }

  return {
    headline: input.title,
    subtitle: input.description?.slice(0, 50) || '专业心理团体辅导',
    points: ['科学的方案设计', '专业的带领团队', '安全的团体氛围'],
  };
}
