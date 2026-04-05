import { aiClient } from '../providers/openai-compatible.js';

interface SimulatedClientContext {
  clientProfile?: {
    chiefComplaint?: string;
    presentingIssues?: string[];
    name?: string;
    age?: number;
    gender?: string;
    occupation?: string;
    education?: string;
    familyBackground?: string;
  };
  sessionHistory?: string;
  scenarioNotes?: string;
}

/**
 * Simulated client conversation for counselor training.
 * AI plays the role of a client based on the real case profile.
 */
export async function simulatedClientChat(
  messages: { role: string; content: string }[],
  context: SimulatedClientContext,
): Promise<{ type: 'message'; content: string }> {
  const cp = context.clientProfile;
  const contextParts: string[] = [];

  // Basic demographics for character building
  const demographics: string[] = [];
  if (cp?.name) demographics.push(cp.name);
  if (cp?.gender) demographics.push(cp.gender === 'male' ? '男' : cp.gender === 'female' ? '女' : cp.gender);
  if (cp?.age) demographics.push(`${cp.age}岁`);
  if (cp?.occupation) demographics.push(`职业: ${cp.occupation}`);
  if (cp?.education) demographics.push(`学历: ${cp.education}`);
  if (demographics.length) contextParts.push(`基本信息: ${demographics.join('，')}`);

  if (cp?.chiefComplaint) contextParts.push(`主诉: ${cp.chiefComplaint}`);
  if (cp?.presentingIssues?.length) contextParts.push(`现有问题: ${cp.presentingIssues.join('、')}`);
  if (cp?.familyBackground) contextParts.push(`家庭背景: ${cp.familyBackground}`);
  if (context.sessionHistory) contextParts.push(`之前的咨询经过:\n${context.sessionHistory}`);
  if (context.scenarioNotes) contextParts.push(`场景说明: ${context.scenarioNotes}`);

  const systemPrompt = `你正在扮演一位心理咨询的来访者，用于帮助咨询师练习咨询技巧。

角色设定：
${contextParts.join('\n') || '一位有焦虑困扰的来访者'}

表演要求：
- 你就是这个来访者本人，用TA的身份、语气和经历来回应
- 回复简短自然（1-3句话为主），像真人对话
- 展现适当的防御、犹豫、沉默（用"......"表示）
- 如果咨询师的提问太直接或不恰当，表现出自然的不适
- 回应要符合来访者的年龄、身份和背景（比如学生用学生的语言方式）
- 偶尔主动提起新话题或联想，与你的背景经历相关
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
