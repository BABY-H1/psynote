import { aiClient } from '../providers/openai-compatible.js';

interface ProgressInput {
  clientName?: string;
  comparisons: {
    date: string;
    totalScore: number;
    riskLevel: string;
    dimensionScores: Record<string, number>;
  }[];
  dimensionNames: Record<string, string>; // dimId → name
  interventionType?: string;
}

/**
 * Generate a progress comparison report for counselor review.
 */
export async function generateProgressReport(input: ProgressInput): Promise<string> {
  const timeline = input.comparisons
    .map((c) => {
      const dims = Object.entries(c.dimensionScores)
        .map(([id, score]) => `  ${input.dimensionNames[id] || id}: ${score}`)
        .join('\n');
      return `[${c.date}] 总分=${c.totalScore} 风险=${c.riskLevel}\n${dims}`;
    })
    .join('\n\n');

  return aiClient.generate(
    `你是一位心理咨询进展分析师。请基于来访者的多次测评数据，生成一份专业的进展对比报告，供咨询师参考。

报告要求：
- 概述整体变化趋势（改善/恶化/稳定）
- 逐维度分析变化
- 标注值得关注的异常变化
- 给出临床建议（是否需要调整干预方案）
- 使用专业但易读的语言
- 控制在400字以内
- 提醒咨询师这是AI辅助分析，最终判断需结合临床经验`,
    `来访者: ${input.clientName || '匿名'}
当前干预方式: ${input.interventionType || '未知'}

测评时间线:
${timeline}`,
    { temperature: 0.5 },
  );
}
