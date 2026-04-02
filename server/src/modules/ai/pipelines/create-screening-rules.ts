import { aiClient } from '../providers/openai-compatible.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ScreeningCondition {
  id: string;
  type: 'total_score' | 'dimension_score' | 'item_value' | 'risk_level';
  operator: string;
  targetId?: string;
  targetLabel?: string;
  value: number | string;
  flag: string;
  flagLabel?: string;
}

interface ScreeningRules {
  enabled: boolean;
  conditions: ScreeningCondition[];
  logic: 'AND' | 'OR';
}

type ChatResult =
  | { type: 'message'; content: string }
  | { type: 'rules'; summary: string; rules: ScreeningRules };

/**
 * AI-guided screening rules configuration via multi-turn conversation.
 * The AI acts as a psychometrics expert to help configure screening thresholds,
 * item-level triggers, and multi-condition combinations.
 */
export async function chatConfigureScreeningRules(
  messages: ChatMessage[],
  context: {
    assessmentType: string;
    scales: {
      id: string;
      title: string;
      dimensions: { id: string; name: string; rules?: { minScore: number; maxScore: number; label: string; riskLevel?: string }[] }[];
      items: { id: string; text: string; options: { label: string; value: number }[] }[];
    }[];
  },
): Promise<ChatResult> {
  const scaleInfo = context.scales.map((s) => {
    const dimInfo = s.dimensions.map((d) => {
      const rulesInfo = d.rules?.map((r) => `  ${r.minScore}~${r.maxScore}: ${r.label}${r.riskLevel ? ` (${r.riskLevel})` : ''}`).join('\n') || '  无规则';
      return `  维度: ${d.name} (id: ${d.id})\n${rulesInfo}`;
    }).join('\n');
    const itemSample = s.items.slice(0, 3).map((it) => `  - ${it.text} (id: ${it.id})`).join('\n');
    return `量表: ${s.title} (id: ${s.id})\n${dimInfo}\n  题目样例:\n${itemSample}\n  共 ${s.items.length} 题`;
  }).join('\n\n');

  const typeLabel = context.assessmentType === 'screening' ? '心理筛查' : '入组筛选';
  const typeGoal = context.assessmentType === 'screening'
    ? '识别高风险个体，确定需要关注或干预的人群'
    : '判断是否符合入组/参与条件（通过/不通过）';

  const systemPrompt = `你是一位专业的心理测量学家，正在帮助用户为「${typeLabel}」配置筛查规则。

目标：${typeGoal}

可用的量表信息：
${scaleInfo}

你需要通过对话了解用户的筛查需求，然后生成结构化的筛查规则。

支持的条件类型：
1. total_score — 总分阈值（如总分>=15标记为高风险）
2. dimension_score — 维度分阈值（如抑郁维度>=10标记为关注）
3. item_value — 特定题目触发（如第9题>=2立即标记为危机）
4. risk_level — 基于量表自带的风险等级

支持的标记（flag）：
- high_risk（高风险）、moderate_risk（中等风险）、attention（需关注）
- pass（通过）、fail（不通过）— 用于入组筛选

条件之间支持 AND（所有条件满足）或 OR（任一条件满足）逻辑。

对话策略：
1. 先了解用户的筛查目标和关注点
2. 基于量表信息推荐合理的阈值
3. 确认后生成完整规则

当你认为信息足够可以生成规则时，回复一个JSON对象，格式如下（不要包含markdown）：
{"type":"rules","summary":"规则描述","rules":{"enabled":true,"conditions":[...],"logic":"OR"}}

如果还需要继续对话，回复普通文本：
{"type":"message","content":"你的问题或建议"}`;

  const chatMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  const response = await aiClient.chat(chatMessages, { temperature: 0.4, maxTokens: 3000 });

  let cleaned = response.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.type === 'rules' && parsed.rules) {
      return { type: 'rules', summary: parsed.summary || '', rules: parsed.rules };
    }
    if (parsed.type === 'message' && parsed.content) {
      return { type: 'message', content: parsed.content };
    }
  } catch {
    // Not JSON — treat as plain message
  }

  return { type: 'message', content: cleaned };
}
