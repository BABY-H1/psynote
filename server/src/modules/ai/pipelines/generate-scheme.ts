import { aiClient } from '../providers/openai-compatible.js';

interface SessionPhase {
  name: string;
  duration?: string;
  description?: string;
  facilitatorNotes?: string;
}

interface SchemeSession {
  title: string;
  goal: string;
  phases: SessionPhase[];
  materials: string;
  duration: string;
  homework?: string;
  assessmentNotes?: string;
  sessionTheory?: string;
  sessionEvaluation?: string;
  relatedGoals?: number[];
}

interface GeneratedScheme {
  title: string;
  description: string;
  theory: string;
  overallGoal: string;
  specificGoals: string[];
  targetAudience: string;
  recommendedSize: string;
  totalSessions: number;
  sessionDuration: string;
  frequency: string;
  sessions: SchemeSession[];
}

interface SchemeOverview {
  title: string;
  description: string;
  theory: string;
  overallGoal: string;
  specificGoals: string[];
  targetAudience: string;
  recommendedSize: string;
  totalSessions: number;
  sessionDuration: string;
  frequency: string;
  sessionCount: number;
  sessions: { title: string; goal: string; duration: string }[];
}

/**
 * Generates a full group counseling scheme from a natural language prompt.
 */
export async function generateGroupScheme(input: { prompt: string }): Promise<GeneratedScheme> {
  const systemPrompt = `你是一位专业的团体咨询治疗师和课程设计师。
根据用户的需求，设计一个专业、全面的团体辅导方案。

要求：
1. 基于有循证依据的心理学理论。
2. 每个活动单元必须包含结构化的活动环节（phases），如暖身、核心活动、分享、总结等。
3. 不要使用Markdown格式，用纯文本和简单编号。

返回JSON结构：
{
  "title": "方案名称",
  "description": "方案描述",
  "theory": "理论基础",
  "overallGoal": "总目标",
  "specificGoals": ["具体目标1", "具体目标2"],
  "targetAudience": "目标人群",
  "recommendedSize": "建议人数",
  "totalSessions": 次数,
  "sessionDuration": "每次时长",
  "frequency": "频率",
  "sessions": [
    {
      "title": "单元标题",
      "goal": "目标",
      "phases": [
        {"name": "环节名称", "duration": "时长", "description": "活动说明", "facilitatorNotes": "带领提示"}
      ],
      "materials": "所需材料",
      "duration": "时长",
      "homework": "课后任务",
      "assessmentNotes": "评估要点"
    }
  ]
}

语言：中文。`;

  return aiClient.generateJSON<GeneratedScheme>(
    systemPrompt,
    input.prompt,
    { temperature: 0.7, maxTokens: 4096 },
  );
}

/**
 * Generates only the overall structure/outline without detailed phases.
 */
export async function generateGroupSchemeOverall(input: { prompt: string }): Promise<SchemeOverview> {
  const systemPrompt = `你是一位专业的团体咨询治疗师。
根据需求设计团体辅导方案的整体框架（不需要详细活动环节，只需大纲）。

不要使用Markdown格式。

返回JSON结构：
{
  "title": "方案名称",
  "description": "方案描述",
  "theory": "理论基础",
  "overallGoal": "总目标",
  "specificGoals": ["具体目标1"],
  "targetAudience": "目标人群",
  "recommendedSize": "建议人数",
  "totalSessions": 次数,
  "sessionDuration": "每次时长",
  "frequency": "频率",
  "sessionCount": 单元数,
  "sessions": [
    {"title": "单元标题", "goal": "目标", "duration": "时长"}
  ]
}

语言：中文。`;

  return aiClient.generateJSON<SchemeOverview>(
    systemPrompt,
    input.prompt,
    { temperature: 0.7, maxTokens: 2048 },
  );
}

/**
 * Generates detailed phases for a single session.
 */
export async function generateGroupSessionDetail(input: {
  overallScheme: SchemeOverview;
  sessionIndex: number;
  prompt: string;
}): Promise<{ activities: string; materials: string }> {
  const session = input.overallScheme.sessions[input.sessionIndex];

  const systemPrompt = `你是一位专业的团体咨询治疗师。
为团体辅导方案中的一个具体单元设计详细的活动环节。

不要使用Markdown格式，用纯文本和简单编号。

返回JSON结构：
{
  "activities": "活动流程（分步骤描述）",
  "materials": "所需材料"
}

语言：中文。`;

  const userPrompt = `方案背景：
标题: ${input.overallScheme.title}
描述: ${input.overallScheme.description}
理论基础: ${input.overallScheme.theory}

需要设计详细活动的单元（第 ${input.sessionIndex + 1} 节，共 ${input.overallScheme.sessions.length} 节）：
标题: ${session.title}
目标: ${session.goal}
时长: ${session.duration}

用户需求: ${input.prompt}`;

  return aiClient.generateJSON<{ activities: string; materials: string }>(
    systemPrompt,
    userPrompt,
    { temperature: 0.7, maxTokens: 2048 },
  );
}

/**
 * Refines the overall scheme outline based on user instruction.
 */
export async function refineGroupSchemeOverall(input: {
  currentScheme: SchemeOverview;
  instruction: string;
}): Promise<SchemeOverview> {
  const systemPrompt = `你是一位专业的团体咨询治疗师。
根据修改指令更新团体辅导方案。保持现有结构，除非用户要求修改。不要使用Markdown格式。

返回和输入相同的JSON结构。语言：中文。`;

  return aiClient.generateJSON<SchemeOverview>(
    systemPrompt,
    `当前方案JSON：\n${JSON.stringify(input.currentScheme)}\n\n修改指令：\n${input.instruction}`,
    { temperature: 0.5, maxTokens: 2048 },
  );
}

/**
 * Refines a specific session's details based on user instruction.
 */
export async function refineGroupSessionDetail(input: {
  currentSession: SchemeSession;
  overallScheme: SchemeOverview;
  sessionIndex: number;
  instruction: string;
}): Promise<SchemeSession> {
  const session = input.overallScheme.sessions[input.sessionIndex];

  // Build KR context
  const krList = (input.overallScheme as any).specificGoals || [];
  const krContext = krList.length > 0
    ? `\n\n方案的 Key Results（关键结果）：\n${krList.map((kr: any, i: number) => `KR${i}: ${typeof kr === 'string' ? kr : kr.title}${kr.metric ? `（衡量: ${kr.metric}）` : ''}`).join('\n')}`
    : '';

  const systemPrompt = `你是一位专业的团体咨询治疗师。
根据修改指令更新团体辅导方案中一个具体单元。
不要使用Markdown格式。

返回JSON结构：
{
  "title": "...", "goal": "...", "phases": [...], "materials": "...", "duration": "...",
  "homework": "...", "assessmentNotes": "...",
  "sessionTheory": "本次使用的理论/技术",
  "sessionEvaluation": "本次评估方式（可填'无'）",
  "relatedGoals": [0, 2]
}

其中 relatedGoals 是本次活动对应的 Key Results 的索引数组（从0开始）。请根据活动内容自动判断对应哪些 KR。

语言：中文。`;

  const userPrompt = `方案背景：
标题: ${input.overallScheme.title}
理论基础: ${input.overallScheme.theory}${krContext}

目标单元（第 ${input.sessionIndex + 1} 节）：
标题: ${session.title}
目标: ${session.goal}

当前内容JSON：
${JSON.stringify(input.currentSession)}

修改指令：
${input.instruction}`;

  return aiClient.generateJSON<SchemeSession>(
    systemPrompt,
    userPrompt,
    { temperature: 0.5, maxTokens: 2048 },
  );
}
