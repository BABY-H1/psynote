import { aiClient } from '../providers/openai-compatible.js';

interface ExtractedScale {
  title: string;
  description: string;
  instructions: string;
  scoringMode: 'sum' | 'average';
  options: { label: string; value: number }[];
  items: { text: string; isReverseScored: boolean; dimensionIndex: number | null }[];
  dimensions: { name: string; description: string; calculationMethod: 'sum' | 'average' }[];
}

/**
 * Extracts a structured psychological scale from raw text input.
 * Replicates the old extractScaleFromInput() function.
 * Note: file/image input needs to be converted to text before calling this
 * (e.g. via OCR or base64 description), since the OpenAI-compatible API
 * uses text-only chat completions.
 */
export async function extractScale(input: { content: string }): Promise<ExtractedScale> {
  const systemPrompt = `你是一位专业的心理测量学家。你的任务是从用户提供的文本中提取一个结构化的心理量表。

规则：
1. 提取所有题目、推断选项（如没有明确给出则使用标准Likert量表）和维度。
2. 如果原文不是中文，翻译为中文。
3. 不要在任何字段中使用Markdown格式（如**粗体**、##标题），只使用纯文本。
4. 如果原文只包含题目文本没有维度信息，将dimensionIndex设为null。
5. isReverseScored应根据题目语义判断（负面表述的题目通常是反向计分）。

你必须返回如下JSON结构：
{
  "title": "量表名称",
  "description": "简要描述",
  "instructions": "指导语",
  "scoringMode": "sum" 或 "average",
  "options": [{"label": "完全不符合", "value": 1}, ...],
  "items": [
    {"text": "题目文本", "isReverseScored": false, "dimensionIndex": 0}
  ],
  "dimensions": [
    {"name": "维度名称", "description": "描述", "calculationMethod": "sum"}
  ]
}`;

  return aiClient.generateJSON<ExtractedScale>(
    systemPrompt,
    `请从以下内容中提取心理量表结构：\n\n${input.content}`,
    { temperature: 0.2 },
  );
}
