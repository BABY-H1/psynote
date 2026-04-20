import { aiClient } from '../providers/openai-compatible.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface GeneratedGoal {
  title: string;
  description: string;
  problemArea: string; // one of the 12 enum values, validated server-side on save
  category: 'short_term' | 'long_term';
  objectivesTemplate: string[];
  interventionSuggestions: string[];
}

export type CreateGoalChatResponse =
  | { type: 'message'; content: string }
  | { type: 'goal'; goal: GeneratedGoal; summary: string };

/**
 * Multi-turn chat: ask about the client / problem / preferred modality until
 * enough info is collected, then emit a structured goal. Prompt matches the
 * pattern used by the other 4 library AI chats (scale/scheme/agreement/note).
 */
const SYSTEM_PROMPT = `你是一位专业的循证心理治疗师。你的任务是通过对话了解来访者的需求，最终生成一个完整、可操作的治疗目标模板。

## 对话流程

逐步了解：
1. **问题领域**：来访者主诉是哪一类？（焦虑、抑郁、人际、创伤、自尊、成瘾、学业、职业、家庭等）
2. **具体表现**：症状/行为的具体形式、频率、持续时长
3. **来访者群体**：成人、青少年、儿童？
4. **治疗时长**：短期（8-12 次以内）还是长期干预？
5. **偏好取向**：CBT、ACT、精神动力、人本主义、正念等

## 对话策略
- 每次只问 1-2 个问题
- 信息足够时主动生成目标

## 输出规则

对话中回复普通文本。当信息足够时返回 JSON（除此之外不要有任何其它文本）：

\`\`\`json
{
  "type": "goal",
  "summary": "简要说明",
  "goal": {
    "title": "目标名称",
    "description": "简要描述",
    "problemArea": "anxiety",
    "category": "short_term",
    "objectivesTemplate": ["可测量的具体子目标 1", "可测量的具体子目标 2"],
    "interventionSuggestions": ["具体干预技术 1", "具体干预技术 2"]
  }
}
\`\`\`

## problemArea 取值
anxiety / depression / relationship / trauma / self_esteem / grief / anger / substance / academic / career / family / other

## category 取值
short_term / long_term

## 撰写原则
- 目标要具体、可测量、有时间节点
- 干预要有明确的循证依据
- 语言专业但易懂
- 不要使用 Markdown 格式，纯文本即可
- 所有字段使用中文（枚举值保留英文）`;

/**
 * Multi-strategy JSON extractor. Same shape as create-agreement-chat's —
 * models vary in how cleanly they emit the wrapper.
 */
function tryParseGoal(trimmed: string): CreateGoalChatResponse | null {
  const candidates: (string | null)[] = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/s, '').replace(/\s*```\s*$/s, ''),
    (() => {
      const m = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      return m ? m[1] : null;
    })(),
    (() => {
      const s = trimmed.indexOf('{');
      if (s === -1) return null;
      let d = 0;
      for (let i = s; i < trimmed.length; i++) {
        if (trimmed[i] === '{') d++;
        if (trimmed[i] === '}') d--;
        if (d === 0) return trimmed.slice(s, i + 1);
      }
      return null;
    })(),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed?.type === 'goal' && parsed.goal && parsed.goal.title) {
        return { type: 'goal', goal: parsed.goal, summary: parsed.summary || '' };
      }
      // Some models omit the wrapper.
      if (parsed?.title && parsed?.problemArea && parsed?.category) {
        return {
          type: 'goal',
          goal: parsed,
          summary: `已生成目标"${parsed.title}"。`,
        };
      }
    } catch { /* try next */ }
  }
  return null;
}

export async function chatCreateGoal(messages: ChatMessage[]): Promise<CreateGoalChatResponse> {
  const fullMessages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const result = await aiClient.chat(fullMessages, { temperature: 0.6, maxTokens: 4096 });
  const trimmed = result.trim();
  return tryParseGoal(trimmed) ?? { type: 'message', content: trimmed };
}
