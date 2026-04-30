#!/usr/bin/env node
// Alpha AI E2E walkthrough — exercises a representative subset of /api/orgs/:orgId/ai/*
// endpoints with real LLM calls. Designed to surface:
//   - misconfig (missing API key, bad base URL, wrong model)
//   - schema drift (request/response shape changes)
//   - JSON parsing bugs (provider returns non-JSON when generateJSON is expected)
//   - prompt regressions (output that doesn't match expected structure)
//
// Each test sets a generous timeout (90-180s) since Qwen thinking models can take
// 30-60s to produce structured JSON. Skipped tests are noted but don't fail the run.
//
// Run: node scripts/alpha-e2e-ai-walkthrough.mjs

const BASE = process.env.BASE || 'http://localhost';
const STAMP = Date.now().toString().slice(-6);

const ANSI = {
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  gray: '\x1b[90m', reset: '\x1b[0m', bold: '\x1b[1m',
};

const bugs = [];
function bug(severity, where, msg, extra = {}) {
  bugs.push({ severity, where, msg, ...extra });
  const c = severity === 'BLOCKER' ? ANSI.red : severity === 'MAJOR' ? ANSI.yellow : ANSI.gray;
  console.log(`${c}  ✗ [${severity}] ${where} — ${msg}${ANSI.reset}`);
  if (extra.body) console.log(`${ANSI.gray}    ${JSON.stringify(extra.body).slice(0, 600)}${ANSI.reset}`);
}
function ok(msg, extra) {
  console.log(`${ANSI.green}  ✓${ANSI.reset} ${msg}${extra ? ` ${ANSI.gray}${extra}${ANSI.reset}` : ''}`);
}
function step(t) { console.log(`\n${ANSI.bold}${ANSI.blue}━━━ ${t}${ANSI.reset}`); }

async function http(method, path, { token, body, expect = 200, timeoutMs = 180_000 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const t0 = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + path, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    let json = null;
    const text = await res.text();
    try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
    const expectArr = Array.isArray(expect) ? expect : [expect];
    const elapsed = Date.now() - t0;
    if (!expectArr.includes(res.status)) {
      return { ok: false, status: res.status, body: json, elapsed };
    }
    return { ok: true, status: res.status, body: json, elapsed };
  } catch (err) {
    return { ok: false, status: 0, body: { error: String(err.message || err) }, elapsed: Date.now() - t0 };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.log(`${ANSI.bold}AI E2E walkthrough${ANSI.reset}  base=${BASE}`);

  // 1. login as system admin → create org → add counselor
  step('准备: 登录 + 建机构 + 加咨询师');
  const a = await http('POST', '/api/auth/login', {
    body: { email: 'a@test.psynote.cn', password: 'test123456' },
  });
  if (!a.ok) { bug('BLOCKER', 'A login', `${a.status}`, { body: a.body }); return summary(); }
  const aToken = a.body.accessToken;

  const t = await http('POST', '/api/admin/tenants', {
    token: aToken,
    expect: 201,
    body: {
      org: { name: `AI E2E ${STAMP}`, slug: `ai-e2e-${STAMP}` },
      subscription: { tier: 'flagship', maxSeats: 10, months: 12 },
      admin: { email: `ai-admin-${STAMP}@x.cn`, name: 'AI 管理员', password: 'test123456' },
      settings: { orgType: 'counseling' },
    },
  });
  if (!t.ok) { bug('BLOCKER', 'create tenant', `${t.status}`, { body: t.body }); return summary(); }
  const orgId = t.body.orgId;

  const counselor = { email: `ai-c-${STAMP}@x.cn`, name: 'AI 咨询师', password: 'test123456' };
  const m = await http('POST', `/api/admin/tenants/${orgId}/members`, {
    token: aToken,
    expect: 201,
    body: { ...counselor, role: 'counselor' },
  });
  if (!m.ok) { bug('BLOCKER', 'add counselor', `${m.status}`, { body: m.body }); return summary(); }

  const cl = await http('POST', '/api/auth/login', {
    body: { email: counselor.email, password: counselor.password },
  });
  if (!cl.ok) { bug('BLOCKER', 'counselor login', `${cl.status}`); return summary(); }
  const counselorToken = cl.body.accessToken;
  ok(`机构 + 咨询师 ready, orgId=${orgId.slice(0,8)}…`);

  // 2. /ai/refine — 最简单的纯文本调用
  step('1. /ai/refine  (生成式: 内容优化)');
  {
    const r = await http('POST', `/api/orgs/${orgId}/ai/refine`, {
      token: counselorToken,
      timeoutMs: 120_000,
      body: {
        content: '来访者今天比较焦虑，主诉睡不好。',
        instruction: '改写成更专业的临床描述，简洁。',
      },
    });
    if (!r.ok) bug('MAJOR', '/ai/refine', `${r.status}`, { body: r.body });
    else if (!r.body?.refined || typeof r.body.refined !== 'string') bug('MAJOR', '/ai/refine 返回结构错', '缺 refined 字符串', { body: r.body });
    else ok(`/ai/refine ${r.elapsed}ms`, `→ "${r.body.refined.slice(0, 60)}…"`);
  }

  // 3. /ai/suggest-treatment-plan — 结构化 JSON 输出
  step('2. /ai/suggest-treatment-plan  (结构化: 治疗建议)');
  {
    const r = await http('POST', `/api/orgs/${orgId}/ai/suggest-treatment-plan`, {
      token: counselorToken,
      timeoutMs: 180_000,
      body: {
        chiefComplaint: '考研失败后情绪低落, 失眠 3 周, 自我评价低',
        riskLevel: 'low',
        clientContext: { age: 24, gender: '女', presentingIssues: ['抑郁情绪', '失眠', '低自尊'] },
      },
    });
    if (!r.ok) bug('MAJOR', '/ai/suggest-treatment-plan', `${r.status}`, { body: r.body });
    else {
      const hasGoals = Array.isArray(r.body?.goals) || Array.isArray(r.body?.suggestedGoals) || Array.isArray(r.body?.treatmentGoals);
      const hasInterv = Array.isArray(r.body?.interventions) || Array.isArray(r.body?.suggestedInterventions);
      if (!hasGoals && !hasInterv) bug('MAJOR', 'treatment-plan 返回缺 goals/interventions', '', { body: r.body });
      else ok(`/ai/suggest-treatment-plan ${r.elapsed}ms`, `keys=[${Object.keys(r.body || {}).join(',')}]`);
    }
  }

  // 4. /ai/extract-goal — 从纯文本抽结构化目标
  step('3. /ai/extract-goal  (抽取: 治疗目标)');
  {
    const r = await http('POST', `/api/orgs/${orgId}/ai/extract-goal`, {
      token: counselorToken,
      timeoutMs: 90_000,
      body: {
        content: '让来访者每天 22:30 前上床, 睡前 30 分钟不看手机, 4 周后睡眠日记打分提升至少 2 分。',
      },
    });
    if (!r.ok) bug('MAJOR', '/ai/extract-goal', `${r.status}`, { body: r.body });
    else ok(`/ai/extract-goal ${r.elapsed}ms`, `keys=[${Object.keys(r.body || {}).slice(0,6).join(',')}]`);
  }

  // 5. /ai/create-goal-chat — 多轮对话式建目标
  step('4. /ai/create-goal-chat  (对话式: AI 引导建目标)');
  {
    const r = await http('POST', `/api/orgs/${orgId}/ai/create-goal-chat`, {
      token: counselorToken,
      timeoutMs: 90_000,
      body: {
        messages: [{ role: 'user', content: '我想给来访者建一个改善焦虑的目标' }],
      },
    });
    if (!r.ok) bug('MAJOR', '/ai/create-goal-chat', `${r.status}`, { body: r.body });
    else ok(`/ai/create-goal-chat ${r.elapsed}ms`, `keys=[${Object.keys(r.body || {}).slice(0,6).join(',')}]`);
  }

  // 6. /ai/note-guidance-chat — 笔记中实时引导
  step('5. /ai/note-guidance-chat  (对话式: 笔记引导)');
  {
    // 5a. 缺字段应返回 400, 不能 500
    const r400 = await http('POST', `/api/orgs/${orgId}/ai/note-guidance-chat`, {
      token: counselorToken,
      timeoutMs: 30_000,
      expect: 400,
      body: {
        messages: [{ role: 'user', content: '帮我写笔记' }],
        context: { format: 'soap' }, // 缺 fieldDefinitions
      },
    });
    if (!r400.ok) bug('MAJOR', 'note-guidance-chat 缺 fieldDefinitions 应 400', `实际 ${r400.status}`, { body: r400.body });
    else ok(`note-guidance-chat 校验缺 fieldDefinitions → 400`);

    // 5b. 完整入参应能成功
    const r = await http('POST', `/api/orgs/${orgId}/ai/note-guidance-chat`, {
      token: counselorToken,
      timeoutMs: 90_000,
      body: {
        messages: [{ role: 'user', content: '我刚结束一次咨询, 来访者说焦虑减轻了, 我该怎么写客观部分？' }],
        context: {
          format: 'soap',
          fieldDefinitions: [
            { key: 'subjective', label: '主观' },
            { key: 'objective', label: '客观' },
            { key: 'assessment', label: '评估' },
            { key: 'plan', label: '计划' },
          ],
          clientContext: {
            name: '王小明',
            age: 28,
            gender: 'male',
            chiefComplaint: '焦虑、失眠 3 周',
          },
        },
      },
    });
    if (!r.ok) bug('MAJOR', '/ai/note-guidance-chat', `${r.status}`, { body: r.body });
    else ok(`/ai/note-guidance-chat ${r.elapsed}ms`, `type=${r.body?.type}`);
  }

  // 7. /ai/simulated-client — 模拟来访者陪练
  step('6. /ai/simulated-client  (对话式: 模拟来访者)');
  {
    const r = await http('POST', `/api/orgs/${orgId}/ai/simulated-client`, {
      token: counselorToken,
      timeoutMs: 90_000,
      body: {
        messages: [{ role: 'assistant', content: '你好, 今天想聊点什么？' }, { role: 'user', content: '我最近总是失眠, 不知道怎么办' }],
        context: { presentingIssues: ['失眠', '焦虑'], age: 28, gender: '男' },
      },
    });
    if (!r.ok) bug('MAJOR', '/ai/simulated-client', `${r.status}`, { body: r.body });
    else ok(`/ai/simulated-client ${r.elapsed}ms`, `keys=[${Object.keys(r.body || {}).slice(0,6).join(',')}]`);
  }

  // 8. /ai/recommendations — 个性化推荐(Portal C 端用)
  step('7. /ai/recommendations  (生成式: 个性化推荐)');
  {
    // 7a. 缺字段应返回 400 不 500
    const r400 = await http('POST', `/api/orgs/${orgId}/ai/recommendations`, {
      token: counselorToken,
      timeoutMs: 30_000,
      expect: 400,
      body: { /* 缺 riskLevel, dimensions */ },
    });
    if (!r400.ok) bug('MAJOR', 'recommendations 缺字段应 400', `实际 ${r400.status}`, { body: r400.body });
    else ok(`recommendations 校验缺字段 → 400`);

    // 7b. 完整入参
    const r = await http('POST', `/api/orgs/${orgId}/ai/recommendations`, {
      token: counselorToken,
      timeoutMs: 90_000,
      body: {
        riskLevel: 'level_2',
        dimensions: [
          { name: '抑郁', score: 12, label: '中度' },
          { name: '焦虑', score: 9, label: '中度' },
        ],
        interventionType: 'cbt',
        availableCourses: [
          { id: 'c1', title: '正念减压 8 周', category: 'mindfulness' },
          { id: 'c2', title: '认知重构入门', category: 'cbt' },
        ],
        availableGroups: [],
      },
    });
    if (!r.ok) bug('MAJOR', '/ai/recommendations', `${r.status}`, { body: r.body });
    else {
      const hasMessage = typeof r.body?.message === 'string';
      const hasArrays = Array.isArray(r.body?.suggestedCourseIds) && Array.isArray(r.body?.selfCareAdvice);
      if (!hasMessage || !hasArrays) bug('MAJOR', 'recommendations 返回结构错', '缺 message/suggestedCourseIds/selfCareAdvice', { body: r.body });
      else ok(`/ai/recommendations ${r.elapsed}ms`, `message="${(r.body.message || '').slice(0,40)}…"`);
    }
  }

  // 9. /ai/analyze-material — 分析素材
  step('8. /ai/analyze-material  (生成式: 素材分析)');
  {
    const r = await http('POST', `/api/orgs/${orgId}/ai/analyze-material`, {
      token: counselorToken,
      timeoutMs: 120_000,
      body: {
        content: '一段关于正念呼吸的文字: 找一个安静的地方坐下, 把注意力放在呼吸上, 当走神时温和地拉回来。',
        type: 'meditation',
      },
    });
    if (!r.ok) bug('MAJOR', '/ai/analyze-material', `${r.status}`, { body: r.body });
    else ok(`/ai/analyze-material ${r.elapsed}ms`, `keys=[${Object.keys(r.body || {}).slice(0,6).join(',')}]`);
  }

  // 10. AI 配额限速 — 不写入 ai_call_logs 校验, 看一次成功后的 token 计入 (启动后看)

  return summary();
}

function summary() {
  console.log(`\n${ANSI.bold}━━━ 总结 ━━━${ANSI.reset}`);
  if (bugs.length === 0) {
    console.log(`${ANSI.green}${ANSI.bold}🎉 全部通过${ANSI.reset}`);
    return 0;
  }
  const by = { BLOCKER: 0, MAJOR: 0, MINOR: 0 };
  for (const b of bugs) by[b.severity] = (by[b.severity] || 0) + 1;
  console.log(`${ANSI.red}BLOCKER: ${by.BLOCKER}${ANSI.reset}  ${ANSI.yellow}MAJOR: ${by.MAJOR}${ANSI.reset}  MINOR: ${by.MINOR}`);
  for (const b of bugs) console.log(`  [${b.severity}] ${b.where} — ${b.msg}`);
  return by.BLOCKER > 0 ? 2 : 1;
}

main().then((c) => process.exit(c)).catch((e) => { console.error('FATAL', e); process.exit(3); });
