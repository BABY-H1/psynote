import { aiClient } from '../providers/openai-compatible.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface GeneratedAgreement {
  title: string;
  consentType: 'treatment' | 'data_collection' | 'ai_processing' | 'data_sharing' | 'research';
  content: string;
}

export type CreateAgreementChatResponse =
  | { type: 'message'; content: string }
  | { type: 'agreement'; agreement: GeneratedAgreement; summary: string };

const SYSTEM_PROMPT = `你是一位专业的心理咨询服务协议撰写专家。你的任务是通过与用户对话，了解其需求，最终生成一份完整、专业的知情同意书/协议。

## 对话流程

你需要通过友好、专业的对话逐步了解以下信息：
1. **协议类型**：需要什么类型的协议？（如咨询知情同意书、数据收集同意书、AI辅助处理同意书、数据共享协议、研究参与同意书）
2. **目标受众**：协议面向谁？（如成人来访者、未成年人家长、团体咨询参与者等）
3. **关键条款**：需要包含哪些关键条款？（如保密例外、费用说明、取消政策等）
4. **隐私要求**：有哪些特殊的隐私保护要求？（如数据存储、第三方共享限制等）
5. **特殊条款**：是否有其他特殊需求或条款？（如紧急联系方式、投诉途径等）

## 对话策略
- 每次只问1-2个问题，不要一次性问太多
- 根据用户的回答灵活调整后续问题
- 如果用户给出了充分信息，可以跳过不必要的问题
- 当你觉得信息足够时，主动告诉用户你将开始生成协议

## 输出规则

在对话过程中，你的回复就是普通文本消息。

当你收集到足够信息准备生成协议时，你必须以以下 JSON 格式返回（不要有其他文本）：

\`\`\`json
{
  "type": "agreement",
  "summary": "对生成协议的简要说明",
  "agreement": {
    "title": "协议名称",
    "consentType": "treatment",
    "content": "完整的协议正文内容，包含所有条款和章节"
  }
}
\`\`\`

## consentType 取值
- treatment：咨询/治疗知情同意书
- data_collection：数据收集同意书
- ai_processing：AI辅助处理同意书
- data_sharing：数据共享协议
- research：研究参与同意书

## 协议撰写原则
- 语言清晰、通俗易懂，避免过度使用法律术语
- 条款结构清晰，逻辑分明
- 充分保障来访者/参与者的知情权
- 符合心理咨询行业伦理规范
- 包含必要的法律声明和免责条款
- content字段中使用换行符分隔各个章节和条款
- 不要在任何字段中使用Markdown格式（如**粗体**），只使用纯文本`;

/**
 * Multi-turn conversation for AI-guided agreement creation.
 * Returns either a follow-up message or a complete agreement structure.
 */
export async function chatCreateAgreement(
  messages: ChatMessage[],
): Promise<CreateAgreementChatResponse> {
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

  // Try multiple strategies to extract JSON from the response
  const jsonCandidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/s, '').replace(/\s*```\s*$/s, ''),
    (() => { const m = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/); return m ? m[1] : null; })(),
    (() => {
      const s = trimmed.indexOf('{');
      if (s === -1) return null;
      let d = 0;
      for (let i = s; i < trimmed.length; i++) { if (trimmed[i] === '{') d++; if (trimmed[i] === '}') d--; if (d === 0) return trimmed.slice(s, i + 1); }
      return null;
    })(),
  ];

  for (const candidate of jsonCandidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed.type === 'agreement' && parsed.agreement) {
        return { type: 'agreement', agreement: parsed.agreement, summary: parsed.summary || '' };
      }
      if (parsed.title && parsed.consentType && parsed.content) {
        return { type: 'agreement', agreement: parsed, summary: `已生成协议"${parsed.title}"。` };
      }
    } catch { /* try next */ }
  }

  return { type: 'message', content: trimmed };
}
