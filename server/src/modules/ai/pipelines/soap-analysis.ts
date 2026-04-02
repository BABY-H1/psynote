import { aiClient } from '../providers/openai-compatible.js';

interface SOAPInput {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  sessionType?: string;
  duration?: number;
  previousNotes?: string; // summary of past sessions
}

interface SOAPAnalysis {
  summary: string;
  keyThemes: string[];
  progressIndicators: string[];
  riskFlags: string[];
  suggestedFollowUp: string;
}

/**
 * Analyze a SOAP session note and extract clinical insights.
 */
export async function analyzeSOAP(input: SOAPInput): Promise<SOAPAnalysis> {
  const noteContent = [
    input.subjective && `【主观资料】${input.subjective}`,
    input.objective && `【客观资料】${input.objective}`,
    input.assessment && `【评估分析】${input.assessment}`,
    input.plan && `【计划】${input.plan}`,
  ].filter(Boolean).join('\n\n');

  return aiClient.generateJSON<SOAPAnalysis>(
    `你是一位心理咨询临床督导。请分析以下SOAP咨询记录，提取关键临床信息。

返回JSON格式：
{
  "summary": "本次咨询核心摘要（80字以内）",
  "keyThemes": ["主题1", "主题2"],
  "progressIndicators": ["进展指标1", "进展指标2"],
  "riskFlags": ["风险信号（如有）"],
  "suggestedFollowUp": "后续建议（50字以内）"
}

注意：
- 如果记录中有自伤/自杀相关内容，必须在riskFlags中标注
- progressIndicators记录积极变化和消极变化
- 保持专业客观的语气`,
    `咨询方式: ${input.sessionType || '未标注'} | 时长: ${input.duration || '未标注'}分钟
${input.previousNotes ? `\n历史咨询摘要: ${input.previousNotes}` : ''}

本次咨询记录:
${noteContent || '（内容为空）'}`,
    { temperature: 0.4 },
  );
}
