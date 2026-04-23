import React from 'react';
import {
  Users, ClipboardList, MessageSquare, UsersRound, BookOpen,
  Shield, Eye, AlertCircle, AlertTriangle,
} from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { StatTile, KPIDelta } from '../../../shared/components/dashboard';
import { useEapOverview, useEapRiskDistribution, normalizeRiskDistribution } from '../../../api/useEapAnalytics';
import { useDashboardKpiDelta } from '../../../api/useDashboard';
import { EnterpriseRiskExplorer } from '../components/enterprise/EnterpriseRiskExplorer';

/**
 * 企业管理员（EAP）首页 — 对齐学校结构、维度切换为部门。
 *
 * 顶部 4 卡（本月运营 snapshot） + 下方三列：
 *   Col 1 · 风险构成 —— L1-L4（已测评员工分布）+ 4 个月环比
 *   Col 2 · 风险视图 —— 部门多选 + 部门 × 风险矩阵
 *   Col 3 · 需关注部门 —— 按 L3+L4 排名，点击 → /delivery/people?department=X
 *
 * 注：EAP 侧无个人员工名单列（k-anonymity）。
 */
export function EnterpriseDashboard() {
  const user = useAuthStore((s) => s.user);
  const { data: overview, isLoading: overviewLoading } = useEapOverview({ monthOnly: true });
  const { data: rd, isLoading: rdLoading } = useEapRiskDistribution();
  const { data: monthly, isLoading: monthlyLoading } = useDashboardKpiDelta('month');

  const risk = normalizeRiskDistribution(rd);

  return (
    <div className="h-full flex flex-col gap-5 min-h-0">
      {/* 欢迎 */}
      <div className="flex items-baseline gap-3 flex-wrap flex-shrink-0">
        <h1 className="text-xl font-bold text-slate-900">
          你好，{user?.name || '管理员'}
        </h1>
        <p className="text-sm text-slate-500">企业心理援助平台 · 运营概览</p>
      </div>

      {/* 顶部 4 卡 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
        <StatTile
          icon={<Users className="w-4 h-4" />}
          tone="blue"
          label="注册员工"
          value={overview?.totalEmployees}
          suffix="人"
          loading={overviewLoading}
        />
        <StatTile
          icon={<ClipboardList className="w-4 h-4" />}
          tone="teal"
          label="本月测评"
          value={overview?.assessmentsCompleted}
          suffix="人次"
          loading={overviewLoading}
        />
        <StatTile
          icon={<MessageSquare className="w-4 h-4" />}
          tone="violet"
          label="本月咨询"
          value={overview?.sessionsCompleted}
          suffix="场"
          loading={overviewLoading}
        />
        <StatTile
          icon={<UsersRound className="w-4 h-4" />}
          tone="orange"
          label="本月团辅"
          value={overview?.groupsParticipated}
          suffix="人次"
          loading={overviewLoading}
        />
      </div>

      {/* 3 列主区（等宽） */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Col 1 · L1-L4 + 月环比（compact 紧凑） */}
        <div className="flex flex-col gap-2 min-h-0 -mx-1 px-1">
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              icon={<Shield className="w-3.5 h-3.5" />}
              tone="emerald"
              label="L1 健康"
              value={risk.level_1}
              suffix="人"
              loading={rdLoading}
              compact
            />
            <StatTile
              icon={<Eye className="w-3.5 h-3.5" />}
              tone="amber"
              label="L2 关注"
              value={risk.level_2}
              suffix="人"
              loading={rdLoading}
              compact
            />
            <StatTile
              icon={<AlertCircle className="w-3.5 h-3.5" />}
              tone="orange"
              label="L3 建议"
              value={risk.level_3}
              suffix="人"
              loading={rdLoading}
              highlight={risk.level_3 > 0}
              compact
            />
            <StatTile
              icon={<AlertTriangle className="w-3.5 h-3.5" />}
              tone="rose"
              label="L4 紧急"
              value={risk.level_4}
              suffix="人"
              loading={rdLoading}
              highlight={risk.level_4 > 0}
              compact
            />
          </div>

          <div className="px-1 pt-1 text-[11px] text-slate-400 font-medium tracking-wide">
            本月 vs 上月同时段
          </div>

          <div className="grid grid-cols-2 gap-2">
            <KPIDelta
              icon={<MessageSquare className="w-3 h-3" />}
              tone="violet"
              label="个咨"
              current={monthly?.session.current}
              previous={monthly?.session.previous}
              suffix="场"
              loading={monthlyLoading}
              compact
            />
            <KPIDelta
              icon={<ClipboardList className="w-3 h-3" />}
              tone="teal"
              label="测评"
              current={monthly?.assessment.current}
              previous={monthly?.assessment.previous}
              suffix="份"
              loading={monthlyLoading}
              compact
            />
            <KPIDelta
              icon={<UsersRound className="w-3 h-3" />}
              tone="amber"
              label="新增团辅"
              current={monthly?.groupActive.current}
              previous={monthly?.groupActive.previous}
              suffix="个"
              loading={monthlyLoading}
              compact
            />
            <KPIDelta
              icon={<BookOpen className="w-3 h-3" />}
              tone="blue"
              label="新增课程"
              current={monthly?.courseActive.current}
              previous={monthly?.courseActive.previous}
              suffix="个"
              loading={monthlyLoading}
              compact
            />
          </div>
        </div>

        {/* Col 2 + 3 · 风险视图 + 需关注部门（占 2/3，内部再等分两列） */}
        <div className="min-h-0 lg:col-span-2">
          <EnterpriseRiskExplorer />
        </div>
      </div>
    </div>
  );
}
