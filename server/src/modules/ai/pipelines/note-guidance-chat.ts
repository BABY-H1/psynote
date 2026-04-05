import { aiClient } from '../providers/openai-compatible.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface NoteGuidanceContext {
  format: string;
  fieldDefinitions: { key: string; label: string }[];
  clientContext?: {
    chiefComplaint?: string;
    treatmentGoals?: string[];
    previousNoteSummary?: string;
    name?: string;
    age?: number;
    gender?: string;
    presentingIssues?: string[];
  };
  currentFields?: Record<string, string>;
  attachmentTexts?: string[];
}

export type NoteGuidanceResponse =
  | { type: 'message'; content: string }
  | { type: 'suggestion'; field: string; fieldLabel: string; content: string; rationale: string }
  | { type: 'complete'; fields: Record<string, string>; summary: string };

function buildSystemPrompt(context: NoteGuidanceContext): string {
  const fieldDesc = context.fieldDefinitions
    .map((f) => `- ${f.key} (${f.label})`)
    .join('\n');

  const clientInfo: string[] = [];
  const cc = context.clientContext;
  const demographics: string[] = [];
  if (cc?.name) demographics.push(cc.name);
  if (cc?.gender) demographics.push(cc.gender === 'male' ? '男' : cc.gender === 'female' ? '女' : cc.gender);
  if (cc?.age) demographics.push(`${cc.age}岁`);
  if (demographics.length) clientInfo.push(`来访者: ${demographics.join('，')}`);
  if (cc?.chiefComplaint) clientInfo.push(`主诉: ${cc.chiefComplaint}`);
  if (cc?.presentingIssues?.length) clientInfo.push(`现有问题: ${cc.presentingIssues.join('、')}`);
  if (cc?.treatmentGoals?.length) clientInfo.push(`治疗目标: ${cc.treatmentGoals.join('、')}`);
  if (cc?.previousNoteSummary) clientInfo.push(`上次会谈概要: ${cc.previousNoteSummary}`);

  const filledFields = Object.entries(context.currentFields || {})
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k}: ${v.slice(0, 100)}...`)
    .join('\n');

  const attachments = (context.attachmentTexts || []).length > 0
    ? `\n上传的素材:\n${context.attachmentTexts!.join('\n---\n')}`
    : '';

  return `你是一位经验丰富的临床心理咨询督导。你正在协助一位咨询师完成本次会谈的 ${context.format.toUpperCase()} 笔记。

## 你的角色
你是**引导者**和**协作者**，不是代写者。你的目标是帮助咨询师：
1. 清晰地回顾和组织会谈内容
2. 做出专业的临床判断
3. 完成高质量的笔记记录

## 核心原则
- **有素材时**：从素材中提取关键信息，为每个字段生成草稿建议（type: suggestion），但必须让咨询师审阅确认
- **没有素材时**：通过提问引导咨询师思考（type: message），一次只问一个问题
- **部分已填写时**：关注空白字段，基于已有内容提出补充建议或引导问题
- **永远不要**跳过咨询师的临床判断，不要假设或编造未提及的内容
- 如果发现风险信号（自伤/自杀意念），立即提醒咨询师

## 笔记格式
${context.format.toUpperCase()} 格式，包含以下字段：
${fieldDesc}

${clientInfo.length > 0 ? `## 来访者背景\n${clientInfo.join('\n')}` : ''}
${filledFields ? `\n## 已填写字段\n${filledFields}` : ''}
${attachments}

## 响应格式
你必须以JSON格式回复，有三种类型：

1. 提问/引导（无素材或需要澄清时）:
{"type":"message","content":"你的问题或引导语"}

2. 字段建议（有足够信息时）:
{"type":"suggestion","field":"字段key","fieldLabel":"字段标签","content":"建议内容","rationale":"为什么这样写的简要说明"}

3. 全部完成（所有字段都有足够内容时）:
{"type":"complete","fields":{"key1":"内容1","key2":"内容2"...},"summary":"一句话摘要"}

注意：优先逐个字段提出 suggestion，让咨询师逐个审阅。只有在咨询师确认全部字段后才返回 complete。`;
}

export async function noteGuidanceChat(
  messages: ChatMessage[],
  context: NoteGuidanceContext,
): Promise<NoteGuidanceResponse> {
  const systemPrompt = buildSystemPrompt(context);

  const chatMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  const response = await aiClient.chat(chatMessages, { temperature: 0.4 });

  // Try to parse JSON response
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.type === 'message' || parsed.type === 'suggestion' || parsed.type === 'complete') {
        return parsed as NoteGuidanceResponse;
      }
    }
  } catch {
    // If JSON parse fails, wrap as message
  }

  // Fallback: treat as plain message
  return { type: 'message', content: response };
}
