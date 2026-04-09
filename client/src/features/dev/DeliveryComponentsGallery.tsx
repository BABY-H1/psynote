import React, { useState } from 'react';
import {
  CardGrid,
  EmptyCard,
  StatusFilterTabs,
  DeliveryCard,
  ServiceTabBar,
  ServiceDetailLayout,
  AIChatPanel,
  CreateServiceWizard,
  type StatusFilterOption,
  type DeliveryCardData,
  type ServiceTab,
  type AIChatMessage,
  type WizardStep,
} from '../../shared/components';
import { Edit3, Trash2, Plus } from 'lucide-react';

/**
 * /dev/delivery-components — Phase 2 共享组件画廊。
 *
 * 用 mock 数据渲染每一个 Phase 2 新增的共享交付组件，作为视觉回归
 * 和团队验收的入口。**禁止依赖任何真实 API**，纯客户端 mock。
 *
 * 路由：`/dev/delivery-components` （仅在 dev 环境暴露）
 */

const MOCK_CARDS: DeliveryCardData[] = [
  {
    id: 'c1',
    kind: 'counseling',
    title: '李同学 · 个案',
    status: 'active',
    description: '高三学生，考前焦虑，已经访谈 4 次',
    meta: [
      { label: '咨询师', value: '张老师' },
      { label: '下次', value: '2026/4/12 14:00' },
    ],
  },
  {
    id: 'g1',
    kind: 'group',
    title: '2026 春季情绪管理团辅 · A 班',
    status: 'recruiting',
    description: '面向高一年级，10 人小组，6 次活动',
    meta: [
      { label: '容量', value: '10' },
      { label: '已招', value: '6' },
      { label: '开始', value: '2026/4/20' },
    ],
  },
  {
    id: 'cr1',
    kind: 'course',
    title: '高考冲刺·安心前行',
    status: 'ongoing',
    description: '高三学生考前情绪急救与调节，6 节微课',
    meta: ['公开课', { label: '已学', value: '128 人' }],
  },
  {
    id: 'a1',
    kind: 'assessment',
    title: 'PHQ-9 抑郁筛查（4 月份）',
    status: 'active',
    description: '面向全校学生的月度心理健康筛查',
    meta: [{ label: '已答', value: '342' }, { label: '总数', value: '500' }],
  },
];

const STATUS_OPTIONS: StatusFilterOption[] = [
  { value: '', label: '全部', count: 4 },
  { value: 'active', label: '活跃', count: 1, countTone: 'brand' },
  { value: 'recruiting', label: '招募中', count: 1, countTone: 'amber' },
  { value: 'ongoing', label: '进行中', count: 1 },
  { value: 'closed', label: '已结束' },
];

const WIZARD_STEPS: WizardStep[] = [
  { key: 'type', label: '类型' },
  { key: 'asset', label: '资产' },
  { key: 'participants', label: '参与者' },
  { key: 'schedule', label: '排期' },
  { key: 'confirm', label: '确认' },
];

export function DeliveryComponentsGallery() {
  const [statusValue, setStatusValue] = useState('');
  const [tab, setTab] = useState<ServiceTab>('overview');
  const [editing, setEditing] = useState(false);
  const [aiMessages, setAiMessages] = useState<AIChatMessage[]>([
    {
      role: 'assistant',
      content: '我可以帮你修改和完善内容。\n\n（这是 demo，不会真的调用 AI）',
    },
  ]);
  const [aiPending, setAiPending] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);

  // Filter cards by status (cosmetic only)
  const filteredCards = statusValue ? MOCK_CARDS.filter((c) => c.status === statusValue) : MOCK_CARDS;

  const handleAiSend = (text: string) => {
    setAiMessages((prev) => [...prev, { role: 'user', content: text }]);
    setAiPending(true);
    setTimeout(() => {
      setAiMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `（demo）已收到："${text}"。这只是占位回复。`, applied: true },
      ]);
      setAiPending(false);
    }, 600);
  };

  return (
    <div className="space-y-12 pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">交付共享组件画廊</h1>
        <p className="text-sm text-slate-500 mt-1">
          Phase 2 验收页 — 用 mock 数据展示 8 个新组件的视觉与交互。仅在 dev 路径下挂载。
        </p>
      </div>

      {/* ─── 1. CardGrid + DeliveryCard + EmptyCard ─── */}
      <Section title="1. CardGrid + DeliveryCard + EmptyCard" anchor="card">
        <Subtitle>4 种 kind 的卡片在 2 列网格中：</Subtitle>
        <CardGrid cols={2}>
          {MOCK_CARDS.map((card) => (
            <DeliveryCard
              key={card.id}
              data={card}
              onOpen={() => alert(`open ${card.title}`)}
              actions={
                <>
                  <ActionBtn icon={<Edit3 className="w-4 h-4" />} label="编辑" />
                  <ActionBtn icon={<Trash2 className="w-4 h-4" />} label="删除" tone="rose" />
                </>
              }
            />
          ))}
        </CardGrid>

        <Subtitle>单列 + EmptyCard（占位）：</Subtitle>
        <CardGrid cols={1}>
          <DeliveryCard data={MOCK_CARDS[0]} onOpen={() => {}} />
          <EmptyCard
            title="该状态下暂无数据"
            description="切换其他状态或新建一条试试"
            action={{ label: '新建', onClick: () => alert('demo create') }}
          />
        </CardGrid>

        <Subtitle>3 列 + auto 自适应：</Subtitle>
        <CardGrid cols={3}>
          {MOCK_CARDS.slice(0, 3).map((c) => (
            <DeliveryCard key={c.id} data={c} onOpen={() => {}} />
          ))}
        </CardGrid>
      </Section>

      {/* ─── 2. StatusFilterTabs ─── */}
      <Section title="2. StatusFilterTabs" anchor="filter">
        <Subtitle>带计数气泡 + 胶囊容器：</Subtitle>
        <StatusFilterTabs options={STATUS_OPTIONS} value={statusValue} onChange={setStatusValue} />
        <div className="text-xs text-slate-500 mt-2">当前选中：{statusValue || '(空 = 全部)'}</div>

        <Subtitle>不带胶囊容器（fluid 风格）：</Subtitle>
        <StatusFilterTabs
          options={STATUS_OPTIONS}
          value={statusValue}
          onChange={setStatusValue}
          pillContainer={false}
        />

        <Subtitle>组合：filter + grid，模拟真实列表页：</Subtitle>
        <div className="bg-slate-50 -m-2 p-4 rounded-xl">
          <StatusFilterTabs options={STATUS_OPTIONS} value={statusValue} onChange={setStatusValue} />
          <div className="mt-4">
            <CardGrid cols={2}>
              {filteredCards.length === 0 ? (
                <EmptyCard />
              ) : (
                filteredCards.map((c) => <DeliveryCard key={c.id} data={c} onOpen={() => {}} />)
              )}
            </CardGrid>
          </div>
        </div>
      </Section>

      {/* ─── 3. ServiceTabBar ─── */}
      <Section title="3. ServiceTabBar" anchor="tabbar">
        <Subtitle>5 个标准 tab（默认）：</Subtitle>
        <ServiceTabBar value={tab} onChange={setTab} />

        <Subtitle>测评模式（仅 overview / timeline / records）：</Subtitle>
        <ServiceTabBar
          value={tab}
          onChange={setTab}
          visibleTabs={['overview', 'timeline', 'records']}
        />

        <Subtitle>团辅 / 课程的角色术语覆写：</Subtitle>
        <ServiceTabBar
          value={tab}
          onChange={setTab}
          labels={{ participants: '成员' }}
          visibleTabs={['overview', 'participants', 'timeline', 'records', 'assets']}
        />
        <ServiceTabBar
          value={tab}
          onChange={setTab}
          labels={{ participants: '学员' }}
        />
      </Section>

      {/* ─── 4. ServiceDetailLayout (tabs variant) ─── */}
      <Section title="4. ServiceDetailLayout · variant=tabs" anchor="layout-tabs">
        <Subtitle>团辅活动详情样式（mock）：</Subtitle>
        <div className="bg-slate-50 -m-2 p-4 rounded-xl">
          <ServiceDetailLayout
            title="2026 春季情绪管理团辅 · A 班"
            status="recruiting"
            metaLine={
              <>
                <span>开始: 2026/4/20</span>
                <span>地点: 心理咨询中心 301</span>
                <span>容量: 10 人</span>
              </>
            }
            onBack={() => alert('back')}
            actions={
              <>
                <button className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500">
                  开始招募
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500">
                  开始活动
                </button>
              </>
            }
            tabBar={
              <ServiceTabBar
                value={tab}
                onChange={setTab}
                labels={{ participants: '成员' }}
              />
            }
          >
            <div className="bg-white rounded-xl border border-slate-200 p-6 min-h-[160px]">
              <div className="text-sm text-slate-500">
                当前 tab: <span className="font-medium text-slate-700">{tab}</span>
              </div>
              <div className="text-xs text-slate-400 mt-2">
                这里是各 tab 的实际内容，由具体页面（OverviewTab / MembersTab 等）提供。
              </div>
            </div>
          </ServiceDetailLayout>
        </div>
      </Section>

      {/* ─── 5. ServiceDetailLayout (workspace variant) ─── */}
      <Section title="5. ServiceDetailLayout · variant=workspace" anchor="layout-workspace">
        <Subtitle>个案 workspace 样式（不渲染 tabBar，children 自由排布）：</Subtitle>
        <div className="bg-slate-50 -m-2 p-4 rounded-xl">
          <ServiceDetailLayout
            variant="workspace"
            title="李同学 · 个案"
            status="active"
            metaLine={
              <>
                <span>咨询师: 张老师</span>
                <span>风险等级: level_2</span>
                <span>已访谈: 4 次</span>
              </>
            }
            onBack={() => alert('back')}
            actions={
              <button className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500">
                + 新建会谈
              </button>
            }
          >
            <div className="grid grid-cols-12 gap-3 min-h-[200px]">
              <div className="col-span-3 bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-500">
                左侧：来访者档案 / 时间线
              </div>
              <div className="col-span-6 bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-500">
                中央：会谈编辑区
              </div>
              <div className="col-span-3 bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-500">
                右侧：AI 助手 / 资产
              </div>
            </div>
          </ServiceDetailLayout>
        </div>
      </Section>

      {/* ─── 6. AIChatPanel ─── */}
      <Section title="6. AIChatPanel" anchor="ai">
        <Subtitle>
          编辑态切换：
          <button
            onClick={() => setEditing((v) => !v)}
            className="ml-2 text-xs text-brand-600 hover:underline"
          >
            {editing ? '关闭编辑（显示蒙层）' : '进入编辑'}
          </button>
        </Subtitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-slate-200 rounded-xl overflow-hidden h-[400px] bg-white">
            <AIChatPanel
              messages={aiMessages}
              editing={editing}
              isPending={aiPending}
              onSend={handleAiSend}
              contextHint="当前: 总体方案"
            />
          </div>
          <div className="border border-slate-200 rounded-xl overflow-hidden h-[400px] bg-white">
            <AIChatPanel
              title="个案 AI 助手"
              messages={aiMessages}
              editing={editing}
              isPending={aiPending}
              onSend={handleAiSend}
              multiline
              placeholder="说点什么..."
              disabledHint="进入编辑态后即可发起会话"
            />
          </div>
        </div>
      </Section>

      {/* ─── 7. CreateServiceWizard ─── */}
      <Section title="7. CreateServiceWizard" anchor="wizard">
        <Subtitle>5 步骤创建向导外壳：</Subtitle>
        <div className="bg-slate-50 -m-2 p-4 rounded-xl">
          <CreateServiceWizard
            steps={WIZARD_STEPS}
            activeIndex={wizardStep}
            onBack={() => alert('back')}
            title="创建服务"
            subtitle="演示 5 步骤外壳，children 由父组件根据 activeIndex 渲染"
          >
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="text-sm font-semibold text-slate-900 mb-2">
                第 {wizardStep + 1} 步：{WIZARD_STEPS[wizardStep].label}
              </div>
              <div className="text-xs text-slate-500 mb-4">
                这里是 step {wizardStep + 1} 的具体表单内容（mock）。
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setWizardStep((s) => Math.max(0, s - 1))}
                  disabled={wizardStep === 0}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-40"
                >
                  上一步
                </button>
                <button
                  onClick={() => setWizardStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1))}
                  disabled={wizardStep === WIZARD_STEPS.length - 1}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-500 disabled:opacity-40"
                >
                  下一步
                </button>
              </div>
            </div>
          </CreateServiceWizard>
        </div>
      </Section>
    </div>
  );
}

// ─── Section / helpers ────────────────────────────────────────

function Section({
  title,
  anchor,
  children,
}: {
  title: string;
  anchor: string;
  children: React.ReactNode;
}) {
  return (
    <section id={anchor} className="space-y-3">
      <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Subtitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{children}</h3>;
}

function ActionBtn({
  icon,
  label,
  tone = 'brand',
}: {
  icon: React.ReactNode;
  label: string;
  tone?: 'brand' | 'rose';
}) {
  const cls =
    tone === 'rose'
      ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
      : 'text-slate-400 hover:text-brand-600 hover:bg-brand-50';
  return (
    <button
      type="button"
      className={`p-2 rounded-lg transition ${cls}`}
      title={label}
      onClick={() => alert(label)}
    >
      {icon}
    </button>
  );
}
