import { aiClient } from '../providers/openai-compatible.js';

/**
 * Shape mirrors `treatment_goal_library` columns + the enum values used
 * in the org-side UI. Kept minimal on purpose — the AI output feeds
 * straight into a createGoal call.
 */
interface ExtractedGoal {
  title: string;
  description: string;
  problemArea: 'anxiety' | 'depression' | 'relationship' | 'trauma'
    | 'self_esteem' | 'grief' | 'anger' | 'substance'
    | 'academic' | 'career' | 'family' | 'other';
  category: 'short_term' | 'long_term';
  objectivesTemplate: string[];
  interventionSuggestions: string[];
}

/**
 * Extracts a structured treatment-goal record from raw text. Typical inputs:
 * a paragraph lifted from a textbook, a bullet list copied from a clinical
 * workbook, or a free-form description a counselor typed themselves.
 */
export async function extractGoal(input: { content: string }): Promise<ExtractedGoal> {
  const systemPrompt = `你是一位专业的循证心理治疗师。你的任务是从用户提供的文本中提取一个结构化的治疗目标模板。

规则：
1. 提取目标的标题、简短描述、问题领域、短期/长期类别。
2. "参考目标"是可测量、可验证的具体子目标（如"每周焦虑发作次数减少50%"）。
3. "建议干预"是具体的治疗技术/练习（如"认知重构训练"、"渐进式肌肉放松"）。
4. 如果原文不是中文，翻译为中文。
5. 不要在任何字段中使用Markdown格式，只使用纯文本。
6. problemArea 必须是以下之一：anxiety（焦虑）、depression（抑郁）、relationship（人际关系）、trauma（创伤）、self_esteem（自尊）、grief（丧失/悲伤）、anger（情绪管理）、substance（成瘾）、academic（学业）、career（职业）、family（家庭）、other（其他）。
7. category 必须是 short_term（短期）或 long_term（长期）其中之一。

返回如下JSON结构：
{
  "title": "目标名称",
  "description": "简要描述",
  "problemArea": "anxiety",
  "category": "short_term",
  "objectivesTemplate": ["具体可测量的子目标 1", "具体可测量的子目标 2"],
  "interventionSuggestions": ["具体干预技术 1", "具体干预技术 2"]
}`;

  return aiClient.generateJSON<ExtractedGoal>(
    systemPrompt,
    `请从以下内容中提取治疗目标结构：\n\n${input.content}`,
    { temperature: 0.2 },
  );
}
