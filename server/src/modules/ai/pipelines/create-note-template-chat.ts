import { aiClient } from '../providers/openai-compatible.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface NoteTemplate {
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

export type CreateNoteTemplateChatResponse =
  | { type: 'message'; content: string }
  | { type: 'template'; template: NoteTemplate; summary: string };

const SYSTEM_PROMPT = `你是一位资深临床文档编制专家。你的任务是通过与用户对话，了解其会谈记录需求，最终生成一份完整、专业的会谈记录模板。

## 对话流程

你需要通过友好、专业的对话逐步了解以下信息：
1. **记录用途/场景**：这个模板用于什么类型的会谈？（如个体咨询、团体治疗、初次评估、随访等）
2. **期望的分区/字段**：需要记录哪些内容？（如来访者表现、干预方法、评估、计划等）
3. **字段要求**：哪些字段是必填的？是否需要特定格式的字段？
4. **特殊需求**：是否有其他特殊要求？（如风险评估字段、药物记录、作业布置等）

## 对话策略
- 每次只问1-2个问题，不要一次性问太多
- 根据用户的回答灵活调整后续问题
- 如果用户提到SOAP、DAP、BIRP等标准格式，直接基于该格式生成，适当询问是否需要额外字段
- 如果用户给出了充分信息，可以跳过不必要的问题
- 当你觉得信息足够时，主动告诉用户你将开始生成模板

## 输出规则

在对话过程中，你的回复就是普通文本消息。

当你收集到足够信息准备生成模板时，你必须以以下 JSON 格式返回（不要有其他文本）：

\`\`\`json
{
  "type": "template",
  "summary": "对生成模板的简要说明",
  "template": {
    "title": "模板名称",
    "format": "soap | dap | birp | custom",
    "fieldDefinitions": [
      {
        "key": "字段键名（英文小写+下划线）",
        "label": "字段标签",
        "placeholder": "请输入相关内容的提示文字",
        "required": true,
        "order": 1
      }
    ]
  }
}
\`\`\`

## 模板编制原则
- 字段键名使用英文小写加下划线命名（如 subjective_report、intervention_method）
- 字段标签和占位提示使用中文
- 占位提示要具体、有指导性，帮助咨询师知道该写什么
- 必填字段应包含会谈记录的核心内容
- 选填字段可用于补充信息
- order从1开始递增
- format根据模板风格选择：soap、dap、birp或custom
- 不要在任何字段中使用Markdown格式（如**粗体**），只使用纯文本`;

/**
 * Multi-turn conversation for AI-guided note template creation.
 * Returns either a follow-up message or a complete template structure.
 */
export async function chatCreateNoteTemplate(
  messages: ChatMessage[],
): Promise<CreateNoteTemplateChatResponse> {
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

  // Check if the response is a JSON template result
  let jsonStr = trimmed;
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed.type === 'template' && parsed.template) {
      return {
        type: 'template',
        template: parsed.template,
        summary: parsed.summary || '',
      };
    }
  } catch {
    // Not JSON — treat as regular message
  }

  return { type: 'message', content: trimmed };
}
