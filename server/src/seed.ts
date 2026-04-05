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
  clientProfile: demoUUID('client-profile'),
  // Episode 1: 初二焦虑（已结案）
  ep1: demoUUID('episode-1'),
  ep1Appt1: demoUUID('ep1-appt-1'),
  ep1Appt2: demoUUID('ep1-appt-2'),
  ep1Appt3: demoUUID('ep1-appt-3'),
  ep1Appt4: demoUUID('ep1-appt-4'),
  ep1Appt5: demoUUID('ep1-appt-5'),
  ep1Appt6: demoUUID('ep1-appt-6'),
  ep1Note1: demoUUID('ep1-note-1'),
  ep1Note2: demoUUID('ep1-note-2'),
  ep1Note3: demoUUID('ep1-note-3'),
  ep1Note4: demoUUID('ep1-note-4'),
  ep1Note5: demoUUID('ep1-note-5'),
  ep1Note6: demoUUID('ep1-note-6'),
  ep1Plan: demoUUID('ep1-plan'),
  ep1Result: demoUUID('ep1-result'),
  ep1Tl1: demoUUID('ep1-tl-1'),
  ep1Tl2: demoUUID('ep1-tl-2'),
  ep1Tl3: demoUUID('ep1-tl-3'),
  ep1Tl4: demoUUID('ep1-tl-4'),
  ep1Tl5: demoUUID('ep1-tl-5'),
  ep1Tl6: demoUUID('ep1-tl-6'),
  ep1Tl7: demoUUID('ep1-tl-7'),
  ep1Tl8: demoUUID('ep1-tl-8'),
  ep1Tl9: demoUUID('ep1-tl-9'),
  ep1Tl10: demoUUID('ep1-tl-10'),
  // Episode 2: 高一抑郁（进行中）
  ep2: demoUUID('episode-2'),
  ep2Appt1: demoUUID('ep2-appt-1'),
  ep2Appt2: demoUUID('ep2-appt-2'),
  ep2Appt3: demoUUID('ep2-appt-3'),
  ep2Appt4: demoUUID('ep2-appt-4'),
  ep2Note1: demoUUID('ep2-note-1'),
  ep2Note2: demoUUID('ep2-note-2'),
  ep2Note3: demoUUID('ep2-note-3'),
  ep2Plan: demoUUID('ep2-plan'),
  ep2Result: demoUUID('ep2-result'),
  ep2Tl1: demoUUID('ep2-tl-1'),
  ep2Tl2: demoUUID('ep2-tl-2'),
  ep2Tl3: demoUUID('ep2-tl-3'),
  ep2Tl4: demoUUID('ep2-tl-4'),
  ep2Tl5: demoUUID('ep2-tl-5'),
  ep2Tl6: demoUUID('ep2-tl-6'),
  ep2Tl7: demoUUID('ep2-tl-7'),
  ep2Tl8: demoUUID('ep2-tl-8'),
  // Group & Course
  group: demoUUID('group'),
  course: demoUUID('course'),
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

  // 6. Client Profile
  await sql`
    INSERT INTO client_profiles (id, org_id, user_id, phone, gender, date_of_birth, occupation, education,
      emergency_contact, family_background, presenting_issues, notes)
    VALUES (${ID.clientProfile}, ${ID.org}, ${ID.client}, '138****7621', 'male', '2010-08-15',
      '学生', '初中在读',
      ${'{"name":"李妈妈","phone":"139****3302","relationship":"母亲"}'}::jsonb,
      '父母均为公司职员，家庭经济状况中等。父亲工作较忙，母亲对学业期望较高。独生子女，与母亲关系较紧密，与父亲交流偏少。',
      ${JSON.stringify(['考试焦虑', '社交紧张', '睡眠问题'])}::jsonb,
      '初一成绩中上，初二开始出现明显焦虑表现。班主任反映上课注意力下降。')
    ON CONFLICT (id) DO NOTHING
  `;
  console.log('  + Client profile');

  // ═══════════════════════════════════════════════════════════════════
  // 7. Episode 1: 初二焦虑（已结案）
  //    背景：李同学初二下学期，因为考试焦虑主动通过学校心理咨询中心预约
  //    时间线：2025-03 ~ 2025-06，共6次咨询，结案
  // ═══════════════════════════════════════════════════════════════════

  await sql`
    INSERT INTO care_episodes (id, org_id, client_id, counselor_id, status, chief_complaint,
      current_risk, intervention_type, opened_at, closed_at)
    VALUES (${ID.ep1}, ${ID.org}, ${ID.client}, ${ID.counselor}, 'closed',
      '每次考试前一周开始紧张失眠，上课害怕被点名回答问题，手心出汗、心跳加速',
      'level_2', 'counseling',
      '2025-03-10T09:00:00+08:00', '2025-06-23T16:00:00+08:00')
    ON CONFLICT (id) DO NOTHING
  `;

  // Assessment result for Episode 1 (PHQ-9 score 8 = mild)
  await sql`
    INSERT INTO assessment_results (id, org_id, assessment_id, user_id, care_episode_id,
      demographic_data, answers, dimension_scores, total_score, risk_level, created_at)
    VALUES (${ID.ep1Result}, ${ID.org}, ${ID.assessment}, ${ID.client}, ${ID.ep1},
      ${'{"grade":"初二","gender":"男"}'}::jsonb,
      ${JSON.stringify([1,1,2,1,0,1,1,0,1])}::jsonb,
      ${JSON.stringify([{dimensionId: ID.dim, score: 8, label: '轻度抑郁'}])}::jsonb,
      8, 'level_1', '2025-03-10T10:30:00+08:00')
    ON CONFLICT (id) DO NOTHING
  `;

  // Treatment Plan for Episode 1 (completed)
  await sql`
    INSERT INTO treatment_plans (id, org_id, care_episode_id, counselor_id, status, title, approach,
      goals, interventions, session_plan, progress_notes, review_date, created_at, updated_at)
    VALUES (${ID.ep1Plan}, ${ID.org}, ${ID.ep1}, ${ID.counselor}, 'completed',
      '考试焦虑干预方案', 'CBT（认知行为疗法）',
      ${JSON.stringify([
        { id: demoUUID('ep1-goal-1'), description: '降低考试前焦虑水平，能在考试前一天正常入睡', status: 'achieved', notes: '第4次咨询后来访者反馈考前焦虑明显减轻', createdAt: '2025-03-17' },
        { id: demoUUID('ep1-goal-2'), description: '能够在课堂上主动举手回答问题，每周至少2次', status: 'achieved', notes: '第5次咨询时来访者报告已能主动回答', createdAt: '2025-03-17' },
        { id: demoUUID('ep1-goal-3'), description: '掌握至少2种焦虑应对策略并能自主使用', status: 'achieved', notes: '掌握了腹式呼吸和认知重评技术', createdAt: '2025-03-17' },
      ])}::jsonb,
      ${JSON.stringify([
        { id: demoUUID('ep1-int-1'), description: '认知重构：识别和挑战关于考试的灾难化想法', frequency: '每次咨询' },
        { id: demoUUID('ep1-int-2'), description: '渐进式肌肉放松训练', frequency: '每次咨询练习，课后每天练习' },
        { id: demoUUID('ep1-int-3'), description: '暴露练习：逐步增加课堂发言频率', frequency: '每周布置行为作业' },
      ])}::jsonb,
      '每周一次，每次50分钟，预计6-8次', '来访者配合度高，进步稳定。第6次咨询时各项目标均已达成，双方协商结案。',
      '2025-06-16', '2025-03-17T14:00:00+08:00', '2025-06-23T16:00:00+08:00')
    ON CONFLICT (id) DO NOTHING
  `;

  // Appointments for Episode 1 (6 sessions, all completed)
  const ep1Appts = [
    { id: ID.ep1Appt1, start: '2025-03-17T14:00:00+08:00', end: '2025-03-17T14:50:00+08:00', source: 'client_request' },
    { id: ID.ep1Appt2, start: '2025-03-24T14:00:00+08:00', end: '2025-03-24T14:50:00+08:00', source: 'counselor_manual' },
    { id: ID.ep1Appt3, start: '2025-04-07T14:00:00+08:00', end: '2025-04-07T14:50:00+08:00', source: 'counselor_manual' },
    { id: ID.ep1Appt4, start: '2025-04-21T14:00:00+08:00', end: '2025-04-21T14:50:00+08:00', source: 'counselor_manual' },
    { id: ID.ep1Appt5, start: '2025-05-12T14:00:00+08:00', end: '2025-05-12T14:50:00+08:00', source: 'counselor_manual' },
    { id: ID.ep1Appt6, start: '2025-06-09T14:00:00+08:00', end: '2025-06-09T14:50:00+08:00', source: 'counselor_manual' },
  ];
  for (const a of ep1Appts) {
    await sql`
      INSERT INTO appointments (id, org_id, care_episode_id, client_id, counselor_id,
        start_time, end_time, status, type, source)
      VALUES (${a.id}, ${ID.org}, ${ID.ep1}, ${ID.client}, ${ID.counselor},
        ${a.start}, ${a.end}, 'completed', 'offline', ${a.source})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // Session Notes for Episode 1 (6 SOAP notes)
  const ep1Notes = [
    {
      id: ID.ep1Note1, apptId: ID.ep1Appt1, date: '2025-03-17', duration: 50,
      subjective: '来访者自述每次考试前一周就开始紧张，晚上翻来覆去睡不着，脑子里反复想"万一考砸了怎么办"。上课时害怕老师点名，被叫到回答问题时手心出汗、声音发抖。自述从初二上学期期中考试考砸后开始出现这些症状，越来越严重。妈妈觉得他"太脆弱了"，让他"别想那么多"，但没有用。',
      objective: '来访者进入咨询室时表现拘谨，目光回避，说话声音偏小。在谈到考试话题时明显紧张，双手紧握。能够清楚表达自己的感受。PHQ-9得分8分（轻度），但焦虑症状为主诉。整体认知功能正常，无自伤自杀风险。',
      assessment: '来访者表现出典型的考试焦虑和社交焦虑特征，以认知歪曲（灾难化思维、过度概括化）为核心机制。焦虑起因可追溯到一次考试失利后的负面自我评价循环。家庭环境中母亲的高期望和"不理解"可能加剧了焦虑维持。目前焦虑已影响到学业表现和课堂参与，但尚未泛化到其他生活领域。',
      plan: '1. 建立咨询关系，进行心理教育（焦虑的认知模型）\n2. 下次开始认知重构训练，识别自动化思维\n3. 教授腹式呼吸作为即时应对技术\n4. 家庭作业：记录考试相关的自动化思维日志',
      summary: '初次咨询，建立关系，评估焦虑模式',
      tags: ['初次咨询', '考试焦虑', '认知评估'],
    },
    {
      id: ID.ep1Note2, apptId: ID.ep1Appt2, date: '2025-03-24', duration: 50,
      subjective: '来访者带来了思维日志，记录了3次焦虑发作。最明显的一次是周三数学测验前，想法是"我肯定又要考砸""别人都会就我不会"。尝试了腹式呼吸，说"有一点点用，但焦虑还是很强"。提到这周上课被老师叫到回答问题，虽然答对了，但"紧张得要死"。',
      objective: '来访者比上次放松一些，主动展示了思维日志。能够识别"灾难化"和"非黑即白"两种思维模式。腹式呼吸练习时能正确执行，但表示日常使用时"记不起来"。情绪状态较上次稳定。',
      assessment: '来访者对认知行为模型有较好的理解和配合度。自动化思维主要集中在"我会失败"和"别人都比我好"两个核心信念。腹式呼吸技术需要进一步强化练习。值得注意的是，来访者虽然答对了问题，但依然无法从成功经验中获得正面反馈——这说明选择性注意在维持焦虑中起重要作用。',
      plan: '1. 认知重构练习：针对"我肯定会考砸"进行苏格拉底式提问\n2. 引入证据检验技术：回顾实际考试成绩与预期的差距\n3. 继续腹式呼吸，增加渐进式肌肉放松\n4. 家庭作业：记录一次"我担心但实际没那么糟"的经历',
      summary: '认知重构训练，识别灾难化思维模式',
      tags: ['认知重构', '思维日志', '放松训练'],
    },
    {
      id: ID.ep1Note3, apptId: ID.ep1Appt3, date: '2025-04-07', duration: 50,
      subjective: '来访者反馈清明假期回来后参加了一次月考，考前还是焦虑但"没有之前那么夸张了"。用了腹式呼吸和自我对话（"上次也这样想，结果考得还行"），勉强睡着了。成绩出来数学进步了8分。来访者说"可能没有我想得那么糟"，露出了笑容。但提到英语考试还是很紧张，因为"英语一直不好"。',
      objective: '来访者精神状态明显改善，表情更放松，主动分享积极经历。能够自发使用认知重评技术。注意到来访者对"进步"有积极归因（"我努力了"），而非外归因。但在提到英语时焦虑回升，显示核心信念"我不够好"仍然活跃。',
      assessment: '认知重构技术已初步内化，焦虑应对能力提升。考试焦虑程度有所降低。但焦虑在"弱势学科"上更加顽固，可能与长期累积的挫败感有关。下一步需要扩展成功经验到更多科目，强化"我可以应对"的核心信念。来访者的积极归因风格是治疗的有利因素。',
      plan: '1. 强化正面经验整合——回顾月考的成功应对\n2. 针对英语焦虑进行具体的认知工作\n3. 引入暴露阶梯：从容易的课堂发言逐步到难度更大的场景\n4. 家庭作业：本周尝试在英语课上主动回答1次简单问题',
      summary: '月考反馈积极，焦虑减轻，开始暴露练习',
      tags: ['月考反馈', '暴露练习', '进步'],
    },
    {
      id: ID.ep1Note4, apptId: ID.ep1Appt4, date: '2025-04-21', duration: 50,
      subjective: '来访者报告这两周在英语课上举了两次手，第一次很紧张"说完手都在抖"，第二次好一些了。还被英语老师表扬了，说"没想到老师注意到了"。提到跟同桌关系变好了，午休会一起聊天。睡眠也有改善，考试前一天虽然还会想很多但"不像以前那样翻来覆去了"。',
      objective: '来访者进入咨询室时面带微笑，姿态更开放。主动报告进展，语速适中，目光接触增加。暴露练习执行良好。社交互动出现自发性改善，这是焦虑降低的泛化效应。',
      assessment: '暴露练习效果显著，来访者在课堂发言上的焦虑已明显降低。社交方面出现了积极变化，说明整体自信心在提升。核心信念层面，"我不够好"正在被"我可以试试看"替代。目前治疗进展顺利，已完成治疗计划中2/3的目标。',
      plan: '1. 继续暴露阶梯：增加发言频率和难度\n2. 巩固已有进步，讨论如何维持改善\n3. 关注期中考试临近的应对准备\n4. 家庭作业：用学到的方法应对期中考试焦虑，记录过程',
      summary: '暴露练习进展好，社交改善，整体信心提升',
      tags: ['暴露成功', '社交改善', '自信提升'],
    },
    {
      id: ID.ep1Note5, apptId: ID.ep1Appt5, date: '2025-05-12', duration: 50,
      subjective: '来访者报告期中考试顺利完成。考前有焦虑但"可控范围内"，用了呼吸和自我对话。成绩总排名从班级28名进步到20名。妈妈也表扬了他，说"你最近状态好很多"。来访者说"其实考试也没那么可怕"。唯一的困扰是英语还是中等偏下，但"不像以前那样害怕了"。',
      objective: '来访者情绪明显积极，谈到考试时不再出现躯体焦虑反应。自我效能感显著提高。来自家庭的正向反馈进一步巩固了改善效果。',
      assessment: '治疗目标已基本达成：考试焦虑显著降低，课堂参与度提高，已掌握认知重评和放松技术。核心信念转变为更加灵活和现实。来访者已具备独立应对焦虑的能力。建议再进行1-2次巩固性咨询后评估结案。',
      plan: '1. 总结和巩固治疗收获\n2. 制定复发预防计划\n3. 讨论结案时间表\n4. 下次咨询进行整体回顾和结案评估',
      summary: '期中考试焦虑应对良好，目标基本达成，准备结案',
      tags: ['期中考试', '目标达成', '结案准备'],
    },
    {
      id: ID.ep1Note6, apptId: ID.ep1Appt6, date: '2025-06-09', duration: 50,
      subjective: '来访者总结了这段时间的变化："以前觉得考试就是世界末日，现在觉得紧张一下也正常，考完就好了。"提到最近一次英语小测还考了班级前十，非常开心。表示觉得自己"可以了"，不太需要继续来了。感谢咨询师的帮助。',
      objective: '来访者状态良好，自信且放松。对治疗过程有清晰的回顾和总结能力。表达了独立应对的意愿和信心。无需继续咨询的临床指征。',
      assessment: '经过6次咨询，来访者的考试焦虑和社交焦虑均显著改善。三项治疗目标全部达成。来访者已掌握认知重评、腹式呼吸和渐进式暴露等应对策略，并能在日常中自主运用。家庭和学校支持系统良好。达到结案标准。',
      plan: '1. 结案：来访者和咨询师双方同意\n2. 复发预防：告知来访者如果焦虑再次加重可随时预约\n3. 建议保持思维日志的习惯\n4. 如有需要，可在下学期进行一次随访',
      summary: '结案咨询，目标全部达成，制定复发预防计划',
      tags: ['结案', '复发预防', '目标全部达成'],
    },
  ];
  for (const n of ep1Notes) {
    await sql`
      INSERT INTO session_notes (id, org_id, care_episode_id, appointment_id, client_id, counselor_id,
        note_format, session_date, duration, session_type, subjective, objective, assessment, plan,
        summary, tags, created_at)
      VALUES (${n.id}, ${ID.org}, ${ID.ep1}, ${n.apptId}, ${ID.client}, ${ID.counselor},
        'soap', ${n.date}, ${n.duration}, 'offline', ${n.subjective}, ${n.objective},
        ${n.assessment}, ${n.plan}, ${n.summary}, ${JSON.stringify(n.tags)}::jsonb,
        ${n.date + 'T15:00:00+08:00'})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // Timeline for Episode 1
  const ep1Timeline = [
    { id: ID.ep1Tl1, type: 'assessment', title: '完成PHQ-9筛查', summary: '总分8分，轻度抑郁倾向。来访者主诉以焦虑为主', at: '2025-03-10T10:30:00+08:00' },
    { id: ID.ep1Tl2, type: 'triage_decision', title: '分流决定：个体咨询', summary: '来访者主动预约，考试焦虑和社交焦虑明显，建议个体咨询（CBT取向）', at: '2025-03-10T11:00:00+08:00' },
    { id: ID.ep1Tl3, type: 'treatment_plan', title: '制定咨询方案', summary: 'CBT取向焦虑干预，计划6-8次，每周一次', at: '2025-03-17T15:00:00+08:00' },
    { id: ID.ep1Tl4, type: 'session_note', title: '第1次咨询', summary: '初次咨询，建立关系，评估焦虑模式，教授腹式呼吸', at: '2025-03-17T15:00:00+08:00' },
    { id: ID.ep1Tl5, type: 'session_note', title: '第2次咨询', summary: '认知重构训练，识别灾难化思维模式', at: '2025-03-24T15:00:00+08:00' },
    { id: ID.ep1Tl6, type: 'session_note', title: '第3次咨询', summary: '月考反馈积极，焦虑减轻，开始暴露练习', at: '2025-04-07T15:00:00+08:00' },
    { id: ID.ep1Tl7, type: 'session_note', title: '第4次咨询', summary: '暴露练习进展好，社交改善，整体信心提升', at: '2025-04-21T15:00:00+08:00' },
    { id: ID.ep1Tl8, type: 'session_note', title: '第5次咨询', summary: '期中考试焦虑应对良好，目标基本达成', at: '2025-05-12T15:00:00+08:00' },
    { id: ID.ep1Tl9, type: 'session_note', title: '第6次咨询（结案）', summary: '结案咨询，三项目标全部达成', at: '2025-06-09T15:00:00+08:00' },
    { id: ID.ep1Tl10, type: 'risk_change', title: '结案', summary: '来访者焦虑症状显著改善，双方协商结案。如有需要可随时预约。', at: '2025-06-23T16:00:00+08:00' },
  ];
  for (const e of ep1Timeline) {
    await sql`
      INSERT INTO care_timeline (id, care_episode_id, event_type, title, summary, created_by, created_at)
      VALUES (${e.id}, ${ID.ep1}, ${e.type}, ${e.title}, ${e.summary}, ${ID.counselor}, ${e.at})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  console.log('  + Episode 1: 初二焦虑（已结案，6次咨询）');

  // ═══════════════════════════════════════════════════════════════════
  // 8. Episode 2: 高一抑郁（进行中）
  //    背景：李同学升入高中后情绪持续低落，班主任发现后联系学校心理咨询中心
  //    张咨询师是之前的咨询师，了解来访者情况，主动建立新一期咨询
  //    时间线：2026-02 ~ 至今，已完成3次咨询，还在进行中
  // ═══════════════════════════════════════════════════════════════════

  await sql`
    INSERT INTO care_episodes (id, org_id, client_id, counselor_id, status, chief_complaint,
      current_risk, intervention_type, opened_at)
    VALUES (${ID.ep2}, ${ID.org}, ${ID.client}, ${ID.counselor}, 'active',
      '升入高中后持续情绪低落两个多月，对以前喜欢的事情失去兴趣，社交明显减少，成绩大幅下滑。班主任反映经常趴在桌子上，不太和同学说话。',
      'level_3', 'counseling', '2026-02-20T10:00:00+08:00')
    ON CONFLICT (id) DO NOTHING
  `;

  // Assessment result for Episode 2 (PHQ-9 score 16 = moderately severe)
  await sql`
    INSERT INTO assessment_results (id, org_id, assessment_id, user_id, care_episode_id,
      demographic_data, answers, dimension_scores, total_score, risk_level, created_at)
    VALUES (${ID.ep2Result}, ${ID.org}, ${ID.assessment}, ${ID.client}, ${ID.ep2},
      ${'{"grade":"高一","gender":"男"}'}::jsonb,
      ${JSON.stringify([2,3,2,2,1,2,2,1,1])}::jsonb,
      ${JSON.stringify([{dimensionId: ID.dim, score: 16, label: '中重度抑郁'}])}::jsonb,
      16, 'level_3', '2026-02-21T14:00:00+08:00')
    ON CONFLICT (id) DO NOTHING
  `;

  // Treatment Plan for Episode 2 (active)
  await sql`
    INSERT INTO treatment_plans (id, org_id, care_episode_id, counselor_id, status, title, approach,
      goals, interventions, session_plan, progress_notes, review_date, created_at, updated_at)
    VALUES (${ID.ep2Plan}, ${ID.org}, ${ID.ep2}, ${ID.counselor}, 'active',
      '青少年抑郁干预方案', '整合取向（CBT + 人本主义）',
      ${JSON.stringify([
        { id: demoUUID('ep2-goal-1'), description: '改善睡眠质量，恢复规律作息（晚11点前入睡，早6:30起床）', status: 'active', notes: '第3次咨询时来访者报告偶尔能做到', createdAt: '2026-02-28' },
        { id: demoUUID('ep2-goal-2'), description: '恢复至少一项课外兴趣活动（如篮球、游戏）', status: 'active', notes: '目前缺乏动力，需要进一步激活', createdAt: '2026-02-28' },
        { id: demoUUID('ep2-goal-3'), description: '每天至少与同学进行一次有意义的社交互动', status: 'active', notes: '', createdAt: '2026-02-28' },
        { id: demoUUID('ep2-goal-4'), description: '建立对高中生活的适应感，减少无助和无望认知', status: 'active', notes: '核心工作目标', createdAt: '2026-02-28' },
      ])}::jsonb,
      ${JSON.stringify([
        { id: demoUUID('ep2-int-1'), description: '行为激活：制定日常活动计划，逐步增加愉悦性活动', frequency: '每次咨询制定下周计划' },
        { id: demoUUID('ep2-int-2'), description: '认知重构：针对"我什么都做不好""高中太难了我不行"等无助信念', frequency: '每次咨询' },
        { id: demoUUID('ep2-int-3'), description: '人本主义倾听与共情：给予充分的情感支持和无条件积极关注', frequency: '每次咨询' },
        { id: demoUUID('ep2-int-4'), description: '睡眠卫生教育与作息调整', frequency: '前三次咨询重点' },
      ])}::jsonb,
      '每周一次，每次50分钟，预计12-16次。前4次重点建立关系和行为激活，中期认知工作，后期巩固和预防复发。',
      '已完成3次咨询。来访者建立了基本信任关系，能在咨询中表达情绪。行为激活方面开始有松动，周末去打了一次篮球。睡眠仍不稳定。认知层面的无助感仍然较强，需要持续工作。',
      '2026-04-25',
      '2026-02-28T15:00:00+08:00', '2026-03-28T15:00:00+08:00')
    ON CONFLICT (id) DO NOTHING
  `;

  // Appointments for Episode 2 (3 completed + 1 upcoming)
  const ep2Appts = [
    { id: ID.ep2Appt1, start: '2026-02-27T14:00:00+08:00', end: '2026-02-27T14:50:00+08:00', status: 'completed' },
    { id: ID.ep2Appt2, start: '2026-03-13T14:00:00+08:00', end: '2026-03-13T14:50:00+08:00', status: 'completed' },
    { id: ID.ep2Appt3, start: '2026-03-27T14:00:00+08:00', end: '2026-03-27T14:50:00+08:00', status: 'completed' },
    { id: ID.ep2Appt4, start: '2026-04-10T14:00:00+08:00', end: '2026-04-10T14:50:00+08:00', status: 'confirmed' },
  ];
  for (const a of ep2Appts) {
    await sql`
      INSERT INTO appointments (id, org_id, care_episode_id, client_id, counselor_id,
        start_time, end_time, status, type, source)
      VALUES (${a.id}, ${ID.org}, ${ID.ep2}, ${ID.client}, ${ID.counselor},
        ${a.start}, ${a.end}, ${a.status}, 'offline', 'counselor_manual')
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // Session Notes for Episode 2 (3 SOAP notes so far)
  const ep2Notes = [
    {
      id: ID.ep2Note1, apptId: ID.ep2Appt1, date: '2026-02-27', duration: 50,
      subjective: '来访者由班主任转介，咨询师曾在初二为其进行过焦虑咨询。来访者进入咨询室后沉默了约两分钟才开口。自述升入高中后"什么都变了"，不认识同学、课程难度大、节奏很快。觉得"怎么努力都跟不上"。初中成绩中等偏上，高中第一次月考排名年级倒数。之后开始"什么都不想做"，放学回家就躺着刷手机，以前喜欢的篮球也不打了。周末几乎不出门。晚上经常凌晨才睡，早上很难起来。觉得"活着没什么意思"，但否认有具体的自伤计划。\n\n来访者提到去年咨询帮他解决了考试焦虑，但"这次不一样，不是紧张，是什么都提不起劲"。',
      objective: '来访者面色疲惫，黑眼圈明显，语速缓慢，情绪低落。目光多数时间看地面。谈到成绩下滑时眼眶泛红但没有哭。PHQ-9得分16分（中重度抑郁），第9题（自伤想法）选1分（好几天），需关注。否认有具体的自伤计划和自杀意图，否认有既往自伤行为。安全评估结果：中等风险，需持续关注。\n\n与初二时的焦虑表现对比，当前呈现出典型的抑郁特征：快感缺失、精力下降、社交退缩、睡眠障碍、无助感。',
      assessment: '来访者目前符合中重度抑郁发作的临床表现。核心问题为高中适应困难引发的无助感和无望感，导致行为退缩和功能下降的恶性循环。与初二时的焦虑不同，当前主要是抑郁（动力和兴趣缺失），而非焦虑（过度担忧）。\n\n需要重点关注的方面：\n1. 自伤想法需每次评估监控\n2. 睡眠紊乱加剧了日间功能受损\n3. 社交退缩减少了正强化来源\n4. 与初二相比问题更严重，单纯CBT可能不够，需要整合人本主义的情感支持\n\n保护因素：有过成功的咨询经历，对咨询师有基本信任；无自伤史；家庭关系虽有张力但基本支持系统存在。',
      plan: '1. 建立安全计划：与来访者协商自伤想法的应对策略和紧急联系人\n2. 通知学校心理危机干预系统备案（level_3）\n3. 下次开始行为激活干预\n4. 睡眠卫生教育：限制晚间手机使用，固定就寝时间\n5. 家庭作业：每天记录三件做过的事情（无论大小）\n6. 建议家长沟通，了解家庭观察到的变化',
      summary: '初次咨询，重新建立关系。PHQ-9得分16分，中重度抑郁。高中适应困难为核心诱因。',
      tags: ['初次咨询', '抑郁评估', '安全评估', '转介'],
    },
    {
      id: ID.ep2Note2, apptId: ID.ep2Appt2, date: '2026-03-13', duration: 50,
      subjective: '来访者说这两周"还是差不多"，但带来了活动记录。记录显示每天基本就是上课、吃饭、刷手机、睡觉。周末有一天被老同学叫去打了一场篮球，"当时还行，回来又觉得没意思了"。睡眠有一点改善，有几天在12点前睡了，但不稳定。自伤想法这两周"偶尔有"，仍然否认有计划。\n\n提到妈妈跟他说"你初中不是好好的吗，怎么上了高中就变成这样"，觉得妈妈不理解他。爸爸基本没管。',
      objective: '来访者精神状态比首次略好，能主动展示活动记录。语速仍然偏慢。提到篮球时神情有一丝生动。谈到妈妈的话时表现出委屈和愤怒的混合情绪。自伤想法持续但无升级，安全评估维持中等风险。',
      assessment: '行为激活初期，来访者的行为模式仍然单一但出现了微小的积极变化（打篮球、偶尔改善睡眠）。篮球活动中体验到了短暂的愉悦，这是行为激活的正向信号，说明快感缺失并非完全固化。\n\n家庭因素需要关注：母亲的期望和不理解可能加剧了来访者的无助感和孤独感。"初中好好的高中就不行了"的框架对来访者是一种无形的压力。\n\n当前的治疗重点仍是行为激活和情感支持，认知工作需要在信任进一步建立后逐步引入。',
      plan: '1. 行为激活：在活动记录基础上，计划本周增加两次"可能有点开心"的活动\n2. 继续安全评估和监控\n3. 与来访者探讨与母亲的沟通方式\n4. 下次咨询开始尝试认知工作，探索"我什么都做不好"的信念\n5. 家庭作业：尝试在放学后至少有一次和同学一起做的事情（哪怕是一起走回宿舍）',
      summary: '行为激活初期，出现微小积极变化。家庭沟通问题浮现。安全风险持续监控。',
      tags: ['行为激活', '活动记录', '家庭因素', '安全监控'],
    },
    {
      id: ID.ep2Note3, apptId: ID.ep2Appt3, date: '2026-03-27', duration: 50,
      subjective: '来访者这次开口更主动。报告这两周做到了跟同桌一起去食堂吃饭（之前都是一个人），"虽然也没聊什么，但感觉没那么孤单"。又打了一次篮球，是自己主动约的。睡眠方面，有5天在12点前入睡。成绩方面最近一次小测"没有垫底了，中间偏下"。\n\n但也提到有一天晚上特别低落，觉得"就算做了这些也改变不了什么，高中还是太难了"。那天想法比较消极，但"扛过去了"。问来访者怎么扛过去的，他说"想到下周还要来这里聊聊"。\n\n提到这周妈妈问他"咨询有没有用"，他说"有吧"，妈妈没再多说。',
      objective: '来访者状态有所改善：目光接触增加，主动报告内容更多，甚至有一两次浅笑。但在谈到"高中太难"时情绪明显下沉。报告的那次严重低落值得关注——虽然他自主度过了，但说明抑郁发作仍在波动中。将咨询关系作为撑下去的理由，既是积极因素也需要注意移情管理。',
      assessment: '治疗出现初步进展：\n1. 行为激活有效——社交、运动、睡眠均有改善\n2. 来访者开始有主动性（自己约篮球、主动去食堂）\n3. 但抑郁的核心认知（"做什么都没用""高中太难了"）仍然牢固\n4. 低落发作期间能够自主应对是重要的保护因素\n5. 咨询关系已成为重要支持，需注意培养来访者的内部支持资源\n\n下一阶段重点应从行为激活转向认知工作，开始挑战"无助/无望"的核心信念。同时维持行为层面的进展。',
      plan: '1. 认知工作：用苏格拉底式提问探索"做什么都没用"的信念\n2. 引导来访者看到这三周的客观变化（社交、运动、成绩、睡眠）vs 他的信念\n3. 继续行为激活：保持运动和社交，尝试恢复一项学习习惯\n4. 安全计划回顾：肯定他应对低落发作的能力，增强自我效能\n5. 家庭作业：记录一次"我做到了"的时刻\n6. 考虑下次与家长进行一次简短沟通（需征得来访者同意）',
      summary: '行为激活见效，社交和运动改善。准备转入认知工作阶段。',
      tags: ['行为激活进展', '认知工作过渡', '治疗关系', '安全监控'],
    },
  ];
  for (const n of ep2Notes) {
    await sql`
      INSERT INTO session_notes (id, org_id, care_episode_id, appointment_id, client_id, counselor_id,
        note_format, session_date, duration, session_type, subjective, objective, assessment, plan,
        summary, tags, created_at)
      VALUES (${n.id}, ${ID.org}, ${ID.ep2}, ${n.apptId}, ${ID.client}, ${ID.counselor},
        'soap', ${n.date}, ${n.duration}, 'offline', ${n.subjective}, ${n.objective},
        ${n.assessment}, ${n.plan}, ${n.summary}, ${JSON.stringify(n.tags)}::jsonb,
        ${n.date + 'T15:00:00+08:00'})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // Timeline for Episode 2
  const ep2Timeline = [
    { id: ID.ep2Tl1, type: 'note', title: '班主任转介', summary: '班主任反映李同学近两个月情绪低落、上课注意力差、与同学交流减少，建议心理咨询', at: '2026-02-20T10:00:00+08:00' },
    { id: ID.ep2Tl2, type: 'triage_decision', title: '咨询师建立新一期咨询', summary: '张咨询师曾在初二为其进行焦虑咨询，了解来访者背景。根据班主任描述和初步电话沟通，判断需进行个体咨询评估', at: '2026-02-20T11:00:00+08:00' },
    { id: ID.ep2Tl3, type: 'assessment', title: '完成PHQ-9筛查', summary: '总分16分，中重度抑郁。第9题（自伤想法）1分，需关注', at: '2026-02-21T14:00:00+08:00' },
    { id: ID.ep2Tl4, type: 'risk_change', title: '风险等级评定：三级', summary: '根据PHQ-9结果和临床评估，评定为三级风险（中重度），启动定期安全评估', at: '2026-02-21T14:30:00+08:00' },
    { id: ID.ep2Tl5, type: 'treatment_plan', title: '制定咨询方案', summary: '整合取向（CBT+人本），计划12-16次，重点行为激活和认知重构', at: '2026-02-28T15:00:00+08:00' },
    { id: ID.ep2Tl6, type: 'session_note', title: '第1次咨询', summary: '重新建立关系，抑郁评估。制定安全计划，启动睡眠和行为记录', at: '2026-02-27T15:00:00+08:00' },
    { id: ID.ep2Tl7, type: 'session_note', title: '第2次咨询', summary: '行为激活初期，出现微小积极变化。家庭沟通问题浮现', at: '2026-03-13T15:00:00+08:00' },
    { id: ID.ep2Tl8, type: 'session_note', title: '第3次咨询', summary: '行为激活见效，社交运动改善。准备转入认知工作阶段', at: '2026-03-27T15:00:00+08:00' },
  ];
  for (const e of ep2Timeline) {
    await sql`
      INSERT INTO care_timeline (id, care_episode_id, event_type, title, summary, created_by, created_at)
      VALUES (${e.id}, ${ID.ep2}, ${e.type}, ${e.title}, ${e.summary}, ${ID.counselor}, ${e.at})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  console.log('  + Episode 2: 高一抑郁（进行中，3次咨询）');

  // 9. Group instance
  await sql`
    INSERT INTO group_instances (id, org_id, title, description, category, status, capacity, start_date, location, created_by)
    VALUES (${ID.group}, ${ID.org}, '压力管理工作坊', '学习正念减压和情绪调节技巧的6周团辅活动',
      'stress', 'recruiting', 12, CURRENT_DATE + INTERVAL '14 days', '心理咨询中心 团辅室A', ${ID.counselor})
    ON CONFLICT (id) DO NOTHING
  `;
  console.log('  + Group instance');

  // 10. Course
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
  console.log(`Client (李同学) ID: ${ID.client}`);
  console.log(`Admin ID: ${ID.admin}`);
  console.log(`Episode 1 (初二焦虑/closed): ${ID.ep1}`);
  console.log(`Episode 2 (高一抑郁/active): ${ID.ep2}`);

  await sql.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
