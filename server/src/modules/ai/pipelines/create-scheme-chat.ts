import { aiClient } from '../providers/openai-compatible.js';

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
    "specificGoals": ["具体目标1", "具体目标2"],
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

export async function chatCreateScheme(
  messages: ChatMessage[],
): Promise<CreateSchemeChatResponse> {
  const fullMessages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  const result = await aiClient.chat(fullMessages, { temperature: 0.6, maxTokens: 4096 });
  const trimmed = result.trim();

  let jsonStr = trimmed;
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed.type === 'scheme' && parsed.scheme) {
      return { type: 'scheme', scheme: parsed.scheme, summary: parsed.summary || '' };
    }
  } catch { /* Not JSON */ }

  return { type: 'message', content: trimmed };
}
