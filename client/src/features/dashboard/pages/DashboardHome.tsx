import React from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { DashboardCountGrid } from '../components/DashboardCountGrid';
import { Workstation } from '../components/Workstation';
import { ArchiveSection } from '../components/ArchiveSection';

/**
 * 首页 — 三段式工作台
 *
 * 本文件作为 Phase 1 重构的最终形态：仅是三个段（看板/操作台/档案库）的容器，
 * 不再持有任何业务逻辑。
 *
 *   ┌──────────────────────────────────────────┐
 *   │  你好，{user}                            │
 *   ├──────────────────────────────────────────┤
 *   │  ─── 看板 · 未来 ─────────────────       │
 *   │  <DashboardCountGrid />                  │
 *   ├──────────────────────────────────────────┤
 *   │  ─── 操作台 · 现在 ───────────────       │
 *   │  <Workstation />                         │
 *   ├──────────────────────────────────────────┤
 *   │  ─── 档案库 · 过去 ───────────────       │
 *   │  <ArchiveSection />                      │
 *   └──────────────────────────────────────────┘
 *
 * 已删除（相对于旧版）：
 *   - 4 个 ShortcutCard（与侧边栏导航重复）
 *   - 4 个 StatCard（被 6 瓦片 DashboardCountGrid 取代）
 *   - 风险等级分布图（迁移到对象档案 / 个案列表，详见 Phase 6）
 *   - 内联的 ShortcutCard / StatCard / RiskBar 子组件
 *   - 预约管理面板与建案弹窗（迁移到 Workstation.tsx）
 */
export function DashboardHome() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          你好，{user?.name || '用户'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          欢迎回到 Psynote 工作台，以下是今天的概览
        </p>
      </div>

      {/* ─── 看板 · 未来 ─── */}
      <SectionDivider label="看板 · 未来" />
      <DashboardCountGrid />

      {/* ─── 操作台 · 现在 ─── */}
      <SectionDivider label="操作台 · 现在" />
      <Workstation />

      {/* ─── 档案库 · 过去 ─── */}
      <SectionDivider label="档案库 · 过去" />
      <ArchiveSection />
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 select-none">
      <span className="text-xs font-semibold text-slate-500 tracking-wider uppercase">
        {label}
      </span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}
