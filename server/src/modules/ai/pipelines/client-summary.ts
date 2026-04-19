import { aiClient } from '../providers/openai-compatible.js';

interface ClientSummaryInput {
  clientName?: string;
  chiefComplaint?: string;
  currentRisk: string;
  profile?: {
    gender?: string;
    age?: number;
    occupation?: string;
    presentingIssues?: string[];
    medicalHistory?: string;
    familyBackground?: string;
  };
  sessionSummaries?: { date: string; summary: string; tags?: string[] }[];
  assessmentResults?: { date: string; totalScore: number; riskLevel: string; dimensions?: Record<string, number> }[];
  treatmentPlan?: { title?: string; approach?: string; goals: { description: string; status: string }[] };
}

export interface ClientSummaryResult {
  overview: string;
  keyThemes: string[];
  riskProfile: {
    currentLevel: string;
    trend: 'improving' | 'stable' | 'worsening';
    factors: string[];
    protectiveFactors: string[];
  };
  treatmentProgress: string;
  recommendations: string[];
}

export async function generateClientSummary(input: ClientSummaryInput): Promise<ClientSummaryResult> {
  const parts: string[] = [];

  parts.push(`来访者: ${input.clientName || '匿名'}`);
  parts.push(`当前风险等级: ${input.currentRisk}`);

  if (input.chiefComplaint) parts.push(`主诉: ${input.chiefComplaint}`);

  if (input.profile) {
    const p = input.profile;
    const profileParts: string[] = [];
    if (p.gender) profileParts.push(`性别: ${p.gender}`);
    if (p.age) profileParts.push(`年龄: ${p.age}`);
    if (p.occupation) profileParts.push(`职业: ${p.occupation}`);
    if (p.presentingIssues?.length) profileParts.push(`问题标签: ${p.presentingIssues.join('、')}`);
    if (p.medicalHistory) profileParts.push(`病史: ${p.medicalHistory}`);
    if (p.familyBackground) profileParts.push(`家庭背景: ${p.familyBackground}`);
    if (profileParts.length) parts.push(`档案信息:\n${profileParts.join('\n')}`);
  }

  if (input.assessmentResults?.length) {
    const assessments = input.assessmentResults
      .map((a) => `${a.date}: 总分${a.totalScore}, 风险${a.riskLevel}`)
      .join('\n');
    parts.push(`评估记录:\n${assessments}`);
  }

  if (input.sessionSummaries?.length) {
    const sessions = input.sessionSummaries
      .map((s) => `${s.date}: ${s.summary}${s.tags?.length ? ` [${s.tags.join(', ')}]` : ''}`)
      .join('\n');
    parts.push(`近期会谈:\n${sessions}`);
  }

  if (input.treatmentPlan) {
    const tp = input.treatmentPlan;
    const goalSummary = tp.goals.map((g) => `- ${g.description} (${g.status})`).join('\n');
    parts.push(`治疗计划: ${tp.title || ''}${tp.approach ? ` (${tp.approach})` : ''}\n${goalSummary}`);
  }

  return aiClient.generateJSON<ClientSummaryResult>(
    `你是一位心理咨询临床督导。根据来访者的综合信息，生成结构化的来访者概览报告。

要求：
- overview: 总体概述，100字以内
- keyThemes: 核心主题，3-5个关键词
- riskProfile: 风险画像，包括当前等级、趋势（基于评估变化判断）、风险因素、保护因素
- treatmentProgress: 治疗进展概要，50字以内
- recommendations: 2-3条临床建议

用中文回复。返回JSON格式。`,
    parts.join('\n\n'),
    { temperature: 0.4 },
  );
}
