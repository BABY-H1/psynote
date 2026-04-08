import type { CourseBlueprintData, CourseRequirementsConfig } from '@psynote/shared';
import { aiClient } from '../providers/openai-compatible.js';
import { generateCourseBlueprint } from './course-authoring.js';

interface ExtractedCourseRaw {
  title: string;
  description: string;
  category?: string;
  courseType?: string;
  targetAudience?: string;
  requirements: CourseRequirementsConfig;
}

export interface ExtractedCourse {
  title: string;
  description: string;
  category?: string;
  courseType?: string;
  targetAudience?: string;
  requirements: CourseRequirementsConfig;
  blueprint: CourseBlueprintData;
}

const SYSTEM_PROMPT = `你是一位专业的心理健康课程设计师。你的任务是从用户提供的文本中提取一个结构化的课程草稿。

规则：
1. 读懂原文整体意图，提取能反映课程核心的标题、描述、分类、形式、对象。
2. 如果原文不是中文，翻译为中文。
3. requirements 用于后续自动生成课程蓝图，字段尽量补齐但不要凭空编造；缺失信息用合理推断而非空字符串。
4. courseType 仅允许 micro_course / series / group_facilitation / workshop 之一；根据原文结构合理判断（单次偏 micro_course，多节偏 series，互动重偏 workshop，团体活动偏 group_facilitation）。
5. targetAudience 优先使用 parent / student / counselor / teacher。
6. 不要使用 Markdown 格式，所有字段用纯文本。

返回如下 JSON 结构：
{
  "title": "课程名称",
  "description": "课程简介（1-3 句）",
  "category": "课程分类（可选）",
  "courseType": "micro_course" | "series" | "group_facilitation" | "workshop",
  "targetAudience": "parent" | "student" | "counselor" | "teacher",
  "requirements": {
    "targetAudience": "parent" | "student" | "counselor" | "teacher" | "混合对象",
    "problemTopic": "主题或问题",
    "problemStage": "预防期 / 早期 / 冲突拉锯 / 休学适应 / 恢复重建",
    "deliveryFormat": "微课 / 系列课 / 团辅 / 工作坊 / 训练营",
    "sessionCount": 节数(数字),
    "sessionDuration": 每节时长(分钟数字),
    "courseGoals": ["课程目标1", "课程目标2"],
    "theoreticalFramework": "CBT / ACT / 家庭系统 / 发展适应 / 综合",
    "expressionStyle": "专业型 / 温和陪伴型 / 机构招生型 / 学校宣教型",
    "riskLevel": "低风险科普 / 中风险支持 / 需谨慎表述"
  }
}`;

/**
 * Extract a structured course draft from raw text input.
 * Returns the same shape as `create-course-chat` produces, so the
 * downstream importer can save it and jump straight into blueprint editing.
 */
export async function extractCourse(input: { content: string }): Promise<ExtractedCourse> {
  const raw = await aiClient.generateJSON<ExtractedCourseRaw>(
    SYSTEM_PROMPT,
    `请从以下内容中提取课程草稿：\n\n${input.content}`,
    { temperature: 0.2, maxTokens: 3072 },
  );

  if (!raw?.title || !raw?.requirements) {
    throw new Error('AI 未能从文本中提取到有效的课程结构');
  }

  const blueprint = await generateCourseBlueprint({ requirements: raw.requirements });

  return {
    title: raw.title,
    description: raw.description || '',
    category: raw.category || undefined,
    courseType: raw.courseType || undefined,
    targetAudience: raw.targetAudience || raw.requirements.targetAudience || undefined,
    requirements: raw.requirements,
    blueprint,
  };
}
