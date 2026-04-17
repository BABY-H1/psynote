import React from 'react';
import {
  Users, ClipboardList, MessageSquare, UsersRound, BookOpen,
} from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { StatTile } from '../../../shared/components/dashboard';
import { useEapOverview } from '../../../api/useEapAnalytics';
import { EnterpriseRiskSection } from '../components/enterprise/EnterpriseRiskSection';
import { EnterpriseOperationSection } from '../components/enterprise/EnterpriseOperationSection';

/**
 * Phase 14d — Enterprise (EAP) home page.
 *
 * Rendered inside the **generic AppShell** (首页/知识库/交付中心/协作/设置)
 * when `orgType === 'enterprise' && role === 'org_admin'` — there is NO
 * separate HR shell anymore. Selected via `RoleBasedHome` in App.tsx.
 *
 * Layout follows the 3-section pattern aligned with SchoolDashboard and the
 * counselor DashboardHome's "过去/现在/未来" precedent:
 *
 *   顶部 · 欢迎栏
 *   ── 概览·未来 (5 核心 tile)
 *      注册员工 / 本月测评 / 本月咨询 / 本月团辅 / 本月课程
 *   ── 分布·风险  (EnterpriseRiskSection)
 *      左: 整体 L1-L4 风险分布    右: 部门 × 风险矩阵 (drill-down)
 *   ── 现在·操作台  (EnterpriseOperationSection)
 *      左: 服务使用趋势 (近 30 天)  右: 3 个待办 card
 */
export function EnterpriseDashboard() {
  const user = useAuthStore((s) => s.user);
  const { data: overview, isLoading } = useEapOverview({ monthOnly: true });

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          你好，{user?.name || '管理员'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">企业心理援助平台 · 运营概览</p>
      </div>

      {/* ─── 概览 · 未来 ─── */}
      <SectionDivider label="概览 · 未来" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatTile
          icon={<Users className="w-5 h-5" />}
          tone="blue"
          label="注册员工"
          value={overview?.totalEmployees}
          suffix="人"
          loading={isLoading}
        />
        <StatTile
          icon={<ClipboardList className="w-5 h-5" />}
          tone="teal"
          label="本月测评"
          value={overview?.assessmentsCompleted}
          suffix="人次"
          loading={isLoading}
        />
        <StatTile
          icon={<MessageSquare className="w-5 h-5" />}
          tone="violet"
          label="本月咨询"
          value={overview?.sessionsCompleted}
          suffix="场"
          loading={isLoading}
        />
        <StatTile
          icon={<UsersRound className="w-5 h-5" />}
          tone="orange"
          label="本月团辅"
          value={overview?.groupsParticipated}
          suffix="人次"
          loading={isLoading}
        />
        <StatTile
          icon={<BookOpen className="w-5 h-5" />}
          tone="amber"
          label="本月课程"
          value={overview?.coursesEnrolled}
          suffix="人次"
          loading={isLoading}
        />
      </div>

      {/* ─── 分布 · 风险 ─── */}
      <SectionDivider label="分布 · 风险" />
      <EnterpriseRiskSection />

      {/* ─── 现在 · 操作台 ─── */}
      <SectionDivider label="现在 · 操作台" />
      <EnterpriseOperationSection />
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
