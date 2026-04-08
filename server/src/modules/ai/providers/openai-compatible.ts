import { env } from '../../../config/env.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  id: string;
  choices: {
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

/**
 * OpenAI-compatible API client.
 * Works with any provider that implements the OpenAI chat completions API.
 */
export class AIClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor() {
    this.apiKey = env.AI_API_KEY || '';
    this.baseUrl = env.AI_BASE_URL.replace(/\/+$/, '');
    this.defaultModel = env.AI_MODEL;
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  async chat(
    messages: ChatMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    if (!this.isConfigured) {
      throw new Error('AI provider is not configured (AI_API_KEY missing)');
    }

    const controller = new AbortController();
    // Keep this strictly under the route-level socket timeout so the AI
    // client's own abort fires first and propagates a real error up to the
    // route handler, rather than letting the socket die and leave the
    // client with an empty response body.
    const timeout = setTimeout(() => controller.abort(), 270_000); // 4.5 min

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2048,
        // Disable thinking/reasoning for models that support it (saves tokens and time)
        enable_thinking: false,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new Error(`AI API error (${response.status}): ${error}`);
    }

    const data = await response.json() as ChatCompletionResponse;
    return data.choices[0]?.message?.content || '';
  }

  /**
   * Generate text with a system prompt and user prompt.
   */
  async generate(systemPrompt: string, userPrompt: string, options?: GenerateOptions): Promise<string> {
    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], options);
  }

  /**
   * Generate structured JSON output.
   * Instructs the model to return valid JSON matching a given description.
   * Retries once with higher token limit if JSON parsing fails.
   */
  async generateJSON<T>(
    systemPrompt: string,
    userPrompt: string,
    options?: GenerateOptions,
  ): Promise<T> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `${systemPrompt}\n\n你必须以纯JSON格式返回结果，不要包含markdown代码块或任何其他文本。`,
      },
      { role: 'user', content: userPrompt },
    ];

    const chatOptions = { ...options, temperature: options?.temperature ?? 0.3 };

    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this.chat(
        messages,
        attempt === 0 ? chatOptions : { ...chatOptions, maxTokens: (chatOptions.maxTokens ?? 2048) * 2 },
      );

      let jsonStr = result.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      }

      try {
        return JSON.parse(jsonStr) as T;
      } catch {
        // Try to repair truncated JSON (common with token limits)
        const repaired = this.tryRepairJSON(jsonStr);
        if (repaired !== null) {
          return repaired as T;
        }
        // If first attempt, retry with more tokens
        if (attempt === 0) continue;
        throw new Error(`AI returned invalid JSON after retry: ${jsonStr.slice(0, 200)}...`);
      }
    }

    throw new Error('generateJSON exhausted retries');
  }

  /**
   * Attempt to repair truncated JSON by closing open brackets/braces.
   * Public so pipelines using bare `chat()` (conversational flows) can
   * salvage responses that hit the token ceiling mid-object.
   */
  tryRepairJSON(str: string): unknown | null {
    try {
      // Try as-is first
      return JSON.parse(str);
    } catch {
      // Track open brackets
      const stack: string[] = [];
      let inString = false;
      let escape = false;

      for (const ch of str) {
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{' || ch === '[') stack.push(ch);
        if (ch === '}' || ch === ']') stack.pop();
      }

      // If we're inside a string, close it
      let repaired = str;
      if (inString) repaired += '"';

      // Close open brackets in reverse
      while (stack.length > 0) {
        const open = stack.pop();
        repaired += open === '{' ? '}' : ']';
      }

      try {
        return JSON.parse(repaired);
      } catch {
        return null;
      }
    }
  }
}

// Singleton instance
export const aiClient = new AIClient();
