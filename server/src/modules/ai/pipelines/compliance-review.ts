import { aiClient } from '../providers/openai-compatible.js';

// ─── Pipeline 1: Note Compliance Review ─────────────────────────

interface ComplianceFinding {
  category: string;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  suggestion: string;
}

interface NoteComplianceResult {
  score: number;
  findings: ComplianceFinding[];
}

export async function reviewNoteCompliance(input: {
  noteFormat: string;
  fields: Record<string, string>;
  fieldLabels: Record<string, string>;
}): Promise<NoteComplianceResult> {
  const fieldContent = Object.entries(input.fields)
    .map(([k, v]) => `[${input.fieldLabels[k] || k}]: ${v || '(空)'}`)
    .join('\n\n');

  return aiClient.generateJSON<NoteComplianceResult>(
    `你是一位心理咨询临床合规审查专家。审查以下 ${input.noteFormat.toUpperCase()} 格式的咨询笔记，检查合规性问题。

检查项：
1. **字段完整性**：是否有空白或过于简短的必填字段
2. **干预记录**：笔记中是否记录了具体的咨询干预措施
3. **进展/变化**：是否记录了来访者的进展或变化
4. **风险评估**：如果内容暗示风险（自伤、自杀等），是否有相应记录
5. **具体性**：描述是否足够具体，还是过于笼统
6. **专业性**：用词是否专业适当

返回JSON：
{
  "score": 0-100的合规分数,
  "findings": [{"category":"检查类别", "severity":"info|warning|critical", "description":"问题描述", "suggestion":"改进建议"}]
}

评分标准：90-100优秀，70-89良好，50-69需改进，50以下不合格。`,
    fieldContent,
    { temperature: 0.3 },
  );
}

// ─── Pipeline 2: Golden Thread Assessment ───────────────────────

interface GoldenThreadResult {
  goldenThreadScore: number;
  alignmentDetails: { goal: string; addressed: boolean; evidence: string }[];
  gaps: string[];
}

export async function assessGoldenThread(input: {
  treatmentGoals: { description: string; status: string }[];
  recentNotes: { date: string; fields: Record<string, string> }[];
}): Promise<GoldenThreadResult> {
  const goalsText = input.treatmentGoals
    .map((g, i) => `${i + 1}. ${g.description} (${g.status})`)
    .join('\n');

  const notesText = input.recentNotes
    .map((n) => {
      const content = Object.entries(n.fields).map(([k, v]) => `${k}: ${v}`).join('\n');
      return `--- ${n.date} ---\n${content}`;
    })
    .join('\n\n');

  return aiClient.generateJSON<GoldenThreadResult>(
    `你是一位心理咨询质量审查专家。评估"黄金线程"一致性——治疗计划目标与会谈记录的对齐程度。

"黄金线程"是指治疗计划中的每个目标都应该在会谈记录中有所体现，会谈中的干预措施应该与治疗目标直接相关。

返回JSON：
{
  "goldenThreadScore": 0-100的一致性分数,
  "alignmentDetails": [{"goal":"目标描述", "addressed":true/false, "evidence":"在笔记中的相关证据"}],
  "gaps": ["未在笔记中体现的问题"]
}`,
    `治疗计划目标:\n${goalsText}\n\n近期会谈记录:\n${notesText}`,
    { temperature: 0.3 },
  );
}

// ─── Pipeline 3: Treatment Quality Assessment ───────────────────

interface QualityResult {
  qualityIndicators: {
    empathy: number;
    clinicalJudgment: number;
    interventionSpecificity: number;
    documentationCompleteness: number;
  };
  overallScore: number;
  narrative: string;
  strengths: string[];
  growthAreas: string[];
}

export async function assessTreatmentQuality(input: {
  noteFormat: string;
  fields: Record<string, string>;
  clientContext?: string;
}): Promise<QualityResult> {
  const fieldContent = Object.entries(input.fields)
    .map(([k, v]) => `[${k}]: ${v || '(空)'}`)
    .join('\n\n');

  return aiClient.generateJSON<QualityResult>(
    `你是一位心理咨询督导专家。评估以下咨询笔记的临床质量。

评估维度（每项1-5分）：
1. **共情 (empathy)**：笔记是否反映了对来访者情感的理解和回应
2. **临床判断 (clinicalJudgment)**：评估分析是否有深度，是否展示了专业的临床思维
3. **干预具体性 (interventionSpecificity)**：干预措施是否具体、可操作、有理论依据
4. **文档完整性 (documentationCompleteness)**：记录是否全面、结构清晰

返回JSON：
{
  "qualityIndicators": {"empathy":1-5, "clinicalJudgment":1-5, "interventionSpecificity":1-5, "documentationCompleteness":1-5},
  "overallScore": 0-100的综合分数,
  "narrative": "简要评价（50字以内）",
  "strengths": ["优势1", "优势2"],
  "growthAreas": ["成长空间1", "成长空间2"]
}`,
    `${input.clientContext ? `来访者背景: ${input.clientContext}\n\n` : ''}笔记格式: ${input.noteFormat}\n\n${fieldContent}`,
    { temperature: 0.4 },
  );
}
