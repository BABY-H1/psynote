const PptxGenJS = require('pptxgenjs');
const fs = require('fs');

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_16x9';
pptx.author = 'Psynote';

// ─── Color Palette (Teal Trust — matches Psynote brand) ──────────
const C = {
  primary: '0A8A7B',    // teal (Psynote brand)
  dark: '1A2332',       // navy dark
  accent: '3B82F6',     // blue accent
  light: 'F8FAFB',      // near-white bg
  white: 'FFFFFF',
  gray: '64748B',       // slate gray
  lightGray: 'E2E8F0',
  amber: 'F59E0B',
  red: 'EF4444',
  green: '10B981',
};

const FONT = { title: 'Calibri', body: 'Calibri' };

// ─── Helper functions ────────────────────────────────────────────
function darkSlide(slide) {
  slide.background = { color: C.dark };
}
function lightSlide(slide) {
  slide.background = { color: C.light };
}

function addPageNum(slide, num, total) {
  slide.addText(`${num}/${total}`, {
    x: 9.2, y: 6.8, w: 0.8, h: 0.3,
    fontSize: 9, color: C.gray, fontFace: FONT.body, align: 'right',
  });
}

function addLogo(slide, dark) {
  slide.addText('Psynote', {
    x: 0.4, y: 0.3, w: 1.5, h: 0.4,
    fontSize: 16, bold: true,
    color: dark ? C.white : C.primary,
    fontFace: FONT.title,
  });
}

const TOTAL = 16;

// ═══════════════════════════════════════════════════════════════════
// SLIDE 1: Title
// ═══════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  darkSlide(s);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 7.5, fill: { color: C.dark } });
  // Accent bar
  s.addShape(pptx.ShapeType.rect, { x: 0.4, y: 2.2, w: 0.06, h: 1.8, fill: { color: C.primary } });

  s.addText('Psynote', {
    x: 0.4, y: 0.5, w: 5, h: 0.6,
    fontSize: 28, bold: true, color: C.primary, fontFace: FONT.title,
  });

  s.addText('面向心理服务机构的\nAI 原生专业工作台', {
    x: 0.7, y: 2.2, w: 8, h: 1.2,
    fontSize: 36, bold: true, color: C.white, fontFace: FONT.title, lineSpacingMultiple: 1.3,
  });

  s.addText('先切记录、测评、督导与合规归档，\n再沉淀心理服务过程数据与专业智能基础设施。', {
    x: 0.7, y: 3.6, w: 7, h: 0.9,
    fontSize: 14, color: C.gray, fontFace: FONT.body, lineSpacingMultiple: 1.5,
  });

  s.addText('种子轮融资  |  2026 年 4 月', {
    x: 0.7, y: 5.0, w: 4, h: 0.4,
    fontSize: 12, color: C.primary, fontFace: FONT.body,
  });
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 2: Problem
// ═══════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  lightSlide(s);
  addLogo(s, false);
  addPageNum(s, 2, TOTAL);

  s.addText('01', { x: 0.4, y: 0.7, w: 0.5, h: 0.3, fontSize: 11, color: C.primary, fontFace: FONT.body });
  s.addText('心理服务行业不缺工具，缺的是一条完整的工作流', {
    x: 0.4, y: 1.0, w: 9, h: 0.5,
    fontSize: 22, bold: true, color: C.dark, fontFace: FONT.title,
  });

  const problems = [
    ['会谈记录', 'Word / 微信 / 手写', '格式不统一，无法复用'],
    ['测评工具', '问卷星 / 第三方平台', '数据与个案脱节'],
    ['督导与计划', '线下会议 / 口头沟通', '无法追踪与留痕'],
    ['合规归档', 'Excel + 人工流程', '权限、审计几乎为零'],
  ];

  problems.forEach((p, i) => {
    const y = 1.8 + i * 1.0;
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.5, y, w: 9, h: 0.85,
      fill: { color: C.white },
      shadow: { type: 'outer', blur: 4, offset: 1, color: 'D0D0D0' },
      rectRadius: 0.1,
    });
    s.addText(p[0], { x: 0.8, y: y + 0.1, w: 1.8, h: 0.3, fontSize: 14, bold: true, color: C.dark, fontFace: FONT.title });
    s.addText(p[1], { x: 0.8, y: y + 0.45, w: 1.8, h: 0.25, fontSize: 10, color: C.gray, fontFace: FONT.body });
    s.addText(p[2], { x: 3.0, y: y + 0.2, w: 6, h: 0.4, fontSize: 12, color: C.red, fontFace: FONT.body });
  });

  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.5, y: 5.8, w: 9, h: 0.9,
    fill: { color: 'E6F5F3' },
    rectRadius: 0.1,
    line: { color: C.primary, width: 1 },
  });
  s.addText('我们的判断：AI 会加速功能复制。长期更值钱的，不是某个按钮，而是谁先控制关键工作流、关键数据结构和机构信任。', {
    x: 0.8, y: 5.9, w: 8.4, h: 0.7,
    fontSize: 11, color: C.dark, fontFace: FONT.body, italic: true,
  });
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 3: Timing / Policy
// ═══════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  lightSlide(s);
  addLogo(s, false);
  addPageNum(s, 3, TOTAL);

  s.addText('02', { x: 0.4, y: 0.7, w: 0.5, h: 0.3, fontSize: 11, color: C.primary, fontFace: FONT.body });
  s.addText('为什么是现在：两份重磅政策 48 小时内密集落地', {
    x: 0.4, y: 1.0, w: 9, h: 0.5,
    fontSize: 22, bold: true, color: C.dark, fontFace: FONT.title,
  });

  // Left card
  s.addShape(pptx.ShapeType.roundRect, { x: 0.4, y: 1.7, w: 4.3, h: 3.5, fill: { color: C.white }, rectRadius: 0.1, shadow: { type: 'outer', blur: 4, offset: 1, color: 'D0D0D0' } });
  s.addText('2026.4.9 | 25部门联合发布', { x: 0.7, y: 1.85, w: 3.8, h: 0.3, fontSize: 10, color: C.primary, fontFace: FONT.body, bold: true });
  s.addText('《健全社会心理服务体系和\n危机干预机制实施方案》', { x: 0.7, y: 2.15, w: 3.8, h: 0.6, fontSize: 13, color: C.dark, fontFace: FONT.title, bold: true });
  s.addText('• 80%以上社区设置心理咨询室\n• 所有学校建立心理监测预警体系\n• 各省建成12356平台\n\n→ 数十万新增服务点需要数字化基础设施', {
    x: 0.7, y: 2.85, w: 3.8, h: 2.0, fontSize: 11, color: C.gray, fontFace: FONT.body, lineSpacingMultiple: 1.4,
  });

  // Right card
  s.addShape(pptx.ShapeType.roundRect, { x: 5.3, y: 1.7, w: 4.3, h: 3.5, fill: { color: C.white }, rectRadius: 0.1, shadow: { type: 'outer', blur: 4, offset: 1, color: 'D0D0D0' } });
  s.addText('2026.4.10 | 教育部等5部门', { x: 5.6, y: 1.85, w: 3.8, h: 0.3, fontSize: 10, color: C.accent, fontFace: FONT.body, bold: true });
  s.addText('《"人工智能+教育"\n行动计划》', { x: 5.6, y: 2.15, w: 3.8, h: 0.6, fontSize: 13, color: C.dark, fontFace: FONT.title, bold: true });
  s.addText('• 集成心理健康大模型\n• AI赋能教育全过程\n• 遴选优质成熟智能应用\n\n→ 先跑出数据的产品占据先发优势', {
    x: 5.6, y: 2.85, w: 3.8, h: 2.0, fontSize: 11, color: C.gray, fontFace: FONT.body, lineSpacingMultiple: 1.4,
  });

  // Bottom highlight
  s.addShape(pptx.ShapeType.roundRect, { x: 0.4, y: 5.5, w: 9.2, h: 0.7, fill: { color: C.primary }, rectRadius: 0.1 });
  s.addText('窗口期 6-12 个月：从政策发布到地方落地招标，先进入工作流的产品将建立先发壁垒。', {
    x: 0.6, y: 5.55, w: 8.8, h: 0.6, fontSize: 13, color: C.white, fontFace: FONT.body, bold: true, align: 'center',
  });
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 4: Product Overview (6 modules)
// ═══════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  lightSlide(s);
  addLogo(s, false);
  addPageNum(s, 4, TOTAL);

  s.addText('03', { x: 0.4, y: 0.7, w: 0.5, h: 0.3, fontSize: 11, color: C.primary, fontFace: FONT.body });
  s.addText('一套贯穿「评估—干预—交付—复盘」的 AI 工作台', {
    x: 0.4, y: 1.0, w: 9, h: 0.5,
    fontSize: 22, bold: true, color: C.dark, fontFace: FONT.title,
  });

  const modules = [
    ['01', 'AI 会谈记录', '音频/文本转写与结构化，自动生成\nSOAP/DAP 记录与干预建议'],
    ['02', '测评追踪与 AI 解读', '量表分发、评分、报告生成与\n风险等级追踪，连接个案主线'],
    ['03', '督导与治疗计划', '目标进展追踪、督导辅助、\nAI 方案共创，记录到行动闭环'],
    ['04', '知识库与课程设计', '治疗目标库、团辅模板、\nAI 辅助生成方案与课程教案'],
    ['05', '合规与机构管理', '知情同意、审计日志、多机构隔离、\n角色权限与归档留痕'],
    ['06', '来访者门户', '预约、测评、进度查看，让来访者\n成为工作流的一部分'],
  ];

  modules.forEach((m, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.4 + col * 3.1;
    const y = 1.7 + row * 2.4;

    s.addShape(pptx.ShapeType.roundRect, { x, y, w: 2.9, h: 2.1, fill: { color: C.white }, rectRadius: 0.1, shadow: { type: 'outer', blur: 4, offset: 1, color: 'D0D0D0' } });
    s.addText(m[0], { x: x + 0.15, y: y + 0.15, w: 0.4, h: 0.35, fontSize: 12, color: C.white, fontFace: FONT.body, bold: true, fill: { color: C.primary }, align: 'center', valign: 'middle' });
    s.addText(m[1], { x: x + 0.65, y: y + 0.15, w: 2.1, h: 0.35, fontSize: 13, color: C.dark, fontFace: FONT.title, bold: true });
    s.addText(m[2], { x: x + 0.15, y: y + 0.65, w: 2.6, h: 1.2, fontSize: 10, color: C.gray, fontFace: FONT.body, lineSpacingMultiple: 1.4 });
  });
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 5: ★ NEW — Product Demo (placeholder for screenshots)
// ═══════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  lightSlide(s);
  addLogo(s, false);
  addPageNum(s, 5, TOTAL);

  s.addText('04', { x: 0.4, y: 0.7, w: 0.5, h: 0.3, fontSize: 11, color: C.primary, fontFace: FONT.body });
  s.addText('产品实况：1.0 已完成，不是 PPT 创业', {
    x: 0.4, y: 1.0, w: 9, h: 0.5,
    fontSize: 22, bold: true, color: C.dark, fontFace: FONT.title,
  });

  // Three screenshot placeholder cards
  const demos = [
    ['管理员仪表盘', '机构运营一目了然：活跃咨询师、来访者、\n待办事项、通知，管理员每日决策入口'],
    ['协作中心 · 派单', '未分配来访者 → 选咨询师 → 一键分配\n临时授权、督导审阅、转介接收四合一'],
    ['来访者门户 · 预约', '来访者浏览服务 → 选时段 → 提交预约\n复诊自动推荐上次咨询师'],
  ];

  demos.forEach((d, i) => {
    const x = 0.4 + i * 3.15;
    // Screenshot placeholder
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.7, w: 2.95, h: 3.2,
      fill: { color: C.lightGray },
      rectRadius: 0.1,
      line: { color: C.lightGray, width: 1, dashType: 'dash' },
    });
    s.addText('[ 产品截图 ]', {
      x, y: 2.8, w: 2.95, h: 0.4,
      fontSize: 12, color: C.gray, fontFace: FONT.body, align: 'center', italic: true,
    });
    // Caption
    s.addText(d[0], { x, y: 5.1, w: 2.95, h: 0.35, fontSize: 13, bold: true, color: C.dark, fontFace: FONT.title });
    s.addText(d[1], { x, y: 5.45, w: 2.95, h: 0.8, fontSize: 9.5, color: C.gray, fontFace: FONT.body, lineSpacingMultiple: 1.4 });
  });

  s.addText('注：截图为实际运行系统，非设计稿。产品已完成全栈开发，AI 已集成系统。', {
    x: 0.4, y: 6.6, w: 9, h: 0.3,
    fontSize: 9, color: C.primary, fontFace: FONT.body, italic: true,
  });
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 6: Workflow
// ═══════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  lightSlide(s);
  addLogo(s, false);
  addPageNum(s, 6, TOTAL);

  s.addText('05', { x: 0.4, y: 0.7, w: 0.5, h: 0.3, fontSize: 11, color: C.primary, fontFace: FONT.body });
  s.addText('不是功能堆叠，而是一条被 AI 重写的专业工作流', {
    x: 0.4, y: 1.0, w: 9, h: 0.5,
    fontSize: 22, bold: true, color: C.dark, fontFace: FONT.title,
  });

  // Workflow steps
  const steps = ['来访接入', '知情同意', '会谈记录', '测评/风险', '督导/计划', '归档/审计', '机构视图'];
  steps.forEach((st, i) => {
    const x = 0.3 + i * 1.32;
    s.addShape(pptx.ShapeType.roundRect, { x, y: 1.7, w: 1.15, h: 0.55, fill: { color: C.primary }, rectRadius: 0.06 });
    s.addText(st, { x, y: 1.72, w: 1.15, h: 0.5, fontSize: 9, color: C.white, fontFace: FONT.body, align: 'center', valign: 'middle', bold: true });
    if (i < steps.length - 1) {
      s.addText('→', { x: x + 1.15, y: 1.72, w: 0.17, h: 0.5, fontSize: 12, color: C.primary, fontFace: FONT.body, align: 'center', valign: 'middle' });
    }
  });

  // Three layers
  const layers = [
    ['AI 生成层', '量表创建、协议生成、团辅方案、课程蓝图、模板导入与结构化解析', C.accent],
    ['AI 辅助层', '写记录、解读测评、推荐治疗目标、修改方案、支持督导与陪练', C.primary],
    ['系统底座', '多机构隔离、角色权限、审计日志、电子签署快照、门户与成员管理', C.dark],
  ];
  layers.forEach((l, i) => {
    const y = 2.7 + i * 1.15;
    s.addShape(pptx.ShapeType.roundRect, { x: 0.4, y, w: 9.2, h: 0.95, fill: { color: i === 0 ? 'EBF0FF' : i === 1 ? 'E6F5F3' : 'ECEEF2' }, rectRadius: 0.08, line: { color: l[2], width: 0.5 } });
    s.addText(l[0], { x: 0.6, y: y + 0.1, w: 1.6, h: 0.35, fontSize: 12, bold: true, color: l[2], fontFace: FONT.title });
    s.addText(l[1], { x: 0.6, y: y + 0.45, w: 8.5, h: 0.35, fontSize: 10, color: C.gray, fontFace: FONT.body });
  });

  s.addText('价值不在单个生成动作，而在这些动作都能直接进入后续工作流。', {
    x: 0.4, y: 6.3, w: 9, h: 0.4,
    fontSize: 12, color: C.dark, fontFace: FONT.body, italic: true, bold: true,
  });
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 7: Moats + Compliance (enhanced)
// ═══════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  lightSlide(s);
  addLogo(s, false);
  addPageNum(s, 7, TOTAL);

  s.addText('06', { x: 0.4, y: 0.7, w: 0.5, h: 0.3, fontSize: 11, color: C.primary, fontFace: FONT.body });
  s.addText('壁垒不在单点功能，而在四层复合优势', {
    x: 0.4, y: 1.0, w: 9, h: 0.5,
    fontSize: 22, bold: true, color: C.dark, fontFace: FONT.title,
  });

  const moats = [
    ['工作流壁垒', '记录、测评、督导、课程、团辅、协议与归档在同一系统内发生。切换成本随使用深度指数增长。'],
    ['数据结构壁垒', '沉淀主诉、风险、维度分布、目标进展、课程/团辅参与等过程数据。数据越多，AI 越准，产品越难替代。'],
    ['合规与信任壁垒', '符合《个人信息保护法》敏感个人信息处理要求，电子签署、审计日志、机构隔离、RBAC 权限，支持等保扩展。'],
    ['行业嵌入壁垒', '从心理服务真实工作流出发设计，专业场景的理解深度无法被快速复制。'],
  ];

  moats.forEach((m, i) => {
    const y = 1.7 + i * 1.2;
    s.addShape(pptx.ShapeType.roundRect, { x: 0.4, y, w: 9.2, h: 1.0, fill: { color: C.white }, rectRadius: 0.1, shadow: { type: 'outer', blur: 3, offset: 1, color: 'E0E0E0' } });
    s.addText((i + 1).toString(), { x: 0.55, y: y + 0.2, w: 0.4, h: 0.4, fontSize: 16, color: C.white, fontFace: FONT.title, bold: true, fill: { color: C.primary }, align: 'center', valign: 'middle' });
    s.addText(m[0], { x: 1.1, y: y + 0.1, w: 2, h: 0.35, fontSize: 13, bold: true, color: C.dark, fontFace: FONT.title });
    s.addText(m[1], { x: 1.1, y: y + 0.45, w: 8, h: 0.45, fontSize: 10, color: C.gray, fontFace: FONT.body });
  });

  s.addText('在 AI 时代，功能壁垒衰减更快；工作流、数据和信任壁垒集中更快。', {
    x: 0.4, y: 6.3, w: 9, h: 0.4,
    fontSize: 12, color: C.dark, fontFace: FONT.body, italic: true, bold: true,
  });
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 8: Market & Competition
// ═══════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  lightSlide(s);
  addLogo(s, false);
  addPageNum(s, 8, TOTAL);

  s.addText('07', { x: 0.4, y: 0.7, w: 0.5, h: 0.3, fontSize: 11, color: C.primary, fontFace: FONT.body });
  s.addText('市场高度分散，AI-native 工作台仍在被定义', {
    x: 0.4, y: 1.0, w: 9, h: 0.5,
    fontSize: 22, bold: true, color: C.dark, fontFace: FONT.title,
  });

  // Stats
  const stats = [
    ['10万+', '全国心理咨询企业'],
    ['45亿', '数字化心理健康市场'],
    ['25万+', 'SimplePractice 海外付费'],
  ];
  stats.forEach((st, i) => {
    const x = 0.4 + i * 3.15;
    s.addShape(pptx.ShapeType.roundRect, { x, y: 1.7, w: 2.95, h: 1.2, fill: { color: C.white }, rectRadius: 0.1, shadow: { type: 'outer', blur: 3, offset: 1, color: 'E0E0E0' } });
    s.addText(st[0], { x, y: 1.8, w: 2.95, h: 0.5, fontSize: 28, bold: true, color: C.primary, fontFace: FONT.title, align: 'center' });
    s.addText(st[1], { x, y: 2.35, w: 2.95, h: 0.35, fontSize: 10, color: C.gray, fontFace: FONT.body, align: 'center' });
  });

  // Competition table
  s.addText('竞争格局', { x: 0.4, y: 3.2, w: 3, h: 0.4, fontSize: 14, bold: true, color: C.dark, fontFace: FONT.title });

  const competitors = [
    ['机构管理 SaaS', '素心理 / 优易联', '功能局部，非 AI-native'],
    ['学校心理平台', '知心意等', '场景绑定，难跨机构类型'],
    ['海外对标', 'SimplePractice', '已验证模式，非中国市场'],
  ];
  competitors.forEach((c, i) => {
    const y = 3.7 + i * 0.6;
    const bg = i % 2 === 0 ? C.light : C.white;
    s.addShape(pptx.ShapeType.rect, { x: 0.4, y, w: 9.2, h: 0.55, fill: { color: bg } });
    s.addText(c[0], { x: 0.6, y, w: 2.2, h: 0.55, fontSize: 11, color: C.dark, fontFace: FONT.body, bold: true, valign: 'middle' });
    s.addText(c[1], { x: 2.8, y, w: 3, h: 0.55, fontSize: 11, color: C.gray, fontFace: FONT.body, valign: 'middle' });
    s.addText(c[2], { x: 5.8, y, w: 3.6, h: 0.55, fontSize: 11, color: C.red, fontFace: FONT.body, valign: 'middle' });
  });

  s.addShape(pptx.ShapeType.roundRect, { x: 0.4, y: 5.8, w: 9.2, h: 0.6, fill: { color: 'E6F5F3' }, rectRadius: 0.08, line: { color: C.primary, width: 0.5 } });
  s.addText('结论：市场不是空白，但 AI-native 的统一机构工作台尚未出现。定义权仍在争夺中。', {
    x: 0.6, y: 5.85, w: 8.8, h: 0.5, fontSize: 11, color: C.dark, fontFace: FONT.body, italic: true,
  });
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 9: ★ NEW — Customer Validation & GTM
// ═══════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  lightSlide(s);
  addLogo(s, false);
  addPageNum(s, 9, TOTAL);

  s.addText('08', { x: 0.4, y: 0.7, w: 0.5, h: 0.3, fontSize: 11, color: C.primary, fontFace: FONT.body });
  s.addText('客户验证与获客策略', {
    x: 0.4, y: 1.0, w: 9, h: 0.5,
    fontSize: 22, bold: true, color: C.dark, fontFace: FONT.title,
  });

  // User pain quotes
  s.addText('来自一线的声音', { x: 0.4, y: 1.7, w: 4, h: 0.35, fontSize: 14, bold: true, color: C.dark, fontFace: FONT.title });

  const quotes = [
    ['"每周花 3+ 小时整理会谈记录，格式每家机构都不一样。"', '— 社区心理咨询师'],
    ['"测评结果和个案记录完全脱节，做报告要手动拼数据。"', '— 高校心理中心主任'],
    ['"督导全靠口头交流，离职后经验全部流失。"', '— 机构负责人'],
  ];
  quotes.forEach((q, i) => {
    const y = 2.2 + i * 0.85;
    s.addShape(pptx.ShapeType.roundRect, { x: 0.5, y, w: 4.5, h: 0.7, fill: { color: C.white }, rectRadius: 0.08 });
    s.addText(q[0], { x: 0.7, y: y + 0.05, w: 4.1, h: 0.35, fontSize: 10, color: C.dark, fontFace: FONT.body, italic: true });
    s.addText(q[1], { x: 0.7, y: y + 0.4, w: 4.1, h: 0.25, fontSize: 9, color: C.gray, fontFace: FONT.body });
  });

  // GTM strategy
  s.addText('获客路径', { x: 5.3, y: 1.7, w: 4, h: 0.35, fontSize: 14, bold: true, color: C.dark, fontFace: FONT.title });

  const gtm = [
    ['学术网络', '通过专家顾问团队的学术圈层\n触达高校与培训机构'],
    ['政策红利', '跟进地方落地招标，切入学校\n与社区心理服务站建设'],
    ['社群口碑', '心理咨询师行业社群、行业会议\n展示，种子用户裂变推荐'],
    ['内容获客', '专业内容（督导技巧、AI 应用）\n建立行业影响力与信任'],
  ];
  gtm.forEach((g, i) => {
    const y = 2.2 + i * 1.05;
    s.addShape(pptx.ShapeType.roundRect, { x: 5.4, y, w: 4.2, h: 0.85, fill: { color: C.white }, rectRadius: 0.08, shadow: { type: 'outer', blur: 3, offset: 1, color: 'E0E0E0' } });
    s.addText(g[0], { x: 5.6, y: y + 0.08, w: 1.2, h: 0.3, fontSize: 11, bold: true, color: C.primary, fontFace: FONT.title });
    s.addText(g[1], { x: 5.6, y: y + 0.35, w: 3.8, h: 0.45, fontSize: 9.5, color: C.gray, fontFace: FONT.body, lineSpacingMultiple: 1.3 });
  });

  s.addText('首批试点：3 所高校心理中心 + 2 家社区心理咨询室，已在排期对接中', {
    x: 0.4, y: 6.4, w: 9, h: 0.3,
    fontSize: 10, color: C.primary, fontFace: FONT.body, italic: true, bold: true,
  });
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 10: Business Model
// ═══════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  lightSlide(s);
  addLogo(s, false);
  addPageNum(s, 10, TOTAL);

  s.addText('09', { x: 0.4, y: 0.7, w: 0.5, h: 0.3, fontSize: 11, color: C.primary, fontFace: FONT.body });
  s.addText('商业化路径：先验证 PMF，再放大收入', {
    x: 0.4, y: 1.0, w: 9, h: 0.5,
    fontSize: 22, bold: true, color: C.dark, fontFace: FONT.title,
  });

  // Phase 1
  s.addShape(pptx.ShapeType.roundRect, { x: 0.4, y: 1.7, w: 4.4, h: 2.8, fill: { color: C.white }, rectRadius: 0.1, shadow: { type: 'outer', blur: 3, offset: 1, color: 'E0E0E0' } });
  s.addText('阶段一：验证层', { x: 0.6, y: 1.85, w: 4, h: 0.35, fontSize: 14, bold: true, color: C.primary, fontFace: FONT.title });
  s.addText('小机构 / 小团队\n年费 ¥3,000–5,000\n决策快、试错成本低', { x: 0.6, y: 2.3, w: 4, h: 1.0, fontSize: 11, color: C.gray, fontFace: FONT.body, lineSpacingMultiple: 1.5 });
  s.addText('100家 × ¥5,000 = ¥50万 ARR', { x: 0.6, y: 3.5, w: 4, h: 0.4, fontSize: 13, bold: true, color: C.dark, fontFace: FONT.title });

  // Phase 2
  s.addShape(pptx.ShapeType.roundRect, { x: 5.2, y: 1.7, w: 4.4, h: 2.8, fill: { color: C.white }, rectRadius: 0.1, shadow: { type: 'outer', blur: 3, offset: 1, color: 'E0E0E0' } });
  s.addText('阶段二：放大层', { x: 5.4, y: 1.85, w: 4, h: 0.35, fontSize: 14, bold: true, color: C.accent, fontFace: FONT.title });
  s.addText('学校 / 高校 / 中型机构\n年费 ¥50,000–200,000\n政策驱动的刚性需求', { x: 5.4, y: 2.3, w: 4, h: 1.0, fontSize: 11, color: C.gray, fontFace: FONT.body, lineSpacingMultiple: 1.5 });
  s.addText('100家 × ¥5万 = ¥500万 ARR', { x: 5.4, y: 3.5, w: 4, h: 0.4, fontSize: 13, bold: true, color: C.dark, fontFace: FONT.title });

  // Revenue structure
  s.addText('收入结构', { x: 0.4, y: 4.8, w: 3, h: 0.35, fontSize: 14, bold: true, color: C.dark, fontFace: FONT.title });
  const revItems = [
    ['机构订阅', '基础年费 + 席位费'],
    ['AI 增值包', '高频 AI · 督导 · 知识库增强'],
    ['专业服务', '模板共创 · 流程梳理 · 培训'],
  ];
  revItems.forEach((r, i) => {
    const x = 0.4 + i * 3.15;
    s.addShape(pptx.ShapeType.roundRect, { x, y: 5.2, w: 2.95, h: 0.7, fill: { color: 'E6F5F3' }, rectRadius: 0.08 });
    s.addText(r[0], { x: x + 0.15, y: 5.25, w: 2.65, h: 0.3, fontSize: 11, bold: true, color: C.primary, fontFace: FONT.title });
    s.addText(r[1], { x: x + 0.15, y: 5.52, w: 2.65, h: 0.3, fontSize: 9.5, color: C.gray, fontFace: FONT.body });
  });

  s.addText('上行空间来自 ACV 升级 + 多产品扩展，而不只是席位收费。', {
    x: 0.4, y: 6.3, w: 9, h: 0.3, fontSize: 10, color: C.gray, fontFace: FONT.body, italic: true,
  });
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 11: Traction & Milestones
// ═══════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  lightSlide(s);
  addLogo(s, false);
  addPageNum(s, 11, TOTAL);

  s.addText('10', { x: 0.4, y: 0.7, w: 0.5, h: 0.3, fontSize: 11, color: C.primary, fontFace: FONT.body });
  s.addText('当前进展与未来 12 个月里程碑', {
    x: 0.4, y: 1.0, w: 9, h: 0.5,
    fontSize: 22, bold: true, color: C.dark, fontFace: FONT.title,
  });

  // Done
  s.addShape(pptx.ShapeType.roundRect, { x: 0.4, y: 1.7, w: 4.4, h: 2.5, fill: { color: 'E6F9F1' }, rectRadius: 0.1, line: { color: C.green, width: 0.5 } });
  s.addText('✓ 已完成', { x: 0.6, y: 1.8, w: 2, h: 0.35, fontSize: 14, bold: true, color: C.green, fontFace: FONT.title });
  s.addText('• 产品 1.0 全栈开发完成，核心主线可运行\n• AI 能力已集成系统（非外挂 Demo）\n• 机构管理端完整：协作中心 + 仪表盘 + 设置\n• 来访者门户：预约 + 测评 + 进度查看\n• 首批试点机构与咨询师已在排期', {
    x: 0.6, y: 2.2, w: 4, h: 1.8, fontSize: 10, color: C.dark, fontFace: FONT.body, lineSpacingMultiple: 1.5,
  });

  // Timeline
  const milestones = [
    ['Q2 2026', '云端上线，首批 5-15 家试点启动'],
    ['Q3 2026', '验证使用强度，形成首个标准付费包'],
    ['Q4 2026', '锁定目标客户类型，拿到 2-3 个付费案例'],
    ['Q1 2027', '建立样板案例，验证续费信号'],
  ];
  milestones.forEach((m, i) => {
    const y = 1.7 + i * 0.62;
    s.addShape(pptx.ShapeType.roundRect, { x: 5.2, y, w: 4.4, h: 0.52, fill: { color: C.white }, rectRadius: 0.06, shadow: { type: 'outer', blur: 2, offset: 1, color: 'E8E8E8' } });
    s.addText(m[0], { x: 5.35, y, w: 1.2, h: 0.52, fontSize: 10, bold: true, color: C.primary, fontFace: FONT.body, valign: 'middle' });
    s.addText(m[1], { x: 6.5, y, w: 3, h: 0.52, fontSize: 10, color: C.dark, fontFace: FONT.body, valign: 'middle' });
  });
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 12: Team (enhanced)
// ═══════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  lightSlide(s);
  addLogo(s, false);
  addPageNum(s, 12, TOTAL);

  s.addText('11', { x: 0.4, y: 0.7, w: 0.5, h: 0.3, fontSize: 11, color: C.primary, fontFace: FONT.body });
  s.addText('团队：专业背景 × 行业深度 × 产品能力', {
    x: 0.4, y: 1.0, w: 9, h: 0.5,
    fontSize: 22, bold: true, color: C.dark, fontFace: FONT.title,
  });

  // Founder
  s.addShape(pptx.ShapeType.roundRect, { x: 0.4, y: 1.7, w: 4.4, h: 3.0, fill: { color: C.white }, rectRadius: 0.1, shadow: { type: 'outer', blur: 3, offset: 1, color: 'E0E0E0' } });
  s.addText('创始人 / CEO', { x: 0.6, y: 1.8, w: 2, h: 0.3, fontSize: 10, color: C.primary, fontFace: FONT.body, bold: true });
  s.addText('何韵涵', { x: 0.6, y: 2.1, w: 4, h: 0.4, fontSize: 18, bold: true, color: C.dark, fontFace: FONT.title });
  s.addText('• 心理学本硕（西南大学 + 深圳大学）\n• 深耕青少年心理健康领域，发表多篇专业文章\n• 主导过政府、学校心理服务项目的方案设计与交付\n• 独立完成 Psynote 产品架构设计与全栈开发\n• 从行业一线出发定义产品，而非从技术出发猜测需求', {
    x: 0.6, y: 2.55, w: 4, h: 2.0, fontSize: 10, color: C.gray, fontFace: FONT.body, lineSpacingMultiple: 1.5,
  });

  // Advisor
  s.addShape(pptx.ShapeType.roundRect, { x: 5.2, y: 1.7, w: 4.4, h: 3.0, fill: { color: C.white }, rectRadius: 0.1, shadow: { type: 'outer', blur: 3, offset: 1, color: 'E0E0E0' } });
  s.addText('首席专家顾问', { x: 5.4, y: 1.8, w: 2, h: 0.3, fontSize: 10, color: C.primary, fontFace: FONT.body, bold: true });
  s.addText('汤永隆 教授', { x: 5.4, y: 2.1, w: 4, h: 0.4, fontSize: 18, bold: true, color: C.dark, fontFace: FONT.title });
  s.addText('• 西南大学心理学部教授\n• 应用心理系主任 · 心理咨询中心主任\n• 日本广岛大学心理学博士\n• 从事心理学科研与咨询 30 余年\n• 为 Psynote 提供专业架构与行业资源支持', {
    x: 5.4, y: 2.55, w: 4, h: 2.0, fontSize: 10, color: C.gray, fontFace: FONT.body, lineSpacingMultiple: 1.5,
  });

  // Hiring plan (NEW)
  s.addShape(pptx.ShapeType.roundRect, { x: 0.4, y: 5.0, w: 9.2, h: 1.2, fill: { color: 'E6F5F3' }, rectRadius: 0.1, line: { color: C.primary, width: 0.5 } });
  s.addText('融资后团队扩展计划', { x: 0.6, y: 5.1, w: 4, h: 0.3, fontSize: 12, bold: true, color: C.primary, fontFace: FONT.title });
  s.addText('优先招聘：1 名全栈工程师（产品迭代加速）+ 1 名客户成功经理（试点跟进与留存）\n第二优先：1 名销售/BD（政策类客户拓展）', {
    x: 0.6, y: 5.45, w: 8.5, h: 0.65, fontSize: 10, color: C.dark, fontFace: FONT.body, lineSpacingMultiple: 1.4,
  });
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 13: ★ NEW — Financial Projections
// ═══════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  lightSlide(s);
  addLogo(s, false);
  addPageNum(s, 13, TOTAL);

  s.addText('12', { x: 0.4, y: 0.7, w: 0.5, h: 0.3, fontSize: 11, color: C.primary, fontFace: FONT.body });
  s.addText('财务预测与单位经济', {
    x: 0.4, y: 1.0, w: 9, h: 0.5,
    fontSize: 22, bold: true, color: C.dark, fontFace: FONT.title,
  });

  // Burn rate
  s.addShape(pptx.ShapeType.roundRect, { x: 0.4, y: 1.7, w: 4.4, h: 2.3, fill: { color: C.white }, rectRadius: 0.1, shadow: { type: 'outer', blur: 3, offset: 1, color: 'E0E0E0' } });
  s.addText('资金使用与 Burn Rate', { x: 0.6, y: 1.8, w: 4, h: 0.35, fontSize: 14, bold: true, color: C.dark, fontFace: FONT.title });
  s.addText('• 融资额：100-150 万元\n• 月均 burn rate：~10 万/月\n• Runway：12-15 个月\n• 盈亏平衡点：~60 家付费客户\n  （按 ¥5,000/年 + 团队3人估算）', {
    x: 0.6, y: 2.2, w: 4, h: 1.6, fontSize: 10.5, color: C.gray, fontFace: FONT.body, lineSpacingMultiple: 1.5,
  });

  // Unit economics
  s.addShape(pptx.ShapeType.roundRect, { x: 5.2, y: 1.7, w: 4.4, h: 2.3, fill: { color: C.white }, rectRadius: 0.1, shadow: { type: 'outer', blur: 3, offset: 1, color: 'E0E0E0' } });
  s.addText('单位经济目标', { x: 5.4, y: 1.8, w: 4, h: 0.35, fontSize: 14, bold: true, color: C.dark, fontFace: FONT.title });

  const metrics = [
    ['ACV（年均合同额）', '¥5,000 → ¥50,000'],
    ['CAC（获客成本）', '< ¥2,000（社群+学术）'],
    ['LTV/CAC 目标', '> 3x'],
    ['试点→付费转化率', '> 30%'],
  ];
  metrics.forEach((m, i) => {
    const y = 2.25 + i * 0.42;
    s.addText(m[0], { x: 5.4, y, w: 2.5, h: 0.35, fontSize: 10, color: C.gray, fontFace: FONT.body, valign: 'middle' });
    s.addText(m[1], { x: 7.9, y, w: 1.6, h: 0.35, fontSize: 10, bold: true, color: C.dark, fontFace: FONT.body, valign: 'middle', align: 'right' });
  });

  // Timeline to next round
  s.addText('下一轮时机', { x: 0.4, y: 4.3, w: 3, h: 0.35, fontSize: 14, bold: true, color: C.dark, fontFace: FONT.title });

  s.addShape(pptx.ShapeType.roundRect, { x: 0.4, y: 4.7, w: 9.2, h: 1.2, fill: { color: 'EEF2FF' }, rectRadius: 0.1, line: { color: C.accent, width: 0.5 } });
  s.addText('12 个月后需要证明的 4 件事', { x: 0.6, y: 4.8, w: 4, h: 0.3, fontSize: 11, bold: true, color: C.accent, fontFace: FONT.title });

  const proofs = ['首个可重复 ACV 区间', '试点转付费率 > 30%', '单客户服务成本可控', '续费或扩模块意愿'];
  proofs.forEach((p, i) => {
    const x = 0.6 + i * 2.25;
    s.addText((i + 1) + '. ' + p, { x, y: 5.15, w: 2.1, h: 0.5, fontSize: 9.5, color: C.dark, fontFace: FONT.body });
  });
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 14: Fundraise Ask
// ═══════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  lightSlide(s);
  addLogo(s, false);
  addPageNum(s, 14, TOTAL);

  s.addText('13', { x: 0.4, y: 0.7, w: 0.5, h: 0.3, fontSize: 11, color: C.primary, fontFace: FONT.body });
  s.addText('本轮融资：种子轮 100-150 万元', {
    x: 0.4, y: 1.0, w: 9, h: 0.5,
    fontSize: 22, bold: true, color: C.dark, fontFace: FONT.title,
  });

  s.addText('核心目标：12 个月内完成产品上线、拿下付费客户、验证商业模式', {
    x: 0.4, y: 1.6, w: 9, h: 0.4, fontSize: 12, color: C.gray, fontFace: FONT.body,
  });

  const allocations = [
    ['45%', '产品稳定与 AI 主线', '云端部署、核心功能稳定、AI 能力持续增强', C.primary],
    ['25%', '试点实施与客户成功', '客户对接、培训上线、每周回访、需求收敛', C.accent],
    ['15%', '合规 / 安全 / 权限', '数据加密、隔离、审计日志、基础安全合规', C.amber],
    ['15%', '销售验证与运营弹性', '获客测试、市场验证、团队运营预留', C.green],
  ];

  allocations.forEach((a, i) => {
    const y = 2.2 + i * 1.1;
    s.addShape(pptx.ShapeType.roundRect, { x: 0.4, y, w: 9.2, h: 0.9, fill: { color: C.white }, rectRadius: 0.1, shadow: { type: 'outer', blur: 3, offset: 1, color: 'E0E0E0' } });
    s.addText(a[0], { x: 0.6, y: y + 0.1, w: 0.8, h: 0.5, fontSize: 20, bold: true, color: a[3], fontFace: FONT.title, valign: 'middle' });
    s.addText(a[1], { x: 1.5, y: y + 0.1, w: 3, h: 0.35, fontSize: 13, bold: true, color: C.dark, fontFace: FONT.title });
    s.addText(a[2], { x: 1.5, y: y + 0.45, w: 7.5, h: 0.3, fontSize: 10, color: C.gray, fontFace: FONT.body });
  });
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 15: ★ NEW — Risk & Mitigation
// ═══════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  lightSlide(s);
  addLogo(s, false);
  addPageNum(s, 15, TOTAL);

  s.addText('14', { x: 0.4, y: 0.7, w: 0.5, h: 0.3, fontSize: 11, color: C.primary, fontFace: FONT.body });
  s.addText('风险与应对', {
    x: 0.4, y: 1.0, w: 9, h: 0.5,
    fontSize: 22, bold: true, color: C.dark, fontFace: FONT.title,
  });

  const risks = [
    ['政策窗口延迟', '地方落地节奏可能慢于预期', '先锁定市场化机构（不依赖政策），政策客户作为增量'],
    ['大厂进场', '钉钉/飞书可能加心理模块', '大厂做通用工具，无法深入专业工作流；我们的壁垒在行业嵌入深度'],
    ['咨询师 AI 抵触', '部分咨询师对 AI 介入有顾虑', 'AI 定位为"助手"而非"替代"；先切记录/归档等非临床环节建立信任'],
    ['团队规模小', '创始人兼产品/技术/BD 压力大', '融资后第一时间招工程师和客户成功；AI 工具本身提升个人产能'],
  ];

  risks.forEach((r, i) => {
    const y = 1.7 + i * 1.25;
    s.addShape(pptx.ShapeType.roundRect, { x: 0.4, y, w: 9.2, h: 1.05, fill: { color: C.white }, rectRadius: 0.1, shadow: { type: 'outer', blur: 3, offset: 1, color: 'E0E0E0' } });
    s.addText(r[0], { x: 0.6, y: y + 0.08, w: 2, h: 0.3, fontSize: 12, bold: true, color: C.red, fontFace: FONT.title });
    s.addText(r[1], { x: 0.6, y: y + 0.4, w: 3.5, h: 0.5, fontSize: 10, color: C.gray, fontFace: FONT.body });
    s.addText('应对：' + r[2], { x: 4.3, y: y + 0.15, w: 5, h: 0.75, fontSize: 10, color: C.dark, fontFace: FONT.body, lineSpacingMultiple: 1.3 });
  });
}

// ═══════════════════════════════════════════════════════════════════
// SLIDE 16: Closing
// ═══════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  darkSlide(s);

  s.addText('Psynote', {
    x: 0.4, y: 0.5, w: 5, h: 0.6,
    fontSize: 28, bold: true, color: C.primary, fontFace: FONT.title,
  });

  s.addShape(pptx.ShapeType.rect, { x: 0.7, y: 2.4, w: 0.06, h: 1.2, fill: { color: C.primary } });

  s.addText('让心理服务从碎片工具，\n走向统一工作流', {
    x: 1.0, y: 2.3, w: 8, h: 1.0,
    fontSize: 30, bold: true, color: C.white, fontFace: FONT.title, lineSpacingMultiple: 1.3,
  });

  s.addText('AI 会更快抹平单点功能差异。\n真正稀缺的，是谁先占住心理服务的\n关键工作流、关键数据结构与机构信任。', {
    x: 1.0, y: 3.5, w: 7, h: 1.2,
    fontSize: 14, color: C.gray, fontFace: FONT.body, lineSpacingMultiple: 1.6, italic: true,
  });

  const goals = ['完成云端上线', '拿下首批付费客户', '验证商业模式'];
  goals.forEach((g, i) => {
    const x = 1.0 + i * 2.8;
    s.addText('0' + (i + 1), { x, y: 5.2, w: 0.4, h: 0.35, fontSize: 14, color: C.primary, fontFace: FONT.body, bold: true });
    s.addText(g, { x: x + 0.45, y: 5.2, w: 2.2, h: 0.35, fontSize: 13, color: C.white, fontFace: FONT.body });
  });

  s.addText('谢谢  |  Psynote Investor Deck v3', {
    x: 0.4, y: 6.5, w: 9, h: 0.4,
    fontSize: 12, color: C.gray, fontFace: FONT.body,
  });
}

// ═══════════════════════════════════════════════════════════════════
// Generate
// ═══════════════════════════════════════════════════════════════════
const outputPath = 'D:/Desktop/Psynote_Investor_Deck_v3.pptx';
pptx.writeFile({ fileName: outputPath })
  .then(() => console.log('Generated: ' + outputPath))
  .catch(err => console.error('Error:', err));
