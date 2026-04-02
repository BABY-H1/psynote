import { aiClient } from '../providers/openai-compatible.js';

interface SOAPFromMaterial {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  summary: string;
  tags: string[];
}

/**
 * Analyzes raw session material (text) and produces a structured SOAP note.
 * Replicates old analyzeSessionMaterial() for text input.
 *
 * Note: The old version supported audio and image via Gemini multimodal API.
 * For OpenAI-compatible providers, audio/image must be transcribed to text first
 * before passing here. A future enhancement could add a transcription step
 * (e.g. Whisper API for audio, vision model for images).
 */
export async function analyzeSessionMaterial(input: {
  content: string;
  inputType?: 'text' | 'transcribed_audio' | 'transcribed_image';
}): Promise<SOAPFromMaterial> {
  const contextHint =
    input.inputType === 'transcribed_audio'
      ? '以下是咨询录音的转录文本。'
      : input.inputType === 'transcribed_image'
        ? '以下是手写咨询笔记的OCR识别文本。'
        : '以下是咨询会谈的原始记录。';

  const systemPrompt = `你是一位经验丰富的临床督导师。你的任务是分析提供的咨询会谈原始素材，并将其结构化为标准的SOAP记录格式。

请严格输出JSON对象。

输出格式要求：JSON字段值必须是纯文本，不要使用Markdown格式（如**粗体**、*斜体*）。

输出字段：
- subjective: 来访者的主要陈述、感受和表达
- objective: 观察到的行为、外表和客观事实
- assessment: 临床印象、主客观信息综合分析、诊断/进展评估
- plan: 后续步骤、作业、干预计划
- summary: 1-2句话的简要总结
- tags: 3-5个关键词标签

语言：专业中文。`;

  return aiClient.generateJSON<SOAPFromMaterial>(
    systemPrompt,
    `${contextHint}\n\n${input.content}`,
    { temperature: 0.4, maxTokens: 2048 },
  );
}
