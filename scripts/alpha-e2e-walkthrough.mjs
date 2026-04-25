#!/usr/bin/env node
// Alpha E2E walkthrough — drives the full real-user flow via API calls and
// reports every bug encountered. Designed to run BEFORE a human tester so that
// 80% of functional bugs are caught at the API layer.
//
// Coverage:
//   1. System admin login
//   2. Create counseling org via /admin/tenants
//   3. Add 2 counselors via /admin/tenants/:id/members
//   4. Org admin login → verify org-scoped reads
//   5. Counselor login → verify协作中心 / 交付中心 / 研判分流 endpoints
//   6. Public-register a client → verify token returned
//   7. Client login → verify portal
//   8. Counselor creates episode/appointment/session-note for the client
//   9. Client sees the appointment in portal
//
// Run: node scripts/alpha-e2e-walkthrough.mjs
//
// Targets http://localhost (Caddy on host) by default. Set BASE to override.

const BASE = process.env.BASE || 'http://localhost';

// ────────────────────────────────────────────────────────────
// Util / pretty logging
// ────────────────────────────────────────────────────────────
const ANSI = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

const bugs = [];
function bug(severity, where, msg, extra = {}) {
  bugs.push({ severity, where, msg, ...extra });
  const c = severity === 'BLOCKER' ? ANSI.red : severity === 'MAJOR' ? ANSI.yellow : ANSI.gray;
  console.log(`${c}  ✗ [${severity}] ${where} — ${msg}${ANSI.reset}`);
  if (extra.body) console.log(`${ANSI.gray}    ${JSON.stringify(extra.body).slice(0, 400)}${ANSI.reset}`);
}
function ok(msg) {
  console.log(`${ANSI.green}  ✓${ANSI.reset} ${msg}`);
}
function step(title) {
  console.log(`\n${ANSI.bold}${ANSI.blue}━━━ ${title}${ANSI.reset}`);
}

async function http(method, path, { token, body, expect = 200 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
  const expectArr = Array.isArray(expect) ? expect : [expect];
  if (!expectArr.includes(res.status)) {
    return { ok: false, status: res.status, body: json, path, method };
  }
  return { ok: true, status: res.status, body: json };
}

// ────────────────────────────────────────────────────────────
// Test data
// ────────────────────────────────────────────────────────────
const STAMP = Date.now().toString().slice(-6);
const ORG_SLUG = `e2e-counseling-${STAMP}`;
const ORG_NAME = `E2E 测试咨询中心 ${STAMP}`;
const ORG_ADMIN = { email: `e2e-admin-${STAMP}@test.psynote.cn`, name: 'E2E 机构管理员', password: 'test123456' };
const COUNSELOR_1 = { email: `e2e-c1-${STAMP}@test.psynote.cn`, name: '咨询师 张一', password: 'test123456' };
const COUNSELOR_2 = { email: `e2e-c2-${STAMP}@test.psynote.cn`, name: '咨询师 李二', password: 'test123456' };
const CLIENT_1 = { email: `e2e-client-${STAMP}@test.psynote.cn`, name: '来访者 王小明', password: 'test123456', phone: '13800000000' };

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────
async function main() {
  console.log(`${ANSI.bold}Alpha E2E walkthrough${ANSI.reset}  base=${BASE}  stamp=${STAMP}`);

  // ─── 1. System admin login ──────────────────────────────────
  step('1. 系统管理员 A 登录');
  let aToken = null;
  {
    const r = await http('POST', '/api/auth/login', {
      body: { email: 'a@test.psynote.cn', password: 'test123456' },
    });
    if (!r.ok) {
      bug('BLOCKER', 'POST /api/auth/login (A)', `登录失败 ${r.status}`, { body: r.body });
      return summary();
    }
    if (!r.body?.user?.isSystemAdmin) {
      bug('MAJOR', 'POST /api/auth/login (A)', 'A 应该是 isSystemAdmin=true', { body: r.body });
    } else {
      ok(`A 登录成功; isSystemAdmin=true; userId=${r.body.user.id}`);
    }
    aToken = r.body?.accessToken;
    if (!aToken) bug('BLOCKER', 'login response', '没有 accessToken', { body: r.body });
  }
  if (!aToken) return summary();

  // ─── 2. Create counseling tenant ────────────────────────────
  step('2. 创建 counseling 机构 + 机构 admin');
  let orgId = null;
  {
    const r = await http('POST', '/api/admin/tenants', {
      token: aToken,
      expect: 201,
      body: {
        org: { name: ORG_NAME, slug: ORG_SLUG },
        subscription: { tier: 'starter', maxSeats: 10, months: 12 },
        admin: ORG_ADMIN,
        settings: { orgType: 'counseling' },
      },
    });
    if (!r.ok) {
      bug('BLOCKER', 'POST /api/admin/tenants', `创建机构失败 ${r.status}`, { body: r.body });
      return summary();
    }
    orgId = r.body.orgId;
    ok(`机构创建成功 orgId=${orgId} slug=${ORG_SLUG}`);
  }

  // ─── 3. Add 2 counselors ────────────────────────────────────
  step('3. 添加 2 个咨询师');
  for (const c of [COUNSELOR_1, COUNSELOR_2]) {
    const r = await http('POST', `/api/admin/tenants/${orgId}/members`, {
      token: aToken,
      expect: 201,
      body: { ...c, role: 'counselor' },
    });
    if (!r.ok) {
      bug('BLOCKER', `POST /tenants/${orgId}/members`, `添加 ${c.name} 失败 ${r.status}`, { body: r.body });
    } else {
      ok(`添加 ${c.name} (${c.email})`);
    }
  }

  // ─── 4. Verify tenant detail returns members ────────────────
  step('4. 校验 GET /admin/tenants/:id 返回成员列表');
  {
    const r = await http('GET', `/api/admin/tenants/${orgId}`, { token: aToken });
    if (!r.ok) {
      bug('MAJOR', `GET /admin/tenants/${orgId}`, `读取失败 ${r.status}`, { body: r.body });
    } else {
      const memberCount = r.body.members?.length || 0;
      if (memberCount !== 3) {
        bug('MAJOR', 'tenant detail', `期望 3 个成员(1 admin + 2 counselor), 实际 ${memberCount}`, { body: r.body.members });
      } else {
        ok(`tenant detail 包含 ${memberCount} 个成员`);
      }
    }
  }

  // ─── 5. Org admin login & access org ────────────────────────
  step('5. 机构 admin 登录 + 访问 org-scoped 数据');
  let orgAdminToken = null;
  {
    const r = await http('POST', '/api/auth/login', {
      body: { email: ORG_ADMIN.email, password: ORG_ADMIN.password },
    });
    if (!r.ok) {
      bug('BLOCKER', 'org admin login', `登录失败 ${r.status}`, { body: r.body });
    } else {
      orgAdminToken = r.body.accessToken;
      ok(`org admin 登录成功 userId=${r.body.user.id}`);
    }
  }

  if (orgAdminToken) {
    // 列出我所在的机构: GET /api/orgs/  返回 my memberships
    const r = await http('GET', '/api/orgs', { token: orgAdminToken });
    if (!r.ok) {
      bug('MAJOR', 'GET /api/orgs (my orgs)', `${r.status}`, { body: r.body });
    } else {
      const list = Array.isArray(r.body) ? r.body : [];
      const found = list.find((o) => o.id === orgId);
      if (!found) bug('MAJOR', 'my orgs 不含刚创建的机构', `userId=${orgAdminToken.slice(0,12)}`, { body: list });
      else ok(`org admin 的 my orgs 包含 ${ORG_NAME} (myRole=${found.myRole})`);
    }

    // 当前机构详情
    const detail = await http('GET', `/api/orgs/${orgId}`, { token: orgAdminToken });
    if (!detail.ok) {
      bug('MAJOR', `GET /api/orgs/${orgId}`, `读取失败 ${detail.status}`, { body: detail.body });
    } else {
      ok(`/api/orgs/${orgId} 可读 name=${detail.body.name}`);
    }

    // 成员列表
    const members = await http('GET', `/api/orgs/${orgId}/members`, { token: orgAdminToken });
    if (!members.ok) {
      bug('MAJOR', `GET /orgs/${orgId}/members`, `读取失败 ${members.status}`, { body: members.body });
    } else {
      const list = Array.isArray(members.body) ? members.body : (members.body?.members || members.body?.items || []);
      ok(`/orgs/${orgId}/members 返回 ${list.length} 条`);
    }
  }

  // ─── 6. Counselor 1 login & access workbench endpoints ─────
  step('6. 咨询师 1 登录 + 访问工作台数据');
  let counselorToken = null;
  {
    const r = await http('POST', '/api/auth/login', {
      body: { email: COUNSELOR_1.email, password: COUNSELOR_1.password },
    });
    if (!r.ok) {
      bug('BLOCKER', 'counselor login', `登录失败 ${r.status}`, { body: r.body });
    } else {
      counselorToken = r.body.accessToken;
      ok(`咨询师 1 登录成功`);
    }
  }

  if (counselorToken) {
    // 协作中心 — assignments(咨询师可见) + referrals inbox(全员可见)
    // unassigned-clients/pending-notes/audit/phi-access 是 org_admin 专属(在第 12 步用 admin token 验证)
    {
      const r = await http('GET', `/api/orgs/${orgId}/collaboration/assignments`, { token: counselorToken });
      if (!r.ok) bug('MAJOR', `协作中心 assignments`, `${r.status}`, { body: r.body });
      else ok(`协作中心 /assignments 可读`);
    }
    // referral inbox 是 OrgCollaboration.tsx 实际使用的
    const inbox = await http('GET', `/api/orgs/${orgId}/referrals/inbox`, { token: counselorToken });
    if (!inbox.ok) bug('MAJOR', 'referrals inbox', `${inbox.status}`, { body: inbox.body });
    else ok(`/referrals/inbox 可读`);

    // 笔记模板 / 目标库 — 咨询师常用
    const tmpl = await http('GET', `/api/orgs/${orgId}/note-templates`, { token: counselorToken });
    if (!tmpl.ok) bug('MAJOR', '笔记模板', `${tmpl.status}`, { body: tmpl.body });
    else ok(`/note-templates 可读`);
    const goals = await http('GET', `/api/orgs/${orgId}/goal-library`, { token: counselorToken });
    if (!goals.ok) bug('MAJOR', '目标库', `${goals.status}`, { body: goals.body });
    else ok(`/goal-library 可读`);

    // 交付中心 (services aggregation)
    const delivery = await http('GET', `/api/orgs/${orgId}/services`, { token: counselorToken });
    if (!delivery.ok) {
      bug('MAJOR', '交付中心 services', `${delivery.status}`, { body: delivery.body });
    } else {
      const items = Array.isArray(delivery.body) ? delivery.body : (delivery.body?.items || []);
      ok(`交付中心 services 可读 (${items.length} 条)`);
    }

    // 研判分流 (triage candidates + buckets)
    const candidates = await http('GET', `/api/orgs/${orgId}/triage/candidates`, { token: counselorToken });
    if (!candidates.ok) bug('MAJOR', '研判分流 candidates', `${candidates.status}`, { body: candidates.body });
    else ok(`/triage/candidates 可读`);
    const buckets = await http('GET', `/api/orgs/${orgId}/triage/buckets`, { token: counselorToken });
    if (!buckets.ok) bug('MAJOR', '研判分流 buckets', `${buckets.status}`, { body: buckets.body });
    else ok(`/triage/buckets 可读`);

    // 人员档案 — 跨模块 client 列表
    const people = await http('GET', `/api/orgs/${orgId}/people`, { token: counselorToken });
    if (!people.ok) {
      bug('MAJOR', 'GET /people', `${people.status}`, { body: people.body });
    } else {
      const items = Array.isArray(people.body) ? people.body : (people.body?.items || people.body?.people || []);
      ok(`人员档案可读 (${items.length} 条)`);
    }

    // 我的 client-assignments (counselor 视角)
    const myAssignments = await http('GET', `/api/orgs/${orgId}/client-assignments`, { token: counselorToken });
    if (!myAssignments.ok) bug('MAJOR', '/client-assignments', `${myAssignments.status}`, { body: myAssignments.body });
    else {
      const items = Array.isArray(myAssignments.body) ? myAssignments.body : (myAssignments.body?.items || []);
      ok(`/client-assignments 可读 (${items.length} 条)`);
    }

    // 评估列表
    const assessments = await http('GET', `/api/orgs/${orgId}/assessments`, { token: counselorToken });
    if (!assessments.ok) {
      bug('MAJOR', 'GET /assessments', `${assessments.status}`, { body: assessments.body });
    } else {
      const items = Array.isArray(assessments.body) ? assessments.body : (assessments.body?.items || []);
      ok(`评估列表可读 (${items.length} 条)`);
    }

    // 量表库
    const scales = await http('GET', `/api/orgs/${orgId}/scales`, { token: counselorToken });
    if (!scales.ok) bug('MAJOR', 'GET /scales', `${scales.status}`, { body: scales.body });
    else {
      const items = Array.isArray(scales.body) ? scales.body : (scales.body?.items || []);
      ok(`量表库可读 (${items.length} 条)`);
    }

    // 通知
    const notif = await http('GET', `/api/orgs/${orgId}/notifications`, { token: counselorToken });
    if (!notif.ok) bug('MAJOR', '通知', `${notif.status}`, { body: notif.body });
    else ok(`/notifications 可读`);
  }

  // ─── 6b. org_admin token 测 admin 专属端点 ─────────────────
  step('6b. org_admin 视角:成员管理 / dashboard / 协作中心 admin 子页 / 配置');
  if (orgAdminToken) {
    // dashboard (admin only)
    const dash = await http('GET', `/api/orgs/${orgId}/dashboard/stats`, { token: orgAdminToken });
    if (!dash.ok) bug('MAJOR', 'dashboard stats (admin)', `${dash.status}`, { body: dash.body });
    else ok(`org_admin dashboard stats 可读`);

    // 协作中心 admin 视角
    for (const sub of ['unassigned-clients', 'audit', 'phi-access']) {
      const r = await http('GET', `/api/orgs/${orgId}/collaboration/${sub}`, { token: orgAdminToken });
      if (!r.ok) bug('MAJOR', `协作中心 ${sub} (admin)`, `${r.status}`, { body: r.body });
      else ok(`协作中心 /${sub} (admin) 可读`);
    }
    // pending-notes 需要 supervisor tier — starter 套餐进不去, 跳过

    // 邀请新成员
    const invite = await http('POST', `/api/orgs/${orgId}/members/invite`, {
      token: orgAdminToken,
      expect: 201,
      body: { email: `e2e-invited-${STAMP}@test.psynote.cn`, role: 'counselor', name: 'E2E 邀请测试' },
    });
    if (!invite.ok) bug('MAJOR', '邀请成员', `${invite.status}`, { body: invite.body });
    else ok(`邀请成员成功 status=${invite.body.status}`);

    // 读 + 改 triage 配置
    const tcfg = await http('GET', `/api/orgs/${orgId}/triage-config`, { token: orgAdminToken });
    if (!tcfg.ok) bug('MAJOR', '读 triage-config', `${tcfg.status}`, { body: tcfg.body });
    else ok(`triage-config 可读`);

    // org branding
    const brand = await http('GET', `/api/orgs/${orgId}/branding`, { token: orgAdminToken });
    if (!brand.ok) bug('MAJOR', '读 branding', `${brand.status}`, { body: brand.body });
    else ok(`branding 可读`);

    // subscription
    const sub = await http('GET', `/api/orgs/${orgId}/subscription`, { token: orgAdminToken });
    if (!sub.ok) bug('MAJOR', '读 subscription', `${sub.status}`, { body: sub.body });
    else ok(`subscription 可读`);

    // public services 列表(机构对外可发布的服务) — 路径在 publicServiceRoutes
    const ps = await http('GET', `/api/public/orgs/${ORG_SLUG}/services`);
    if (!ps.ok) bug('MAJOR', '机构对外服务列表', `${ps.status}`, { body: ps.body });
    else ok(`/api/public/orgs/${ORG_SLUG}/services 可读`);

    // service intakes 列表(authenticated)
    const intakes = await http('GET', `/api/orgs/${orgId}/service-intakes`, { token: orgAdminToken });
    if (!intakes.ok) bug('MAJOR', 'service intakes', `${intakes.status}`, { body: intakes.body });
    else ok(`/service-intakes 可读`);
  }

  // ─── 7. Counseling public info & register a client ─────────
  step('7. 公开注册一个来访者');

  // 7a. /info 应该可拿到机构基本信息(无 auth)
  {
    const r = await http('GET', `/api/public/counseling/${ORG_SLUG}/info`);
    if (!r.ok) {
      bug('MAJOR', `/public/counseling/${ORG_SLUG}/info`, `${r.status}`, { body: r.body });
    } else {
      ok(`公开 info 端点可读 name=${r.body.name}`);
    }
  }

  // 7b. POST register
  let clientToken = null;
  {
    const r = await http('POST', `/api/public/counseling/${ORG_SLUG}/register`, {
      expect: [201, 200],
      body: CLIENT_1,
    });
    if (!r.ok) {
      bug('BLOCKER', `/public/counseling/register`, `${r.status}`, { body: r.body });
    } else {
      clientToken = r.body.accessToken;
      ok(`来访者注册成功 status=${r.body.status} userId(token verifies)`);
    }
  }

  // 7c. 重复注册应该返回 already_registered
  {
    const r = await http('POST', `/api/public/counseling/${ORG_SLUG}/register`, {
      expect: [200],
      body: CLIENT_1,
    });
    if (!r.ok) {
      bug('MAJOR', '重复注册不返回 200/already_registered', `${r.status}`, { body: r.body });
    } else if (r.body.status !== 'already_registered') {
      bug('MAJOR', '重复注册 status 字段不对', `expected already_registered, got ${r.body.status}`, { body: r.body });
    } else {
      ok(`重复注册返回 already_registered`);
    }
  }

  // ─── 8. Client portal access ────────────────────────────────
  step('8. 来访者登录 + 访问 Portal');
  if (clientToken) {
    // dashboard
    const dash = await http('GET', `/api/orgs/${orgId}/client/dashboard`, { token: clientToken });
    if (!dash.ok) {
      bug('MAJOR', 'Portal dashboard', `${dash.status}`, { body: dash.body });
    } else ok(`Portal dashboard 可读`);

    // my appointments
    const appts = await http('GET', `/api/orgs/${orgId}/client/appointments`, { token: clientToken });
    if (!appts.ok) {
      bug('MAJOR', 'Portal appointments', `${appts.status}`, { body: appts.body });
    } else {
      const items = Array.isArray(appts.body) ? appts.body : (appts.body?.items || []);
      ok(`Portal 我的预约列表可读 (${items.length} 条)`);
    }

    // my assessments
    const myAss = await http('GET', `/api/orgs/${orgId}/client/my-assessments`, { token: clientToken });
    if (!myAss.ok) {
      bug('MAJOR', 'Portal my-assessments', `${myAss.status}`, { body: myAss.body });
    } else ok(`Portal 我的评估可读`);

    // counselors list
    const cls = await http('GET', `/api/orgs/${orgId}/client/counselors`, { token: clientToken });
    if (!cls.ok) {
      bug('MAJOR', 'Portal counselors', `${cls.status}`, { body: cls.body });
    } else {
      const items = Array.isArray(cls.body) ? cls.body : (cls.body?.items || []);
      ok(`Portal 咨询师列表可读 (${items.length} 条)`);
    }
  }

  // ─── 9. Counselor creates episode + appointment + note for the client ──
  step('9. 咨询师为来访者创建 episode / appointment / session note');
  if (counselorToken && clientToken) {
    // 9a. 找到 client 的 user id (走 /people)
    let clientUserId = null;
    {
      const r = await http('GET', `/api/orgs/${orgId}/people`, { token: counselorToken });
      if (r.ok) {
        const items = Array.isArray(r.body) ? r.body : (r.body?.items || r.body?.people || []);
        const found = items.find((x) =>
          x.email === CLIENT_1.email ||
          x.userEmail === CLIENT_1.email ||
          x.user?.email === CLIENT_1.email,
        );
        clientUserId = found?.userId || found?.user?.id || found?.id || null;
        if (clientUserId) ok(`从 /people 找到 client userId=${clientUserId}`);
        else bug('MAJOR', '/people 列表里没有刚注册的 client', '注册的 client 没出现在 /people', { sample: items[0], total: items.length });
      }
    }

    // 9b. 创建 episode (body schema: { clientId (=userId), counselorId?, chiefComplaint... })
    let episodeId = null;
    if (clientUserId) {
      const r = await http('POST', `/api/orgs/${orgId}/episodes`, {
        token: counselorToken,
        expect: [200, 201],
        body: {
          clientId: clientUserId,
          chiefComplaint: 'E2E 测试: 焦虑情绪 + 失眠',
          currentRisk: 'low',
          interventionType: 'cbt',
        },
      });
      if (!r.ok) {
        bug('BLOCKER', 'POST /episodes', `${r.status}`, { body: r.body });
      } else {
        episodeId = r.body.id;
        ok(`episode 创建成功 id=${episodeId}`);
      }
    }

    // 9c. 创建 appointment (body: { careEpisodeId, clientId, startTime, endTime, type })
    let apptId = null;
    if (clientUserId) {
      const startTime = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const endTime = new Date(Date.now() + 24 * 3600 * 1000 + 50 * 60 * 1000).toISOString();
      const r = await http('POST', `/api/orgs/${orgId}/appointments`, {
        token: counselorToken,
        expect: [200, 201],
        body: {
          careEpisodeId: episodeId,
          clientId: clientUserId,
          startTime,
          endTime,
          type: 'individual',
          source: 'manual',
        },
      });
      if (!r.ok) {
        bug('BLOCKER', 'POST /appointments', `${r.status}`, { body: r.body });
      } else {
        apptId = r.body.id;
        ok(`appointment 创建成功 id=${apptId} startTime=${startTime}`);
      }
    }

    // 9d. 创建 session note
    if (apptId && clientUserId) {
      const r = await http('POST', `/api/orgs/${orgId}/session-notes`, {
        token: counselorToken,
        expect: [200, 201],
        body: {
          careEpisodeId: episodeId,
          appointmentId: apptId,
          clientId: clientUserId,
          sessionDate: new Date().toISOString(),
          subjective: '来访者主诉: E2E 测试笔记',
          objective: '咨询师观察: 来访者情绪稳定',
          assessment: '初步评估: 适应性问题',
          plan: '下次预约 + 焦虑量表评估',
        },
      });
      if (!r.ok) {
        bug('MAJOR', 'POST /session-notes', `${r.status}`, { body: r.body });
      } else {
        ok(`session note 创建成功`);
      }
    }

    // 9e. client 应能在 portal 看到这个 appointment
    if (apptId && clientToken) {
      const r = await http('GET', `/api/orgs/${orgId}/client/appointments`, { token: clientToken });
      if (r.ok) {
        const items = Array.isArray(r.body) ? r.body : (r.body?.items || r.body?.appointments || []);
        const visible = items.find((a) => a.id === apptId);
        if (!visible) {
          bug('MAJOR', 'client 看不到自己的 appointment', `apptId=${apptId} not in portal list (total ${items.length})`, { sample: items[0] });
        } else {
          ok(`来访者在 portal 看到了刚创建的预约`);
        }
      }
    }

    // 9f. counselor 应能在 episode 列表里看到刚建的
    if (episodeId) {
      const r = await http('GET', `/api/orgs/${orgId}/episodes`, { token: counselorToken });
      if (r.ok) {
        const items = Array.isArray(r.body) ? r.body : (r.body?.items || []);
        const visible = items.find((e) => e.id === episodeId);
        if (!visible) bug('MAJOR', 'episode 列表不含刚建的', `id=${episodeId} not visible`, { total: items.length });
        else ok(`咨询师在 episode 列表看到了刚建的`);
      }
    }
  }

  // ─── 10. Try the deprecated /register endpoint should 410 ───
  step('10. 已弃用 /api/auth/register 应返回 410');
  {
    const r = await http('POST', '/api/auth/register', {
      expect: [410],
      body: { email: 'should-not-work@x.com', password: 'whatever', name: 'X' },
    });
    if (!r.ok) {
      bug('MAJOR', 'POST /api/auth/register', `期望 410, got ${r.status}`, { body: r.body });
    } else {
      ok(`/api/auth/register 已正确返回 410`);
    }
  }

  // ─── 10b. 跨机构隔离 ─────────────────────────────────────────
  step('10b. 跨机构隔离 — 客户/咨询师不能看别的机构的数据');
  if (clientToken) {
    // 编一个不存在的 orgId
    const fakeOrgId = '00000000-0000-0000-0000-000000000000';
    const r = await http('GET', `/api/orgs/${fakeOrgId}/client/dashboard`, {
      token: clientToken,
      expect: [403, 404],
    });
    if (!r.ok) bug('MAJOR', '跨机构访问应 403/404', `实际 ${r.status}`, { body: r.body });
    else ok(`跨机构访问被 ${r.status} 拒绝 (good)`);
  }

  // ─── 10c. 失效/无效 token ───────────────────────────────────
  step('10c. 失效 / 无效 token 应返回 401');
  {
    const r = await http('GET', '/api/orgs/', {
      token: 'this.is.not.a.valid.jwt',
      expect: 401,
    });
    if (!r.ok) bug('MAJOR', '无效 token 应 401', `实际 ${r.status}`, { body: r.body });
    else ok(`无效 token 被 401 拒绝`);
  }
  {
    const r = await http('GET', '/api/orgs/', { expect: 401 });
    if (!r.ok) bug('MAJOR', '缺 token 应 401', `实际 ${r.status}`, { body: r.body });
    else ok(`缺 token 被 401 拒绝`);
  }

  // ─── 10d. /api/orgs/:orgId 非 UUID 不该 500 ──────────────────
  step('10d. 非 UUID :orgId 应返回 400/404, 不能 500');
  if (orgAdminToken) {
    const r = await http('GET', '/api/orgs/me', {
      token: orgAdminToken,
      expect: [400, 404],
    });
    if (!r.ok) bug('MAJOR', '非 UUID :orgId 5xx', `应 400/404, 实际 ${r.status}`, { body: r.body });
    else ok(`/api/orgs/me 返回 ${r.status} (good)`);
  }

  // ─── 10e. EAP 公开注册路径 ───────────────────────────────────
  step('10e. EAP 公开注册端点存在性');
  {
    // /api/public/eap/:orgSlug/info 应返回 404(因为不是 enterprise org)而不是 500
    const r = await http('GET', `/api/public/eap/${ORG_SLUG}/info`, { expect: [404, 400] });
    if (!r.ok) bug('MAJOR', 'EAP info 在 counseling org 上应 404', `实际 ${r.status}`, { body: r.body });
    else ok(`/api/public/eap/${ORG_SLUG}/info 返回 ${r.status} (good — counseling org 不该被 EAP 接受)`);
  }

  // ─── 11. Forgot-password flow ──────────────────────────────
  step('11. 忘记密码请求流程');
  {
    // 即使邮箱不存在也应返回成功(防枚举)
    const r = await http('POST', '/api/auth/forgot-password', {
      body: { email: 'nobody-exists@nowhere.com' },
    });
    if (!r.ok) {
      bug('MAJOR', 'POST /forgot-password (unknown email)', `${r.status}`, { body: r.body });
    } else {
      ok(`forgot-password 对未知邮箱返回 200`);
    }

    const r2 = await http('POST', '/api/auth/forgot-password', {
      body: { email: CLIENT_1.email },
    });
    if (!r2.ok) {
      bug('MAJOR', 'POST /forgot-password (real)', `${r2.status}`, { body: r2.body });
    } else {
      ok(`forgot-password 对真实邮箱返回 200`);
    }
  }

  return summary();
}

function summary() {
  console.log(`\n${ANSI.bold}━━━ 总结 ━━━${ANSI.reset}`);
  if (bugs.length === 0) {
    console.log(`${ANSI.green}${ANSI.bold}🎉 全部通过, 无 bug${ANSI.reset}`);
    return 0;
  }
  const by = { BLOCKER: [], MAJOR: [], MINOR: [] };
  for (const b of bugs) (by[b.severity] || by.MINOR).push(b);
  console.log(`${ANSI.red}BLOCKER: ${by.BLOCKER.length}${ANSI.reset}  ${ANSI.yellow}MAJOR: ${by.MAJOR.length}${ANSI.reset}  MINOR: ${by.MINOR.length}`);
  for (const b of bugs) {
    console.log(`  [${b.severity}] ${b.where} — ${b.msg}`);
  }
  return by.BLOCKER.length > 0 ? 2 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`${ANSI.red}FATAL${ANSI.reset}`, err);
    process.exit(3);
  });
