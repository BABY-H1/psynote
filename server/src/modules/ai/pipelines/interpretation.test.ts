import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Contract test for the assessment-interpretation pipeline.
 *
 * What this pins:
 *   1. Prompt SHAPE — system prompt must carry the "不要做诊断性陈述"
 *      safety instruction; user prompt must embed scale + dimension data.
 *   2. Call CONTRACT — single `generate` call, temperature ≤ 0.6 (warm
 *      tone but reined-in).
 *   3. Passthrough — whatever the AI returns is returned verbatim.
 *
 * We mock `aiClient` so the test is deterministic and never hits a live
 * LLM endpoint.
 */

const generateMock = vi.fn();
const generateJSONMock = vi.fn();

vi.mock('../providers/openai-compatible.js', () => ({
  aiClient: {
    generate: generateMock,
    generateJSON: generateJSONMock,
    isConfigured: true,
  },
}));

const { interpretResult } = await import('./interpretation.js');

beforeEach(() => {
  generateMock.mockReset();
  generateJSONMock.mockReset();
});

describe('interpretResult — prompt & call contract', () => {
  it('calls aiClient.generate exactly once and returns the model output verbatim', async () => {
    generateMock.mockResolvedValueOnce('您目前整体情绪状态稳定……');

    const output = await interpretResult({
      scaleName: 'PHQ-9',
      dimensions: [
        { name: '抑郁', score: 8, label: '轻度', riskLevel: 'level_2' },
      ],
      totalScore: 8,
      riskLevel: 'level_2',
    });

    expect(output).toBe('您目前整体情绪状态稳定……');
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(generateJSONMock).not.toHaveBeenCalled();
  });

  it("system prompt pins the anti-diagnostic safety rail (心理咨询 AI 禁区)", async () => {
    generateMock.mockResolvedValueOnce('x');

    await interpretResult({
      scaleName: 'PHQ-9',
      dimensions: [{ name: '抑郁', score: 3, label: '最小' }],
      totalScore: 3,
    });

    const [systemPrompt] = generateMock.mock.calls[0];
    // These phrases are the load-bearing part of the contract — they keep
    // the model out of diagnostic-language territory.
    expect(systemPrompt).toMatch(/不要做诊断性陈述/);
    expect(systemPrompt).toMatch(/可能|倾向于/);
  });

  it('user prompt embeds scale name, total score, and every dimension', async () => {
    generateMock.mockResolvedValueOnce('x');

    await interpretResult({
      scaleName: 'SCL-90',
      dimensions: [
        { name: '焦虑', score: 22, label: '中度', riskLevel: 'level_3' },
        { name: '躯体化', score: 15, label: '轻度' },
      ],
      totalScore: 37,
      riskLevel: 'level_3',
    });

    const [, userPrompt] = generateMock.mock.calls[0];
    expect(userPrompt).toContain('SCL-90');
    expect(userPrompt).toContain('37');
    expect(userPrompt).toContain('焦虑');
    expect(userPrompt).toContain('22');
    expect(userPrompt).toContain('躯体化');
    expect(userPrompt).toContain('15');
  });

  it('uses a warm-but-reined-in temperature (≤ 0.6) so output stays clinical', async () => {
    generateMock.mockResolvedValueOnce('x');

    await interpretResult({
      scaleName: 'PHQ-9',
      dimensions: [{ name: '抑郁', score: 3, label: '最小' }],
      totalScore: 3,
    });

    const opts = generateMock.mock.calls[0][2] as { temperature?: number } | undefined;
    expect(opts?.temperature).toBeLessThanOrEqual(0.6);
  });
});
