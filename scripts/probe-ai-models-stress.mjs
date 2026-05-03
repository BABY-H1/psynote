// Stress test: generate full scale (10 items, multi-dim, full rules) — the same
// kind of prompt that timed out under qwen3.5-plus.
//
// Usage: AI_API_KEY=sk-... node scripts/probe-ai-models-stress.mjs
//
// SECURITY: Never inline an API key here. See probe-ai-models.mjs for context.
const KEY = process.env.AI_API_KEY;
const BASE = process.env.AI_BASE_URL || 'https://api.newcoin.top';

if (!KEY) {
  console.error('ERROR: AI_API_KEY env var is required.');
  console.error('Usage: AI_API_KEY=sk-... node scripts/probe-ai-models-stress.mjs');
  process.exit(1);
}

const PROMPT = `直接生成一份完整的"大学生考试焦虑量表"JSON,要求:
- 12 个题目(含 3 个反向计分题), 5 点 likert
- 2 个维度(认知焦虑 / 生理焦虑), 各 6 题
- 每个维度 4 条 rules 覆盖 level_1 到 level_4 的分数区间
- options 5 个标签 + value
返回字段: { title, description, instructions, scoringMode, options[], items[{text,isReverseScored,dimensionIndex}], dimensions[{name,description,calculationMethod,rules[{minScore,maxScore,label,description,advice,riskLevel}]}] }
仅返回 JSON, 不要 markdown 包裹.`;

const MODELS = [
  'doubao-seed-1-6-flash-250615',
  'deepseek-v3.2',
  'doubao-1-5-pro-256k',
  'qwen3.5-plus', // current default
];

console.log('Stress test: full scale generation\n');
for (const model of MODELS) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: PROMPT }],
        max_tokens: 4096,
        temperature: 0.5,
        enable_thinking: false,
      }),
      signal: AbortSignal.timeout(540_000),
    });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    if (!res.ok) { console.log(`  ✗ ${model.padEnd(35)} ${elapsed}s  HTTP ${res.status}`); continue; }
    const j = await res.json();
    const content = j.choices?.[0]?.message?.content || '';
    const tokens = j.usage?.total_tokens ?? '?';
    let stripped = content.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    let parsed;
    try { parsed = JSON.parse(stripped); } catch { parsed = null; }
    if (!parsed) {
      console.log(`  ? ${model.padEnd(35)} ${elapsed}s  ${tokens} tk  parse fail`);
      continue;
    }
    const items = parsed.items?.length ?? 0;
    const dims = parsed.dimensions?.length ?? 0;
    const rules = parsed.dimensions?.reduce((s, d) => s + (d.rules?.length ?? 0), 0) ?? 0;
    console.log(`  ✓ ${model.padEnd(35)} ${elapsed}s  ${tokens} tk  items=${items} dims=${dims} rules=${rules} title="${parsed.title}"`);
  } catch (e) {
    console.log(`  ✗ ${model.padEnd(35)} fail: ${e.message}`);
  }
}
