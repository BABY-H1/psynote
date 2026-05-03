// One-off: probe newcoin.top model catalog + benchmark a few fast candidates.
//
// Usage: AI_API_KEY=sk-... node scripts/probe-ai-models.mjs
//
// SECURITY: Never inline an API key here. The previous version had a key
// committed at this exact line — it has been rotated. If you need to share a
// throwaway key with a teammate, do it out-of-band, not in git.
const KEY = process.env.AI_API_KEY;
const BASE = process.env.AI_BASE_URL || 'https://api.newcoin.top';

if (!KEY) {
  console.error('ERROR: AI_API_KEY env var is required.');
  console.error('Usage: AI_API_KEY=sk-... node scripts/probe-ai-models.mjs');
  process.exit(1);
}

console.log('Fetching model list...');
const r = await fetch(`${BASE}/v1/models`, { headers: { Authorization: `Bearer ${KEY}` } });
const d = await r.json();
const models = (d.data || []).map(m => m.id);
console.log('Total models:', models.length);

const candidates = models.filter(m =>
  /^(qwen-max|qwen-plus|qwen-turbo|qwen2\.5-72b|gpt-4o-mini|gpt-4\.1-mini|gpt-4o-2024|claude.*haiku|claude-3-5-sonnet|gemini-2\.0-flash|gemini-1\.5-flash|glm-4|glm-4\.5|kimi-k2-250|deepseek-v3$|deepseek-v4-flash|doubao-seed-1-6-flash|doubao-1-5-pro)/.test(m)
  && !/thinking|reasoning|preview/.test(m),
);
console.log('Candidates:', candidates.length);
candidates.forEach(m => console.log(' ', m));

// Bench the top few — short structured task
const PROMPT = '生成一份测大学生考试焦虑的简短量表 JSON, 5 题 5 点 likert 1 维度, 字段: title items[{text,reverse}] options[{label,value}]. 只返回 JSON.';

const TO_BENCH = ['qwen-plus', 'qwen-turbo', 'qwen-max', 'gpt-4o-mini', 'doubao-seed-1-6-flash-250615', 'deepseek-v3.2', 'glm-4.6', 'kimi-k2-250905']
  .filter(m => models.includes(m));

console.log('\nBenchmarking', TO_BENCH.length, 'models with same prompt...');
for (const model of TO_BENCH) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: PROMPT }],
        max_tokens: 1500,
        temperature: 0.5,
        enable_thinking: false,
      }),
      signal: AbortSignal.timeout(180_000),
    });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    if (!res.ok) {
      console.log(`  ✗ ${model.padEnd(40)} ${elapsed}s  HTTP ${res.status}`);
      continue;
    }
    const j = await res.json();
    const content = j.choices?.[0]?.message?.content || '';
    const tokens = j.usage?.total_tokens ?? '?';
    const ok = content.includes('"title"') || content.includes('"items"');
    console.log(`  ${ok ? '✓' : '?'} ${model.padEnd(40)} ${elapsed}s  ${tokens} tokens  ${content.length}c  ${content.slice(0,40).replace(/\n/g,' ')}…`);
  } catch (e) {
    console.log(`  ✗ ${model.padEnd(40)} fail: ${e.message}`);
  }
}
