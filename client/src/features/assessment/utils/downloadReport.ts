import { RISK_LABELS } from '../constants';

/** Download report content as a formatted text file */
export function downloadReportAsText(filename: string, sections: { title: string; content: string }[]) {
  const lines = sections.flatMap(({ title, content }) => [
    title,
    '─'.repeat(title.length * 2),
    content,
    '',
  ]);
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Build individual report text from report content */
export function buildIndividualReportText(
  title: string,
  content: {
    totalScore?: string | number;
    riskLevel?: string;
    demographics?: Record<string, unknown>;
    interpretationPerDimension?: { dimension: string; score: number; label: string; riskLevel?: string; advice?: string }[];
  },
  advice?: string,
) {
  const sections: { title: string; content: string }[] = [
    { title: title, content: `生成日期: ${new Date().toLocaleDateString('zh-CN')}` },
  ];

  if (content.demographics && Object.keys(content.demographics).length > 0) {
    sections.push({
      title: '基本信息',
      content: Object.entries(content.demographics).map(([k, v]) => `${k}: ${v}`).join('\n'),
    });
  }

  sections.push({
    title: '评估结果',
    content: [
      `总分: ${content.totalScore || '-'}`,
      content.riskLevel ? `风险等级: ${RISK_LABELS[content.riskLevel] || content.riskLevel}` : '',
    ].filter(Boolean).join('\n'),
  });

  const interps = content.interpretationPerDimension || [];
  if (interps.length > 0) {
    sections.push({
      title: '维度评估',
      content: interps.map((d) => [
        `${d.dimension}: ${d.score} 分 — ${d.label}`,
        d.riskLevel ? `  风险等级: ${RISK_LABELS[d.riskLevel] || d.riskLevel}` : '',
        d.advice ? `  建议: ${d.advice}` : '',
      ].filter(Boolean).join('\n')).join('\n\n'),
    });
  }

  if (advice) {
    sections.push({ title: '综合建议', content: advice });
  }

  return sections;
}

/** Build group report text */
export function buildGroupReportText(
  title: string,
  content: {
    participantCount?: number;
    riskDistribution?: Record<string, number>;
    dimensionStats?: Record<string, { mean: number; median: number; stdDev: number; min: number; max: number }>;
  },
  advice?: string,
) {
  const sections: { title: string; content: string }[] = [
    { title: title, content: `生成日期: ${new Date().toLocaleDateString('zh-CN')}\n参与人数: ${content.participantCount || 0}` },
  ];

  if (content.riskDistribution) {
    sections.push({
      title: '风险分布',
      content: ['level_1', 'level_2', 'level_3', 'level_4'].map(
        (level) => `${RISK_LABELS[level]}: ${content.riskDistribution![level] || 0} 人`
      ).join('\n'),
    });
  }

  if (content.dimensionStats) {
    sections.push({
      title: '维度统计',
      content: Object.entries(content.dimensionStats).map(
        ([id, s]) => `${id}\n  均值: ${s.mean}  中位数: ${s.median}  标准差: ${s.stdDev}  最低: ${s.min}  最高: ${s.max}`
      ).join('\n\n'),
    });
  }

  if (advice) {
    sections.push({ title: '综合建议', content: advice });
  }

  return sections;
}

/** Build trend report text */
export function buildTrendReportText(
  content: {
    assessmentCount?: number;
    timeline?: { index: number; date: string; totalScore: string; dimensionScores: Record<string, number> }[];
    trends?: Record<string, 'improving' | 'worsening' | 'stable'>;
  },
  advice?: string,
) {
  const trendLabels = { improving: '改善', worsening: '恶化', stable: '稳定' };
  const sections: { title: string; content: string }[] = [
    { title: '追踪评估趋势报告', content: `生成日期: ${new Date().toLocaleDateString('zh-CN')}\n测评次数: ${content.assessmentCount || 0}` },
  ];

  if (content.timeline) {
    sections.push({
      title: '得分变化',
      content: content.timeline.map((t) =>
        `第${t.index}次 (${new Date(t.date).toLocaleDateString('zh-CN')}): 总分 ${t.totalScore}`
      ).join('\n'),
    });
  }

  if (content.trends) {
    sections.push({
      title: '变化趋势',
      content: Object.entries(content.trends).map(
        ([dim, trend]) => `${dim}: ${trendLabels[trend]}`
      ).join('\n'),
    });
  }

  if (advice) {
    sections.push({ title: '综合建议', content: advice });
  }

  return sections;
}
