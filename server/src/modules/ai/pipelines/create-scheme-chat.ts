import { aiClient } from '../providers/openai-compatible.js';
import { extractStructuredPayload, looksLikeJsonAttempt } from './chat-json-helpers.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SessionPhase {
  name: string;
  duration?: string;
  description?: string;
  facilitatorNotes?: string;
}

interface GeneratedScheme {
  title: string;
  description: string;
  theory: string;
  overallGoal: string;
  specificGoals: { title: string; metric?: string }[];
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
  sessions: {
    title: string;
    goal: string;
    phases: SessionPhase[];
    materials: string;
    duration: string;
    homework?: string;
    assessmentNotes?: string;
  }[];
}

export type CreateSchemeChatResponse =
  | { type: 'message'; content: string }
  | { type: 'scheme'; scheme: GeneratedScheme; summary: string };

const SYSTEM_PROMPT = `你是一位专业的团体咨询治疗师和课程设计师。你的任务是通过对话了解需求，最终生成一个完整、专业的团体辅导方案。

## 对话流程

逐步了解：
1. **目标人群**：面向谁？年龄段？
2. **主题与目标**：解决什么问题？总目标和具体目标？
3. **理论取向**：CBT、ACT、正念、积极心理学等
4. **次数与时长**：多少次？每次多长？频率？
5. **团体设置**：建议人数？筛选标准？
6. **特殊需求**：场地、材料限制等

## 对话策略
- 每次只问1-2个问题
- 信息足够时主动生成方案

## 输出规则

对话中回复普通文本。当信息足够时返回JSON（不要有其他文本）：

\`\`\`json
{
  "type": "scheme",
  "summary": "简要说明",
  "scheme": {
    "title": "方案名称",
    "description": "方案简介",
    "theory": "理论依据",
    "overallGoal": "总目标",
    "specificGoals": [{"title": "具体目标1", "metric": "衡量方式（如：前后测对比）"}, {"title": "具体目标2", "metric": "衡量方式"}],
    "targetAudience": "目标人群",
    "ageRange": "适用年龄",
    "selectionCriteria": "筛选标准",
    "recommendedSize": "建议人数",
    "totalSessions": 次数,
    "sessionDuration": "每次时长",
    "frequency": "频率",
    "facilitatorRequirements": "带领者要求",
    "evaluationMethod": "评估建议",
    "notes": "注意事项",
    "sessions": [
      {
        "title": "单元标题",
        "goal": "本次目标",
        "phases": [
          {"name": "暖身活动", "duration": "10分钟", "description": "具体说明", "facilitatorNotes": "带领提示"},
          {"name": "核心活动", "duration": "30分钟", "description": "...", "facilitatorNotes": "..."},
          {"name": "分享总结", "duration": "15分钟", "description": "...", "facilitatorNotes": "..."}
        ],
        "materials": "所需材料",
        "duration": "总时长",
        "homework": "课后任务",
        "assessmentNotes": "评估要点"
      }
    ]
  }
}
\`\`\`

## 方案设计原则
- 基于循证心理学理论
- 每次活动应包含结构化环节（暖身→核心→分享→总结等）
- 活动要具体、可操作、包含带领者提示
- 不要使用Markdown格式，只使用纯文本
- 所有内容使用中文`;

interface SchemeWrapperPayload {
  type: 'scheme';
  scheme: GeneratedScheme;
  summary?: string;
}

function isSchemeWrapper(value: unknown): value is SchemeWrapperPayload {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (obj.type !== 'scheme') return false;
  const scheme = obj.scheme as Record<string, unknown> | undefined;
  return !!scheme && typeof scheme.title === 'string' && Array.isArray(scheme.sessions);
}

function isRawScheme(value: unknown): value is GeneratedScheme {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.title === 'string' && Array.isArray(obj.sessions);
}

function normaliseResult(content: string): CreateSchemeChatResponse {
  const wrapped = extractStructuredPayload<SchemeWrapperPayload>(content, isSchemeWrapper);
  if (wrapped) {
    return { type: 'scheme', scheme: wrapped.scheme, summary: wrapped.summary || '' };
  }
  // Some models omit the wrapper and return the scheme directly.
  const raw = extractStructuredPayload<GeneratedScheme>(content, isRawScheme);
  if (raw) {
    return {
      type: 'scheme',
      scheme: raw,
      summary: `已生成方案"${raw.title}"，包含 ${raw.sessions.length} 次活动。`,
    };
  }
  return { type: 'message', content: content.trim() };
}

// Soft budget: skip the truncation retry if we've already burned more than
// this on the first attempt. With ~4.5 min total per request, this leaves
// ~80 s for the retry, enough for a smaller fallback even on slow models.
const RETRY_BUDGET_MS = 180_000; // 3 min

export async function chatCreateScheme(
  messages: ChatMessage[],
): Promise<CreateSchemeChatResponse> {
  const fullMessages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  // First attempt with generous token budget. A 4-session scheme with full
  // phases/facilitator notes easily exceeds 4096 tokens in Chinese.
  const startedAt = Date.now();
  const first = await aiClient.chat(fullMessages, { temperature: 0.6, maxTokens: 8192 });
  const firstResult = normaliseResult(first);
  if (firstResult.type === 'scheme') return firstResult;

  // If the reply looked like JSON but we couldn't parse/repair it, the
  // model most likely got truncated. Retry once with a bigger budget unless
  // we've already exhausted our time slot.
  const firstElapsed = Date.now() - startedAt;
  if (looksLikeJsonAttempt(first) && firstElapsed < RETRY_BUDGET_MS) {
    console.warn(
      `[chatCreateScheme] JSON parse fell through after ${firstElapsed}ms, retrying with 12k tokens`,
    );
    const retry = await aiClient.chat(fullMessages, { temperature: 0.6, maxTokens: 12288 });
    const retryResult = normaliseResult(retry);
    if (retryResult.type === 'scheme') return retryResult;
    console.warn(
      '[chatCreateScheme] Retry still failed to produce a scheme. Preview:',
      retry.slice(0, 300),
    );
  } else if (looksLikeJsonAttempt(first)) {
    console.warn(
      `[chatCreateScheme] First attempt looked like JSON but took ${firstElapsed}ms; skipping retry`,
    );
  }

  return firstResult;
}
