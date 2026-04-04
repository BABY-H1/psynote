import { aiClient } from '../providers/openai-compatible.js';

interface SimulatedClientContext {
  clientProfile?: {
    chiefComplaint?: string;
    presentingIssues?: string[];
    riskLevel?: string;
  };
  sessionHistory?: string; // summary of previous sessions
  scenarioNotes?: string; // counselor's custom scenario instructions
}

/**
 * Simulated client conversation for counselor training.
 * AI plays the role of a client based on the real case profile.
 */
export async function simulatedClientChat(
  messages: { role: string; content: string }[],
  context: SimulatedClientContext,
): Promise<{ type: 'message'; content: string }> {
  const contextParts: string[] = [];
  if (context.clientProfile?.chiefComplaint) {
    contextParts.push(`主诉: ${context.clientProfile.chiefComplaint}`);
  }
  if (context.clientProfile?.presentingIssues?.length) {
    contextParts.push(`问题: ${context.clientProfile.presentingIssues.join('、')}`);
  }
  if (context.sessionHistory) {
    contextParts.push(`之前的咨询经过: ${context.sessionHistory}`);
  }
  if (context.scenarioNotes) {
    contextParts.push(`场景说明: ${context.scenarioNotes}`);
  }

  const systemPrompt = `你正在扮演一位心理咨询的来访者，用于帮助咨询师练习咨询技巧。

角色设定：
${contextParts.join('\n') || '一位有焦虑困扰的来访者'}

表演要求：
- 像真实来访者一样回应，不要过于配合或戏剧化
- 回复简短自然（1-3句话为主），像真人对话
- 展现适当的防御、犹豫、沉默（用"......"表示）
- 如果咨询师的提问太直接或不恰当，表现出自然的不适
- 偶尔主动提起新话题或联想
- 不要跳出角色，不要给咨询建议
- 用第一人称`;

  const chatMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  const response = await aiClient.chat(chatMessages, { temperature: 0.7 });
  return { type: 'message', content: response };
}
