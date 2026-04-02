import { aiClient } from '../providers/openai-compatible.js';

interface SchemeSession {
  title: string;
  goal: string;
  activities: string;
  materials: string;
  duration: string;
}

interface GeneratedScheme {
  title: string;
  description: string;
  theory: string;
  category: string;
  duration: string;
  schedule: string;
  capacity: number;
  sessions: SchemeSession[];
}

interface SchemeOverview {
  title: string;
  description: string;
  theory: string;
  category: string;
  duration: string;
  schedule: string;
  capacity: number;
  sessionCount: number;
  sessions: { title: string; goal: string; duration: string }[];
}

/**
 * Generates a full group counseling scheme from a natural language prompt.
 * Replicates old generateGroupScheme().
 */
export async function generateGroupScheme(input: { prompt: string }): Promise<GeneratedScheme> {
  const systemPrompt = `你是一位专业的团体咨询治疗师和课程设计师。
根据用户的需求，设计一个专业、全面的团体辅导方案。

要求：
1. 基于有循证依据的心理学理论（如CBT、ACT、正念、积极心理学等）。
2. 活动要具体、有创意、可操作，包含详细步骤。
3. 不要使用Markdown格式，用纯文本和简单编号（1. 2. 3.）表示步骤。

返回JSON结构：
{
  "title": "方案名称",
  "description": "方案描述",
  "theory": "理论基础（纯文本）",
  "category": "分类（如relationship/stress/growth/grief/other）",
  "duration": "总时长",
  "schedule": "安排频率",
  "capacity": 人数上限,
  "sessions": [
    {
      "title": "单元标题",
      "goal": "目标",
      "activities": "活动流程（纯文本，分步骤描述）",
      "materials": "所需材料",
      "duration": "时长"
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
 * Generates only the overall structure/outline without detailed activities.
 * Replicates old generateGroupSchemeOverall().
 */
export async function generateGroupSchemeOverall(input: { prompt: string }): Promise<SchemeOverview> {
  const systemPrompt = `你是一位专业的团体咨询治疗师和课程设计师。
根据用户的需求，设计团体辅导方案的整体框架（不需要详细活动内容，只需大纲和高级别目标）。

不要使用Markdown格式。

返回JSON结构：
{
  "title": "方案名称",
  "description": "方案描述",
  "theory": "理论基础",
  "category": "分类",
  "duration": "总时长",
  "schedule": "安排频率",
  "capacity": 人数上限,
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
 * Generates detailed activities for a single session.
 * Replicates old generateGroupSessionDetail().
 */
export async function generateGroupSessionDetail(input: {
  overallScheme: SchemeOverview;
  sessionIndex: number;
  prompt: string;
}): Promise<{ activities: string; materials: string }> {
  const session = input.overallScheme.sessions[input.sessionIndex];

  const systemPrompt = `你是一位专业的团体咨询治疗师。
为团体辅导方案中的一个具体单元设计详细的活动流程。

不要使用Markdown格式，用纯文本和简单编号（1. 2. 3.）表示步骤。

返回JSON结构：
{
  "activities": "活动流程（纯文本，分步骤）",
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

用户原始需求: ${input.prompt}

请提供该单元的详细活动流程和所需材料。`;

  return aiClient.generateJSON<{ activities: string; materials: string }>(
    systemPrompt,
    userPrompt,
    { temperature: 0.7, maxTokens: 2048 },
  );
}

/**
 * Refines the overall scheme outline based on user instruction.
 * Replicates old refineGroupSchemeOverall().
 */
export async function refineGroupSchemeOverall(input: {
  currentScheme: SchemeOverview;
  instruction: string;
}): Promise<SchemeOverview> {
  const systemPrompt = `你是一位专业的团体咨询治疗师。
根据用户的修改指令，更新团体辅导方案的整体框架。不要生成详细活动，只更新大纲和目标。
保持现有结构和字段，除非用户明确要求修改。不要使用Markdown格式。

返回和输入相同的JSON结构。语言：中文。`;

  return aiClient.generateJSON<SchemeOverview>(
    systemPrompt,
    `当前方案JSON：\n${JSON.stringify(input.currentScheme)}\n\n修改指令：\n${input.instruction}`,
    { temperature: 0.5, maxTokens: 2048 },
  );
}

/**
 * Refines a specific session's details based on user instruction.
 * Replicates old refineGroupSessionDetail().
 */
export async function refineGroupSessionDetail(input: {
  currentSession: SchemeSession;
  overallScheme: SchemeOverview;
  sessionIndex: number;
  instruction: string;
}): Promise<SchemeSession> {
  const session = input.overallScheme.sessions[input.sessionIndex];

  const systemPrompt = `你是一位专业的团体咨询治疗师。
根据用户的修改指令，更新团体辅导方案中一个具体单元的详细内容。
不要使用Markdown格式。

返回JSON结构：
{"title": "...", "goal": "...", "activities": "...", "materials": "...", "duration": "..."}

语言：中文。`;

  const userPrompt = `方案背景：
标题: ${input.overallScheme.title}
理论基础: ${input.overallScheme.theory}

目标单元（第 ${input.sessionIndex + 1} 节）：
标题: ${session.title}
目标: ${session.goal}

当前单元详细内容JSON：
${JSON.stringify(input.currentSession)}

修改指令：
${input.instruction}`;

  return aiClient.generateJSON<SchemeSession>(
    systemPrompt,
    userPrompt,
    { temperature: 0.5, maxTokens: 2048 },
  );
}
