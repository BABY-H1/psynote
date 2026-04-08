import type { CourseBlueprintData, CourseRequirementsConfig } from '@psynote/shared';
import { aiClient } from '../providers/openai-compatible.js';
import { generateCourseBlueprint } from './course-authoring.js';
import { extractStructuredPayload, looksLikeJsonAttempt } from './chat-json-helpers.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface GeneratedCourseDraft {
  title: string;
  description: string;
  category?: string;
  courseType?: string;
  targetAudience?: string;
  requirements: CourseRequirementsConfig;
  blueprint: CourseBlueprintData;
}

export type CreateCourseChatResponse =
  | { type: 'message'; content: string }
  | { type: 'course'; course: GeneratedCourseDraft; summary: string };

const SYSTEM_PROMPT = `你是一位专业的心理健康课程设计师。你的任务是通过对话了解用户需求，最终生成一个可以继续编辑的课程草稿。

## 对话流程

逐步了解：
1. 课程面向谁：学生、家长、教师、咨询师等
2. 课程想解决什么问题：如厌学、情绪管理、沟通冲突、自我认知等
3. 课程形式与规模：微课、系列课、工作坊、团辅课程；节数和每节时长
4. 课程目标与方法：希望达成什么变化，偏向什么理论框架
5. 风格与边界：语气风格、风险级别、适用边界

## 对话策略
- 每次只问 1-2 个问题
- 如果用户已经提供了足够信息，可以直接进入生成
- 你的目标不是问完整表单，而是帮助用户快速把模糊想法收敛成可编辑课程草稿

## 输出规则

在对话阶段，只返回普通文本消息。

当信息足够时，你必须只返回 JSON，不要带任何额外解释：

\`\`\`json
{
  "type": "course",
  "summary": "对生成结果的简短说明",
  "course": {
    "title": "课程名称",
    "description": "课程简介",
    "category": "课程分类",
    "courseType": "series",
    "targetAudience": "parent",
    "requirements": {
      "targetAudience": "parent",
      "problemTopic": "亲子沟通",
      "problemStage": "早期",
      "deliveryFormat": "series",
      "sessionCount": 6,
      "sessionDuration": 60,
      "courseGoals": ["提升认知", "技能训练"],
      "theoreticalFramework": "CBT",
      "expressionStyle": "温和陪伴型",
      "riskLevel": "低风险科普"
    }
  }
}
\`\`\`

## 生成要求
- title 要具体，能体现对象和主题
- description 用 1-3 句概括课程价值
- courseType 只能是 micro_course / series / group_facilitation / workshop 之一
- targetAudience 优先使用 parent / student / counselor / teacher
- requirements 中尽量补齐关键字段，但不要编造过于细碎的信息
- 不要使用 Markdown`;

interface RawCourseWrapper {
  type: 'course';
  summary?: string;
  course: {
    title: string;
    description?: string;
    category?: string;
    courseType?: string;
    targetAudience?: string;
    requirements: CourseRequirementsConfig;
  };
}

function isCourseWrapper(value: unknown): value is RawCourseWrapper {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (obj.type !== 'course') return false;
  const course = obj.course as Record<string, unknown> | undefined;
  return !!course && typeof course.title === 'string' && !!course.requirements;
}

async function tryBuildCourse(content: string): Promise<CreateCourseChatResponse | null> {
  const wrapper = extractStructuredPayload<RawCourseWrapper>(content, isCourseWrapper);
  if (!wrapper) return null;

  const rawCourse = wrapper.course;
  const requirements = rawCourse.requirements;
  const blueprint = await generateCourseBlueprint({ requirements });

  const course: GeneratedCourseDraft = {
    title: rawCourse.title,
    description: rawCourse.description || '',
    category: rawCourse.category || undefined,
    courseType: rawCourse.courseType || undefined,
    targetAudience: rawCourse.targetAudience || requirements.targetAudience || undefined,
    requirements,
    blueprint,
  };

  return { type: 'course', course, summary: wrapper.summary || '' };
}

// See create-scheme-chat for the rationale.
const RETRY_BUDGET_MS = 180_000; // 3 min

export async function chatCreateCourse(
  messages: ChatMessage[],
): Promise<CreateCourseChatResponse> {
  const fullMessages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...messages.map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    })),
  ];

  const startedAt = Date.now();
  const first = await aiClient.chat(fullMessages, {
    temperature: 0.6,
    maxTokens: 8192,
  });

  const firstCourse = await tryBuildCourse(first);
  if (firstCourse) return firstCourse;

  // Retry once with a larger budget if the reply looked like a JSON attempt
  // but couldn't be parsed or repaired — almost always a truncation problem.
  const firstElapsed = Date.now() - startedAt;
  if (looksLikeJsonAttempt(first) && firstElapsed < RETRY_BUDGET_MS) {
    console.warn(
      `[chatCreateCourse] JSON parse fell through after ${firstElapsed}ms, retrying with 12k tokens`,
    );
    const retry = await aiClient.chat(fullMessages, {
      temperature: 0.6,
      maxTokens: 12288,
    });
    const retryCourse = await tryBuildCourse(retry);
    if (retryCourse) return retryCourse;
    console.warn(
      '[chatCreateCourse] Retry still failed to produce a course. Preview:',
      retry.slice(0, 300),
    );
    return { type: 'message', content: retry.trim() };
  } else if (looksLikeJsonAttempt(first)) {
    console.warn(
      `[chatCreateCourse] First attempt looked like JSON but took ${firstElapsed}ms; skipping retry`,
    );
  }

  return { type: 'message', content: first.trim() };
}
