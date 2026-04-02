/**
 * Seed script: creates demo org, users, and sample data for development testing.
 * Run: npx tsx src/seed.ts
 */
import 'dotenv/config';
import crypto from 'crypto';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';
const sql = postgres(DATABASE_URL);

// Deterministic UUIDs so re-running is idempotent
function demoUUID(name: string): string {
  return crypto.createHash('md5').update(`psynote-demo-${name}`).digest('hex')
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

const ID = {
  org: demoUUID('org'),
  counselor: demoUUID('counselor'),
  client: demoUUID('client'),
  admin: demoUUID('admin'),
  memberCounselor: demoUUID('member-counselor'),
  memberClient: demoUUID('member-client'),
  memberAdmin: demoUUID('member-admin'),
  scale: demoUUID('scale-phq9'),
  dim: demoUUID('dim-depression'),
  assessment: demoUUID('assessment'),
  episode: demoUUID('episode'),
  group: demoUUID('group'),
  course: demoUUID('course'),
  tl1: demoUUID('tl-1'),
  tl2: demoUUID('tl-2'),
  tl3: demoUUID('tl-3'),
  tl4: demoUUID('tl-4'),
  ch1: demoUUID('ch-1'),
  ch2: demoUUID('ch-2'),
  ch3: demoUUID('ch-3'),
};

async function seed() {
  console.log('Seeding database...');

  // 1. Organization
  await sql`
    INSERT INTO organizations (id, name, slug, plan, settings)
    VALUES (${ID.org}, 'Psynote演示机构', 'demo', 'pro', '{"maxMembers": 100}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `;
  console.log('  + Organization');

  // 2. Users
  for (const u of [
    { id: ID.counselor, email: 'counselor@demo.psynote.cn', name: '张咨询师' },
    { id: ID.client, email: 'client@demo.psynote.cn', name: '李同学' },
    { id: ID.admin, email: 'admin@demo.psynote.cn', name: '王管理员' },
  ]) {
    await sql`INSERT INTO users (id, email, name) VALUES (${u.id}, ${u.email}, ${u.name}) ON CONFLICT (id) DO NOTHING`;
  }
  console.log('  + Users (3)');

  // 3. Memberships
  for (const m of [
    { id: ID.memberCounselor, userId: ID.counselor, role: 'counselor' },
    { id: ID.memberClient, userId: ID.client, role: 'client' },
    { id: ID.memberAdmin, userId: ID.admin, role: 'org_admin' },
  ]) {
    await sql`
      INSERT INTO org_members (id, org_id, user_id, role, status)
      VALUES (${m.id}, ${ID.org}, ${m.userId}, ${m.role}, 'active')
      ON CONFLICT (id) DO NOTHING
    `;
  }
  console.log('  + Memberships (3)');

  // 4. PHQ-9 Scale
  await sql`
    INSERT INTO scales (id, org_id, title, description, instructions, scoring_mode, created_by, is_public)
    VALUES (${ID.scale}, ${ID.org}, 'PHQ-9 患者健康问卷', '用于筛查和评估抑郁症状严重程度的9题简短自评量表',
      '在过去两周内，以下问题对您造成困扰的频率是？', 'sum', ${ID.counselor}, true)
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO scale_dimensions (id, scale_id, name, description, calculation_method, sort_order)
    VALUES (${ID.dim}, ${ID.scale}, '抑郁程度', '总体抑郁症状严重程度', 'sum', 0)
    ON CONFLICT (id) DO NOTHING
  `;

  const rules = [
    { min: 0, max: 4, label: '无抑郁', desc: '无明显抑郁症状', risk: 'level_1' },
    { min: 5, max: 9, label: '轻度抑郁', desc: '可能存在轻度抑郁，建议自助调节', risk: 'level_1' },
    { min: 10, max: 14, label: '中度抑郁', desc: '中度抑郁，建议寻求心理辅导', risk: 'level_2' },
    { min: 15, max: 19, label: '中重度抑郁', desc: '中重度抑郁，建议专业咨询', risk: 'level_3' },
    { min: 20, max: 27, label: '重度抑郁', desc: '重度抑郁，建议尽快就医', risk: 'level_4' },
  ];
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    await sql`
      INSERT INTO dimension_rules (id, dimension_id, min_score, max_score, label, description, risk_level)
      VALUES (${demoUUID(`rule-${i}`)}, ${ID.dim}, ${r.min}, ${r.max}, ${r.label}, ${r.desc}, ${r.risk})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  const phq9Items = [
    '做事时提不起劲或没有兴趣',
    '感到心情低落、沮丧或绝望',
    '入睡困难、睡不安稳或睡眠过多',
    '感觉疲倦或没有活力',
    '食欲不振或吃太多',
    '觉得自己很糟——或觉得自己很失败，或让自己或家人失望',
    '对事物专注有困难，例如阅读报纸或看电视时',
    '动作或说话速度缓慢到别人已经注意到，或正好相反——坐立不安、动来动去的情况比平常更多',
    '有不如死掉或用某种方式伤害自己的念头',
  ];
  const opts = JSON.stringify([
    { label: '完全不会', value: 0 }, { label: '好几天', value: 1 },
    { label: '一半以上的天数', value: 2 }, { label: '几乎每天', value: 3 },
  ]);
  for (let i = 0; i < phq9Items.length; i++) {
    await sql`
      INSERT INTO scale_items (id, scale_id, dimension_id, text, is_reverse_scored, options, sort_order)
      VALUES (${demoUUID(`item-${i}`)}, ${ID.scale}, ${ID.dim}, ${phq9Items[i]}, false, ${opts}::jsonb, ${i})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  console.log('  + PHQ-9 scale (9 items)');

  // 5. Assessment
  await sql`
    INSERT INTO assessments (id, org_id, title, description, demographics, is_active, created_by)
    VALUES (${ID.assessment}, ${ID.org}, '新生入学心理筛查', '面向新生的心理健康初始筛查',
      '[{"key":"grade","label":"年级","type":"select","options":["大一","大二","大三","大四"]},{"key":"gender","label":"性别","type":"select","options":["男","女","其他"]}]'::jsonb,
      true, ${ID.counselor})
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO assessment_scales (assessment_id, scale_id, sort_order)
    VALUES (${ID.assessment}, ${ID.scale}, 0)
    ON CONFLICT DO NOTHING
  `;
  console.log('  + Assessment');

  // 6. Care Episode
  await sql`
    INSERT INTO care_episodes (id, org_id, client_id, counselor_id, status, chief_complaint, current_risk, intervention_type)
    VALUES (${ID.episode}, ${ID.org}, ${ID.client}, ${ID.counselor}, 'active',
      '学业压力大，情绪低落，睡眠质量差', 'level_2', 'counseling')
    ON CONFLICT (id) DO NOTHING
  `;

  // Timeline
  const tlEvents = [
    { id: ID.tl1, type: 'assessment', title: '完成PHQ-9筛查', summary: '总分12分，中度抑郁', days: 7 },
    { id: ID.tl2, type: 'triage_decision', title: '分流决定：个体咨询', summary: '根据中度抑郁评估结果，建议进行个体咨询', days: 6 },
    { id: ID.tl3, type: 'appointment', title: '首次咨询预约', summary: '预约时间：下周一 14:00', days: 5 },
    { id: ID.tl4, type: 'session_note', title: '第一次咨询记录', summary: '来访者表现出对学业的焦虑，使用CBT技术进行认知重建', days: 3 },
  ];
  for (const e of tlEvents) {
    await sql`
      INSERT INTO care_timeline (id, care_episode_id, event_type, title, summary, created_by, created_at)
      VALUES (${e.id}, ${ID.episode}, ${e.type}, ${e.title}, ${e.summary}, ${ID.counselor}, NOW() - ${`${e.days} days`}::interval)
      ON CONFLICT (id) DO NOTHING
    `;
  }
  console.log('  + Care episode + timeline');

  // 7. Group instance
  await sql`
    INSERT INTO group_instances (id, org_id, title, description, category, status, capacity, start_date, location, created_by)
    VALUES (${ID.group}, ${ID.org}, '压力管理工作坊', '学习正念减压和情绪调节技巧的6周团辅活动',
      'stress', 'recruiting', 12, CURRENT_DATE + INTERVAL '14 days', '心理咨询中心 团辅室A', ${ID.counselor})
    ON CONFLICT (id) DO NOTHING
  `;
  console.log('  + Group instance');

  // 8. Course
  await sql`
    INSERT INTO courses (id, org_id, title, description, category, is_public, created_by)
    VALUES (${ID.course}, ${ID.org}, '心理健康自助指南',
      '面向大学生的心理健康基础课程，涵盖情绪管理、压力应对、人际沟通等主题',
      '心理健康', true, ${ID.admin})
    ON CONFLICT (id) DO NOTHING
  `;
  const chapters = [
    { id: ID.ch1, title: '认识你的情绪', content: '情绪是人类的自然反应，了解情绪的类型和功能有助于更好地管理自己的心理状态...' },
    { id: ID.ch2, title: '压力与应对', content: '适度的压力是动力，过度的压力会损害身心健康。学习识别压力源并采取有效的应对策略...' },
    { id: ID.ch3, title: '正念与放松', content: '正念冥想是经过科学验证的减压方法。每天10分钟的练习就能带来显著的改善...' },
  ];
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    await sql`
      INSERT INTO course_chapters (id, course_id, title, content, sort_order)
      VALUES (${c.id}, ${ID.course}, ${c.title}, ${c.content}, ${i})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  console.log('  + Course (3 chapters)');

  console.log('\n--- Seed completed ---');
  console.log(`Org ID: ${ID.org}`);
  console.log(`Counselor ID: ${ID.counselor}`);
  console.log(`Client ID: ${ID.client}`);
  console.log(`Admin ID: ${ID.admin}`);

  await sql.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
