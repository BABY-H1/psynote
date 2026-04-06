import { aiClient } from '../providers/openai-compatible.js';
import type { CourseBlueprintData, CourseRequirementsConfig } from '@psynote/shared';

// ─── 1. Generate Course Blueprint ──────────────────────────────

export async function generateCourseBlueprint(
  input: { requirements: CourseRequirementsConfig },
): Promise<CourseBlueprintData> {
  const systemPrompt = `你是一位资深的心理健康课程设计专家，擅长设计面向不同群体的心理教育课程。
根据用户提供的结构化需求配置，生成一个完整的课程蓝图。

要求：
1. 基于有循证依据的心理学理论设计课程框架
2. 每节课的主题、目标、核心概念要清晰且层层递进
3. 互动建议要具体、可操作
4. 注意适用边界和不适用人群的提示
5. 如果有风险提示，要在蓝图中体现安全考虑

返回JSON结构：
{
  "courseName": "课程名称",
  "positioning": "课程定位说明（一句话概括课程的核心价值）",
  "targetDescription": "适用对象的详细描述",
  "boundaries": "适用边界与不适用人群提示",
  "goals": ["目标1", "目标2", "目标3"],
  "referralAdvice": "转介建议（什么情况下建议转介而非继续上课）",
  "sessions": [
    {
      "title": "第X节课标题",
      "goal": "本节目标",
      "coreConcepts": "核心概念和知识点",
      "interactionSuggestions": "互动形式建议",
      "homeworkSuggestion": "课后作业/练习建议"
    }
  ]
}

语言：中文。`;

  const req = input.requirements;
  const userPrompt = `请根据以下需求配置生成课程蓝图：

服务对象：${req.targetAudience || '未指定'}
问题主题：${req.problemTopic || '未指定'}
问题阶段：${req.problemStage || '未指定'}
交付形式：${req.deliveryFormat || '系列课'}
课程节数：${req.sessionCount || 6} 节
每节时长：${req.sessionDuration || 60} 分钟
课程目标：${req.courseGoals?.join('、') || '综合'}
理论框架：${req.theoreticalFramework || '综合'}
表达风格：${req.expressionStyle || '专业型'}
风险等级：${req.riskLevel || '低风险科普'}
${req.linkedChiefComplaint ? `来访者主诉：${req.linkedChiefComplaint}` : ''}
${req.linkedRiskLevel ? `来访者风险等级：${req.linkedRiskLevel}` : ''}`;

  return aiClient.generateJSON<CourseBlueprintData>(
    systemPrompt,
    userPrompt,
    { temperature: 0.7, maxTokens: 4096 },
  );
}

// ─── 2. Refine Course Blueprint ────────────────────────────────

export async function refineCourseBlueprint(input: {
  currentBlueprint: CourseBlueprintData;
  instruction: string;
  requirements?: CourseRequirementsConfig;
}): Promise<CourseBlueprintData> {
  const systemPrompt = `你是一位资深的心理健康课程设计专家。
用户已有一个课程蓝图，现在需要你根据修改指令进行调整。
保持课程整体的专业性和逻辑连贯性。

返回完整的修改后的JSON结构（与原蓝图格式相同）：
{
  "courseName": "...",
  "positioning": "...",
  "targetDescription": "...",
  "boundaries": "...",
  "goals": [...],
  "referralAdvice": "...",
  "sessions": [{ "title": "...", "goal": "...", "coreConcepts": "...", "interactionSuggestions": "...", "homeworkSuggestion": "..." }]
}

语言：中文。`;

  const userPrompt = `当前蓝图：
${JSON.stringify(input.currentBlueprint, null, 2)}

修改指令：${input.instruction}`;

  return aiClient.generateJSON<CourseBlueprintData>(
    systemPrompt,
    userPrompt,
    { temperature: 0.5, maxTokens: 4096 },
  );
}

// ─── 3. Generate All Lesson Blocks ─────────────────────────────

interface LessonBlockContent {
  blockType: string;
  content: string;
}

export async function generateAllLessonBlocks(input: {
  blueprint: CourseBlueprintData;
  sessionIndex: number;
  requirements?: CourseRequirementsConfig;
}): Promise<LessonBlockContent[]> {
  const session = input.blueprint.sessions[input.sessionIndex];
  if (!session) throw new Error(`Session index ${input.sessionIndex} out of range`);

  const systemPrompt = `你是一位心理健康课程内容撰写专家。
请为以下课程节次撰写完整的教案内容，按9个固定模块输出。

内容要求：
1. 使用Markdown格式
2. 语言生动、专业但不枯燥
3. 案例要具体、贴近实际
4. 互动环节要能引发思考和体验
5. 活动设计要可操作、有明确步骤
${input.requirements?.expressionStyle === '温和陪伴型' ? '6. 语气温和、支持性强，像一位理解你的朋友' : ''}
${input.requirements?.expressionStyle === '机构招生型' ? '6. 突出专业性和效果，适合对外宣传' : ''}

返回JSON数组（标准教案格式）：
[
  { "blockType": "objectives", "content": "教学目标（知识/技能/情感三维目标）" },
  { "blockType": "key_points", "content": "教学重点和难点" },
  { "blockType": "preparation", "content": "教学准备（教具、课件、场地要求）" },
  { "blockType": "warmup", "content": "暖身活动（5-10分钟，破冰/导入主题）" },
  { "blockType": "main_activity", "content": "主题探索（15-20分钟，核心知识讲解、案例分析）" },
  { "blockType": "experience", "content": "体验活动（10-15分钟，角色扮演/小组讨论/实操练习）" },
  { "blockType": "sharing", "content": "分享总结（5-10分钟，学生分享/教师总结升华）" },
  { "blockType": "extension", "content": "课后延伸（作业/自我观察任务）" },
  { "blockType": "reflection", "content": "教学反思（教后反思要点，仅教师参考）" }
]

语言：中文。`;

  const userPrompt = `课程：${input.blueprint.courseName}
课程定位：${input.blueprint.positioning}
适用对象：${input.blueprint.targetDescription}

当前节次（第${input.sessionIndex + 1}节）：
标题：${session.title}
目标：${session.goal}
核心概念：${session.coreConcepts}
互动建议：${session.interactionSuggestions}
作业建议：${session.homeworkSuggestion}

请生成全部9个内容块。`;

  return aiClient.generateJSON<LessonBlockContent[]>(
    systemPrompt,
    userPrompt,
    { temperature: 0.7, maxTokens: 6144 },
  );
}

// ─── 4. Generate Single Lesson Block ───────────────────────────

export async function generateSingleLessonBlock(input: {
  blueprint: CourseBlueprintData;
  sessionIndex: number;
  blockType: string;
  existingBlocks?: { blockType: string; content: string }[];
}): Promise<string> {
  const session = input.blueprint.sessions[input.sessionIndex];
  if (!session) throw new Error(`Session index ${input.sessionIndex} out of range`);

  const blockLabels: Record<string, string> = {
    objectives: '教学目标',
    key_points: '重点难点',
    preparation: '教学准备',
    warmup: '暖身活动',
    main_activity: '主题探索',
    experience: '体验活动',
    sharing: '分享总结',
    extension: '课后延伸',
    reflection: '教学反思',
  };

  const existingContext = input.existingBlocks
    ?.filter((b) => b.content)
    .map((b) => `[${blockLabels[b.blockType] || b.blockType}]:\n${b.content}`)
    .join('\n\n') || '';

  const systemPrompt = `你是一位心理健康课程内容撰写专家。
请为课程的某一节生成指定类型的内容块。使用Markdown格式。
只返回该块的内容文本，不要包含JSON包装或块类型标注。

语言：中文。`;

  const userPrompt = `课程：${input.blueprint.courseName}
第${input.sessionIndex + 1}节：${session.title}
目标：${session.goal}
核心概念：${session.coreConcepts}

需要生成的块：${blockLabels[input.blockType] || input.blockType}

${existingContext ? `已有其他块内容（供参考保持一致性）：\n${existingContext}` : ''}

请直接输出该块的Markdown内容。`;

  return aiClient.generate(
    systemPrompt,
    userPrompt,
    { temperature: 0.7, maxTokens: 2048 },
  );
}

// ─── 5. Refine Lesson Block ────────────────────────────────────

export async function refineLessonBlock(input: {
  blockContent: string;
  instruction: string;
  blueprint?: CourseBlueprintData;
  sessionIndex?: number;
}): Promise<string> {
  const sessionContext = input.blueprint && input.sessionIndex != null
    ? `\n课程：${input.blueprint.courseName}\n第${input.sessionIndex + 1}节：${input.blueprint.sessions[input.sessionIndex]?.title || ''}`
    : '';

  const systemPrompt = `你是一位心理健康课程内容编辑。
请按照用户的指令修改以下课程内容块。保持Markdown格式。
只返回修改后的内容文本，不要包含JSON包装或额外说明。

语言：中文。`;

  const userPrompt = `${sessionContext}

原始内容：
${input.blockContent}

修改指令：${input.instruction}

请直接输出修改后的Markdown内容。`;

  return aiClient.generate(
    systemPrompt,
    userPrompt,
    { temperature: 0.5, maxTokens: 2048 },
  );
}
