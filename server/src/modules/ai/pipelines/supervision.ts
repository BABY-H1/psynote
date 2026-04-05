import { aiClient } from '../providers/openai-compatible.js';

interface SupervisionContext {
  treatmentPlan?: { goals: { description: string; status: string }[]; approach?: string };
  clientProfile?: {
    chiefComplaint?: string;
    name?: string;
    age?: number;
    gender?: string;
    presentingIssues?: string[];
  };
  sessionHistory?: string;
  assessmentSummary?: string;
}

/**
 * AI supervision conversation.
 * Helps counselors reflect on their clinical work through Socratic questioning.
 */
export async function supervisionChat(
  messages: { role: string; content: string }[],
  context: SupervisionContext,
): Promise<{ type: 'message'; content: string }> {
  const cp = context.clientProfile;
  const contextParts: string[] = [];

  // Client demographics
  const demographics: string[] = [];
  if (cp?.name) demographics.push(cp.name);
  if (cp?.gender) demographics.push(cp.gender === 'male' ? '男' : cp.gender === 'female' ? '女' : cp.gender);
  if (cp?.age) demographics.push(`${cp.age}岁`);
  if (demographics.length) contextParts.push(`来访者: ${demographics.join('，')}`);

  if (cp?.chiefComplaint) contextParts.push(`主诉: ${cp.chiefComplaint}`);
  if (cp?.presentingIssues?.length) contextParts.push(`现有问题: ${cp.presentingIssues.join('、')}`);

  if (context.assessmentSummary) {
    contextParts.push(`评估数据:\n${context.assessmentSummary}`);
  }
  if (context.sessionHistory) {
    contextParts.push(`会谈历史:\n${context.sessionHistory}`);
  }
  if (context.treatmentPlan) {
    const goals = context.treatmentPlan.goals.map((g) => `- ${g.description} (${g.status})`).join('\n');
    contextParts.push(`治疗计划:\n取向: ${context.treatmentPlan.approach || '未指定'}\n${goals}`);
  } else {
    contextParts.push('治疗计划: 尚未制定（可引导咨询师思考治疗方向和目标）');
  }

  const systemPrompt = `你是一位资深的心理咨询督导师，正在和咨询师进行个别督导。

督导风格：
- 使用苏格拉底式提问，引导咨询师自己发现问题和答案
- 一次只问一个问题，不要连续抛出多个问题
- 关注咨询师的感受和反移情
- 帮助咨询师看到盲点但不直接给答案
- 在适当时候提供理论框架作为参考
- 注意伦理和边界问题
- 如果发现风险信号，要明确提醒

可参考的督导维度：
1. 咨询关系（工作联盟质量）
2. 个案概念化（对来访者问题的理解深度）
3. 干预策略（所用技术是否恰当）
4. 咨询师的自我觉察（反移情、卡住的感觉）
5. 伦理考量

${contextParts.length ? `\n来访者信息:\n${contextParts.join('\n\n')}` : ''}

用温暖但专业的语气，像真正的督导对话。`;

  const chatMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  const response = await aiClient.chat(chatMessages, { temperature: 0.5 });
  return { type: 'message', content: response };
}
