import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Contract test for the AI-enhanced risk-detection pipeline.
 *
 * What this pins:
 *   1. Prompt CONTRACT — system prompt defines the 4-level risk taxonomy
 *      AND the exact JSON shape the model must return; user prompt carries
 *      rule-engine baseline + dimensions + (optional) chief complaint.
 *   2. Low-temperature call (risk output must be stable).
 *   3. Usage-tracking WIRING — `track.pipeline` defaults to
 *      'risk-detection' when caller omits it; track is only forwarded
 *      when orgId is known (never leaks unscoped logging rows).
 *   4. Passthrough of generateJSON's typed result.
 */

const generateJSONMock = vi.fn();
const generateMock = vi.fn();

vi.mock('../providers/openai-compatible.js', () => ({
  aiClient: {
    generateJSON: generateJSONMock,
    generate: generateMock,
    isConfigured: true,
  },
}));

const { assessRisk } = await import('./risk-detection.js');

const fakeResult = {
  riskLevel: 'level_3',
  confidence: 0.82,
  summary: '中度焦虑合并睡眠困难,需个体咨询',
  factors: ['PHQ-9=18', '主诉自述一周失眠'],
  recommendations: ['安排个体咨询', '两周后复测'],
};

beforeEach(() => {
  generateJSONMock.mockReset();
  generateMock.mockReset();
});

describe('assessRisk — prompt & call contract', () => {
  it('calls aiClient.generateJSON exactly once and returns its typed result', async () => {
    generateJSONMock.mockResolvedValueOnce(fakeResult);

    const res = await assessRisk({
      dimensions: [{ name: '抑郁', score: 18, label: '中度', riskLevel: 'level_3' }],
      totalScore: 18,
      ruleBasedRisk: 'level_3',
    });

    expect(res).toEqual(fakeResult);
    expect(generateJSONMock).toHaveBeenCalledTimes(1);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it('system prompt declares the 4-level risk taxonomy and required JSON fields', async () => {
    generateJSONMock.mockResolvedValueOnce(fakeResult);

    await assessRisk({
      dimensions: [{ name: '抑郁', score: 18, label: '中度' }],
      totalScore: 18,
      ruleBasedRisk: 'level_3',
    });

    const [systemPrompt] = generateJSONMock.mock.calls[0];
    // Taxonomy — downstream (rules engine / recommendation router) reads
    // these literals; drift would silently break routing.
    expect(systemPrompt).toMatch(/level_1/);
    expect(systemPrompt).toMatch(/level_2/);
    expect(systemPrompt).toMatch(/level_3/);
    expect(systemPrompt).toMatch(/level_4/);
    // JSON shape the caller type-asserts against
    for (const field of ['riskLevel', 'confidence', 'summary', 'factors', 'recommendations']) {
      expect(systemPrompt).toContain(field);
    }
  });

  it('user prompt includes rule-engine baseline, total score, and chief complaint when present', async () => {
    generateJSONMock.mockResolvedValueOnce(fakeResult);

    await assessRisk({
      dimensions: [{ name: '抑郁', score: 18, label: '中度' }],
      totalScore: 18,
      ruleBasedRisk: 'level_2',
      chiefComplaint: '最近一周入睡困难',
    });

    const [, userPrompt] = generateJSONMock.mock.calls[0];
    expect(userPrompt).toContain('level_2');
    expect(userPrompt).toContain('18');
    expect(userPrompt).toContain('最近一周入睡困难');
  });

  it('uses low temperature (≤ 0.3) so the risk level stays stable across retries', async () => {
    generateJSONMock.mockResolvedValueOnce(fakeResult);

    await assessRisk({
      dimensions: [{ name: '抑郁', score: 3, label: '最小' }],
      totalScore: 3,
      ruleBasedRisk: 'level_1',
    });

    const opts = generateJSONMock.mock.calls[0][2] as { temperature?: number } | undefined;
    expect(opts?.temperature).toBeLessThanOrEqual(0.3);
  });

  it("forwards usage tracking with pipeline='risk-detection' default when only orgId is supplied", async () => {
    generateJSONMock.mockResolvedValueOnce(fakeResult);

    await assessRisk(
      {
        dimensions: [{ name: '抑郁', score: 3, label: '最小' }],
        totalScore: 3,
        ruleBasedRisk: 'level_1',
      },
      { orgId: 'org-xyz' },
    );

    const opts = generateJSONMock.mock.calls[0][2] as { track?: { orgId: string; pipeline: string } };
    expect(opts.track).toEqual({ orgId: 'org-xyz', userId: undefined, pipeline: 'risk-detection' });
  });

  it('does NOT forward track when orgId is missing (no unscoped ai_call_logs rows)', async () => {
    generateJSONMock.mockResolvedValueOnce(fakeResult);

    await assessRisk({
      dimensions: [{ name: '抑郁', score: 3, label: '最小' }],
      totalScore: 3,
      ruleBasedRisk: 'level_1',
    });

    const opts = generateJSONMock.mock.calls[0][2] as { track?: unknown };
    expect(opts.track).toBeUndefined();
  });
});
