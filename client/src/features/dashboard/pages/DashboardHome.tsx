import React from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { DashboardCountGrid } from '../components/DashboardCountGrid';
import { Workstation } from '../components/Workstation';
import { FollowUpAlerts } from '../components/FollowUpAlerts';

/**
 * 首页 — 三段式工作台（Phase 14e 调整）
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
 *   │  ─── 风险关注 ─────────────────────      │
 *   │  <FollowUpAlerts />                      │
 *   └──────────────────────────────────────────┘
 *
 * Phase 14e 把原「档案库·过去」段（ArchiveSection = PersonArchivePreview +
 * RecentInteractions + FollowUpAlerts）替换为直接展示 FollowUpAlerts
 * 一张卡，段名改为「风险关注」。原来的"对象档案 top5"和"最近互动"从
 * 主页移除（仍可通过 交付中心 → 对象档案 入口访问）。
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
          欢迎回到 Psynote 工作台，以下是今天需要关注的内容
        </p>
      </div>

      {/* ─── 看板 · 未来 ─── */}
      <SectionDivider label="看板 · 未来" />
      <DashboardCountGrid />

      {/* ─── 操作台 · 现在 ─── */}
      <SectionDivider label="操作台 · 现在" />
      <Workstation />

      {/* ─── 风险关注 ─── */}
      <SectionDivider label="风险关注" />
      <FollowUpAlerts />
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
