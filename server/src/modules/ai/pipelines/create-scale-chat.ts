import { aiClient } from '../providers/openai-compatible.js';
import { extractStructuredPayload } from './chat-json-helpers.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ExtractedScale {
  title: string;
  description: string;
  instructions: string;
  scoringMode: 'sum' | 'average';
  options: { label: string; value: number }[];
  items: { text: string; isReverseScored: boolean; dimensionIndex: number | null }[];
  dimensions: {
    name: string;
    description: string;
    calculationMethod: 'sum' | 'average';
    rules: {
      minScore: number;
      maxScore: number;
      label: string;
      description: string;
      advice: string;
      riskLevel: string;
    }[];
  }[];
}

export type CreateScaleChatResponse =
  | { type: 'message'; content: string }
  | { type: 'scale'; scale: ExtractedScale; summary: string };

const SYSTEM_PROMPT = `你是一位资深心理测量学家和量表编制专家。你的任务是通过与用户对话，了解其测评需求，最终生成一份完整、专业的心理测评量表。

## 对话流程

你需要通过友好、专业的对话逐步了解以下信息：
1. **测评目标**：要测量什么心理特质/状态？（如焦虑、抑郁、自尊、学习动机等）
2. **测评对象**：目标人群是谁？（如大学生、中小学生、企业员工、来访者等）
3. **使用场景**：在什么情境下使用？（如筛查、评估、科研等）
4. **维度偏好**：是否有特定的维度/子量表需求？
5. **题目规模**：期望的题目数量范围
6. **其他要求**：选项风格、计分方式等特殊需求

## 对话策略
- 每次只问1-2个问题，不要一次性问太多
- 根据用户的回答灵活调整后续问题
- 如果用户给出了充分信息，可以跳过不必要的问题
- 当你觉得信息足够时，主动告诉用户你将开始生成量表

## 输出规则

在对话过程中，你的回复就是普通文本消息。

当你收集到足够信息准备生成量表时，你必须以以下 JSON 格式返回（不要有其他文本）：

\`\`\`json
{
  "type": "scale",
  "summary": "对生成量表的简要说明",
  "scale": {
    "title": "量表名称",
    "description": "量表描述",
    "instructions": "指导语（告诉作答者如何填写）",
    "scoringMode": "sum",
    "options": [
      {"label": "完全不符合", "value": 1},
      {"label": "比较不符合", "value": 2},
      {"label": "不确定", "value": 3},
      {"label": "比较符合", "value": 4},
      {"label": "完全符合", "value": 5}
    ],
    "items": [
      {"text": "题目文本", "isReverseScored": false, "dimensionIndex": 0}
    ],
    "dimensions": [
      {
        "name": "维度名称",
        "description": "维度描述",
        "calculationMethod": "sum",
        "rules": [
          {
            "minScore": 0,
            "maxScore": 10,
            "label": "正常",
            "description": "该维度得分在正常范围内",
            "advice": "继续保持当前状态",
            "riskLevel": "level_1"
          }
        ]
      }
    ]
  }
}
\`\`\`

## 量表编制原则
- 题目表述清晰、无歧义，避免双重否定
- 每个维度包含适量题目（通常4-8题）
- 合理设置反向计分题（约20-30%）
- 选项梯度均匀，语义明确
- 指导语要具体、友好
- 维度规则(rules)要覆盖完整的分数范围，包含各风险等级(level_1到level_4)
- riskLevel: level_1=正常, level_2=轻度/关注, level_3=中度/严重, level_4=重度/危机
- 不要在任何字段中使用Markdown格式（如**粗体**），只使用纯文本`;

/**
 * Multi-turn conversation for AI-guided scale creation.
 * Returns either a follow-up message or a complete scale structure.
 */
export async function chatCreateScale(
  messages: ChatMessage[],
): Promise<CreateScaleChatResponse> {
  const fullMessages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  const result = await aiClient.chat(fullMessages, {
    temperature: 0.6,
    maxTokens: 4096,
  });

  const trimmed = result.trim();

  // 鲁棒抽取: 模型经常在 JSON 前后写自然语言 ("好的, 我帮你生成…\n```json\n…\n```"),
  // 老的 startsWith('```') 检查直接 false 落到 JSON.parse 抛错, 整段当 message 回,
  // 前端就把整坨 JSON 贴在聊天里. extractStructuredPayload 会:
  //  1. 直接 trim 试 parse
  //  2. 剥首尾 ```json``` 围栏
  //  3. 抓任意位置的 ```json``` 块
  //  4. 找第一个平衡 {...} 块 (含截断修复)
  // 任何一种成功且通过 predicate, 就当结构化结果用.
  type ScaleEnvelope = { type: 'scale'; scale: ExtractedScale; summary?: string };
  const isScale = (v: unknown): v is ScaleEnvelope =>
    !!v && typeof v === 'object' && (v as { type?: unknown }).type === 'scale'
    && !!(v as { scale?: unknown }).scale;
  // 也兼容模型 "懒包" — 直接返回 inner scale 对象本身, 没有外层 type:'scale' 包.
  const isBareScale = (v: unknown): v is ExtractedScale =>
    !!v && typeof v === 'object'
    && Array.isArray((v as { items?: unknown }).items)
    && Array.isArray((v as { dimensions?: unknown }).dimensions)
    && typeof (v as { title?: unknown }).title === 'string';

  const envelope = extractStructuredPayload<ScaleEnvelope>(trimmed, isScale);
  if (envelope) {
    return { type: 'scale', scale: envelope.scale, summary: envelope.summary || '' };
  }
  const bare = extractStructuredPayload<ExtractedScale>(trimmed, isBareScale);
  if (bare) {
    return { type: 'scale', scale: bare, summary: '' };
  }

  return { type: 'message', content: trimmed };
}
