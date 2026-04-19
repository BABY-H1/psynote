import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Contract test for the SOAP session-note analysis pipeline.
 *
 * What this pins:
 *   1. Prompt CONTRACT — JSON schema listed in system prompt matches the
 *      SOAPAnalysis type (summary / keyThemes / progressIndicators /
 *      riskFlags / suggestedFollowUp).
 *   2. Self-harm SAFETY RAIL — system prompt explicitly instructs the
 *      model to surface self-harm / suicide content in `riskFlags`.
 *      This is a load-bearing safety property; regression here is
 *      clinically unsafe.
 *   3. Graceful handling of empty SOAP input (routing stays functional
 *      even if the counselor saves a blank draft).
 *   4. Passthrough of parsed result.
 */

const generateJSONMock = vi.fn();

vi.mock('../providers/openai-compatible.js', () => ({
  aiClient: {
    generateJSON: generateJSONMock,
    generate: vi.fn(),
    isConfigured: true,
  },
}));

const { analyzeSOAP } = await import('./soap-analysis.js');

const fakeAnalysis = {
  summary: '来访者本次咨询情绪稳定，聚焦近期工作压力',
  keyThemes: ['工作压力', '睡眠质量'],
  progressIndicators: ['主动识别触发情境'],
  riskFlags: [],
  suggestedFollowUp: '继续使用 4-7-8 呼吸技术',
};

beforeEach(() => {
  generateJSONMock.mockReset();
});

describe('analyzeSOAP — prompt & call contract', () => {
  it('calls generateJSON once and returns the parsed SOAPAnalysis verbatim', async () => {
    generateJSONMock.mockResolvedValueOnce(fakeAnalysis);

    const res = await analyzeSOAP({
      subjective: '来访者自述工作压力大',
      objective: '坐姿紧张，语速偏快',
      assessment: '职场适应困难',
      plan: '布置情绪日记',
      sessionType: '个体',
      duration: 50,
    });

    expect(res).toEqual(fakeAnalysis);
    expect(generateJSONMock).toHaveBeenCalledTimes(1);
  });

  it('system prompt declares all 5 SOAPAnalysis fields callers depend on', async () => {
    generateJSONMock.mockResolvedValueOnce(fakeAnalysis);

    await analyzeSOAP({ subjective: 'x' });

    const [systemPrompt] = generateJSONMock.mock.calls[0];
    for (const field of ['summary', 'keyThemes', 'progressIndicators', 'riskFlags', 'suggestedFollowUp']) {
      expect(systemPrompt).toContain(field);
    }
  });

  it('system prompt pins the self-harm / suicide → riskFlags safety rail', async () => {
    generateJSONMock.mockResolvedValueOnce(fakeAnalysis);

    await analyzeSOAP({ subjective: 'x' });

    const [systemPrompt] = generateJSONMock.mock.calls[0];
    // Clinical-safety invariant: the model MUST be told to surface
    // self-harm content. Regression here hides risk signals from the
    // supervisor dashboard.
    expect(systemPrompt).toMatch(/自伤|自杀/);
    expect(systemPrompt).toContain('riskFlags');
  });

  it('user prompt embeds SOAP sections with their Chinese labels when present', async () => {
    generateJSONMock.mockResolvedValueOnce(fakeAnalysis);

    await analyzeSOAP({
      subjective: '来访者自述失眠',
      assessment: '中度焦虑',
    });

    const [, userPrompt] = generateJSONMock.mock.calls[0];
    expect(userPrompt).toContain('【主观资料】');
    expect(userPrompt).toContain('来访者自述失眠');
    expect(userPrompt).toContain('【评估分析】');
    expect(userPrompt).toContain('中度焦虑');
    // Absent sections should not inject empty markers.
    expect(userPrompt).not.toContain('【客观资料】');
    expect(userPrompt).not.toContain('【计划】');
  });

  it('handles an entirely empty note without crashing (draft-save safety)', async () => {
    generateJSONMock.mockResolvedValueOnce(fakeAnalysis);

    const res = await analyzeSOAP({});

    expect(res).toEqual(fakeAnalysis);
    const [, userPrompt] = generateJSONMock.mock.calls[0];
    expect(userPrompt).toContain('（内容为空）');
  });

  it('uses low-ish temperature (≤ 0.4) so clinical summaries stay consistent', async () => {
    generateJSONMock.mockResolvedValueOnce(fakeAnalysis);

    await analyzeSOAP({ subjective: 'x' });

    const opts = generateJSONMock.mock.calls[0][2] as { temperature?: number } | undefined;
    expect(opts?.temperature).toBeLessThanOrEqual(0.4);
  });
});
