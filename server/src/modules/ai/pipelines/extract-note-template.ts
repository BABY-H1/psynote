import { aiClient } from '../providers/openai-compatible.js';

interface ExtractedNoteTemplate {
  title: string;
  format: 'soap' | 'dap' | 'birp' | 'custom';
  fieldDefinitions: {
    key: string;
    label: string;
    placeholder: string;
    required: boolean;
    order: number;
  }[];
}

/**
 * Extracts a structured session note template from raw text input.
 * Note: file/image input needs to be converted to text before calling this
 * (e.g. via OCR or base64 description), since the OpenAI-compatible API
 * uses text-only chat completions.
 */
export async function extractNoteTemplate(input: { content: string }): Promise<ExtractedNoteTemplate> {
  const systemPrompt = `你是一位专业的临床文档编制专家。你的任务是从用户提供的文本中提取一个结构化的会谈记录模板。

规则：
1. 提取所有字段定义，包括字段名、标签、占位提示和是否必填。
2. 如果原文不是中文，翻译为中文。
3. 不要在任何字段中使用Markdown格式（如**粗体**、##标题），只使用纯文本。
4. 根据文本内容判断记录格式：
   - 如果描述的是SOAP格式（主观、客观、评估、计划），设format为"soap"
   - 如果描述的是DAP格式（数据、评估、计划），设format为"dap"
   - 如果描述的是BIRP格式（行为、干预、反应、计划），设format为"birp"
   - 其他情况设format为"custom"
5. fieldDefinitions中的placeholder应为中文，提供有意义的输入提示。
6. order从1开始递增，按字段在原文中的出现顺序排列。

你必须返回如下JSON结构：
{
  "title": "模板名称",
  "format": "soap" | "dap" | "birp" | "custom",
  "fieldDefinitions": [
    {
      "key": "字段键名（英文小写+下划线）",
      "label": "字段标签",
      "placeholder": "请输入...",
      "required": true,
      "order": 1
    }
  ]
}`;

  return aiClient.generateJSON<ExtractedNoteTemplate>(
    systemPrompt,
    `请从以下内容中提取会谈记录模板结构：\n\n${input.content}`,
    { temperature: 0.2 },
  );
}
