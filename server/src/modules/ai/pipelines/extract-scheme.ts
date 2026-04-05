import { aiClient } from '../providers/openai-compatible.js';

interface SessionPhase {
  name: string;
  duration?: string;
  description?: string;
  facilitatorNotes?: string;
}

interface ExtractedSession {
  title: string;
  goal: string;
  phases: SessionPhase[];
  materials: string;
  duration: string;
  homework?: string;
  assessmentNotes?: string;
}

interface ExtractedScheme {
  title: string;
  description: string;
  theory: string;
  overallGoal: string;
  specificGoals: string[];
  targetAudience: string;
  ageRange?: string;
  selectionCriteria?: string;
  recommendedSize: string;
  totalSessions: number;
  sessionDuration: string;
  frequency: string;
  facilitatorRequirements?: string;
  evaluationMethod?: string;
  notes?: string;
  sessions: ExtractedSession[];
}

/**
 * Extracts a structured group counseling scheme from raw text input.
 */
export async function extractScheme(input: { content: string }): Promise<ExtractedScheme> {
  const systemPrompt = `你是一位专业的团体咨询治疗师。你的任务是从用户提供的文本中提取一个结构化的团体辅导方案。

规则：
1. 提取方案的所有信息字段，包括目标、适用对象、团体设置、评估方法等。
2. 每个活动单元的"活动流程"要拆分为结构化环节（phases），每个环节有名称、时长、说明。
3. 如果原文不是中文，翻译为中文。
4. 不要在任何字段中使用Markdown格式，只使用纯文本和简单编号。
5. 如果原文缺少某些信息，根据内容合理推断补充。

返回如下JSON结构：
{
  "title": "方案名称",
  "description": "方案简介",
  "theory": "理论依据",
  "overallGoal": "总目标",
  "specificGoals": ["具体目标1（可测量的）", "具体目标2"],
  "targetAudience": "目标人群",
  "ageRange": "适用年龄范围",
  "selectionCriteria": "筛选/排除标准",
  "recommendedSize": "建议人数",
  "totalSessions": 次数(数字),
  "sessionDuration": "每次时长",
  "frequency": "频率",
  "facilitatorRequirements": "带领者要求",
  "evaluationMethod": "评估建议",
  "notes": "注意事项（保密、退出机制、危机预案等）",
  "sessions": [
    {
      "title": "单元标题",
      "goal": "本次目标",
      "phases": [
        {"name": "暖身活动", "duration": "10分钟", "description": "具体活动说明", "facilitatorNotes": "带领提示"},
        {"name": "核心活动", "duration": "30分钟", "description": "...", "facilitatorNotes": "..."}
      ],
      "materials": "所需材料",
      "duration": "总时长",
      "homework": "课后任务",
      "assessmentNotes": "评估要点"
    }
  ]
}`;

  return aiClient.generateJSON<ExtractedScheme>(
    systemPrompt,
    `请从以下内容中提取团体辅导方案结构：\n\n${input.content}`,
    { temperature: 0.2 },
  );
}
