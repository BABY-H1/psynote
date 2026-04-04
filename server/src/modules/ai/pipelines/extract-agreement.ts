import { aiClient } from '../providers/openai-compatible.js';

interface ExtractedAgreement {
  title: string;
  consentType: 'treatment' | 'data_collection' | 'ai_processing' | 'data_sharing' | 'research';
  content: string;
  sections: { heading: string; body: string }[];
}

/**
 * Extracts a structured agreement template from raw text input.
 * Note: file/image input needs to be converted to text before calling this
 * (e.g. via OCR or base64 description), since the OpenAI-compatible API
 * uses text-only chat completions.
 */
export async function extractAgreement(input: { content: string }): Promise<ExtractedAgreement> {
  const systemPrompt = `你是一位专业的心理咨询法律/合规专家。你的任务是从用户提供的文本中提取一个结构化的知情同意书/协议模板。

规则：
1. 提取协议的标题、类型、完整内容和各个章节。
2. 如果原文不是中文，翻译为中文。
3. 不要在任何字段中使用Markdown格式（如**粗体**、##标题），只使用纯文本。
4. content字段应包含完整的协议文本（经过清理和格式化）。
5. sections字段将协议拆分为逻辑章节，每个章节包含标题和正文。
6. consentType根据协议内容判断，必须是以下之一：treatment（治疗/咨询）、data_collection（数据收集）、ai_processing（AI处理）、data_sharing（数据共享）、research（研究）。

你必须返回如下JSON结构：
{
  "title": "协议名称",
  "consentType": "treatment",
  "content": "完整的协议文本内容",
  "sections": [
    {"heading": "章节标题", "body": "章节正文内容"}
  ]
}`;

  return aiClient.generateJSON<ExtractedAgreement>(
    systemPrompt,
    `请从以下内容中提取知情同意书/协议结构：\n\n${input.content}`,
    { temperature: 0.2 },
  );
}
