import { aiClient } from '../providers/openai-compatible.js';

interface CaseProgressInput {
  clientName?: string;
  chiefComplaint?: string;
  currentRisk: string;
  sessionNotes: { date: string; summary?: string; subjective?: string; assessment?: string; plan?: string; tags?: string[] }[];
  assessmentResults: { date: string; totalScore: number; riskLevel: string }[];
  riskChanges: { date: string; from: string; to: string }[];
  treatmentGoals: { description: string; status: string }[];
}

interface CaseProgressReport {
  reportPeriod: { from: string; to: string };
  sessionSummary: {
    totalSessions: number;
    keyProgressPoints: string[];
  };
  assessmentChanges: {
    trend: 'improving' | 'stable' | 'worsening';
    details: string;
  };
  goalProgress: {
    goalDescription: string;
    status: string;
    notes: string;
  }[];
  riskAssessment: {
    currentLevel: string;
    trend: string;
  };
  narrative: string;
  recommendations: string[];
}

export async function generateCaseProgressReport(input: CaseProgressInput): Promise<CaseProgressReport> {
  const parts: string[] = [];

  parts.push(`来访者: ${input.clientName || '匿名'}`);
  parts.push(`当前风险等级: ${input.currentRisk}`);
  if (input.chiefComplaint) parts.push(`主诉: ${input.chiefComplaint}`);

  if (input.sessionNotes.length) {
    const notes = input.sessionNotes.map((n) => {
      const content = [n.summary, n.subjective, n.assessment, n.plan].filter(Boolean).join(' | ');
      return `${n.date}: ${content}${n.tags?.length ? ` [${n.tags.join(', ')}]` : ''}`;
    }).join('\n');
    parts.push(`会谈记录 (${input.sessionNotes.length}次):\n${notes}`);
  }

  if (input.assessmentResults.length) {
    const results = input.assessmentResults
      .map((r) => `${r.date}: 总分${r.totalScore}, 风险${r.riskLevel}`)
      .join('\n');
    parts.push(`评估结果:\n${results}`);
  }

  if (input.riskChanges.length) {
    const changes = input.riskChanges
      .map((c) => `${c.date}: ${c.from} → ${c.to}`)
      .join('\n');
    parts.push(`风险变化:\n${changes}`);
  }

  if (input.treatmentGoals.length) {
    const goals = input.treatmentGoals
      .map((g) => `- ${g.description} (${g.status})`)
      .join('\n');
    parts.push(`治疗目标:\n${goals}`);
  }

  return aiClient.generateJSON<CaseProgressReport>(
    `你是一位心理咨询临床督导。根据个案的完整数据，生成一份专业的进度报告。

要求：
- reportPeriod: 报告覆盖的时间范围
- sessionSummary: 会谈次数 + 关键进展节点（3-5个重要节点）
- assessmentChanges: 评估变化趋势和说明
- goalProgress: 每个治疗目标的进度评估
- riskAssessment: 当前风险评估和趋势
- narrative: 叙述性报告（200-400字，可直接作为正式报告使用，语言专业但易读）
- recommendations: 2-4条后续建议

用中文回复。返回JSON格式。`,
    parts.join('\n\n'),
    { temperature: 0.5 },
  );
}
