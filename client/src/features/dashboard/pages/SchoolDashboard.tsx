import React from 'react';
import {
  ClipboardList, MessageSquare, Users as GroupIcon, BookOpen,
  Shield, Eye, AlertCircle, AlertTriangle,
} from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { StatTile, KPIDelta } from '../../../shared/components/dashboard';
import { useSchoolOverview } from '../../../api/useSchoolAnalytics';
import { useDashboardStats, useDashboardKpiDelta } from '../../../api/useDashboard';
import { SchoolRiskExplorer } from '../components/school/SchoolRiskExplorer';

/**
 * 学校管理员首页 — 第一性原理重设计。
 *
 * 顶部 4 卡运营 snapshot（本月完成测评 / 个咨 / 团辅 / 课程）维持不变；
 * 下方三列回答三个问题：
 *   Col 1 · 风险构成 —— L1-L4 当前状态 + 本周流量环比（vs 上周同时段）
 *   Col 2 · 风险视图 —— 年级/班级/测评 筛选 + 班级 × 风险矩阵
 *   Col 3 · 需关注学生 —— 筛选后的 L3/L4 名单，红→绿排列，点击进档案
 */
export function SchoolDashboard() {
  const user = useAuthStore((s) => s.user);
  const { data: overview, isLoading: overviewLoading } = useSchoolOverview();
  const { data: orgStats, isLoading: orgStatsLoading } = useDashboardStats();
  const { data: weekly, isLoading: weeklyLoading } = useDashboardKpiDelta('week');

  const risk = overview?.riskLevelDistribution;

  return (
    <div className="h-full flex flex-col gap-5 min-h-0">
      {/* 欢迎 */}
      <div className="flex items-baseline gap-3 flex-wrap flex-shrink-0">
        <h1 className="text-xl font-bold text-slate-900">
          你好，{user?.name || '管理员'}
        </h1>
        <p className="text-sm text-slate-500">学校心理服务概览</p>
      </div>

      {/* 顶部 4 卡 · 本月运营 snapshot */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
        <StatTile
          icon={<ClipboardList className="w-4 h-4" />}
          tone="teal"
          label="本月完成测评"
          value={overview?.assessmentsThisMonth}
          suffix="人次"
          loading={overviewLoading}
        />
        <StatTile
          icon={<MessageSquare className="w-4 h-4" />}
          tone="violet"
          label="本月个咨"
          value={orgStats?.monthlySessionCount}
          suffix="场"
          loading={orgStatsLoading}
        />
        <StatTile
          icon={<GroupIcon className="w-4 h-4" />}
          tone="amber"
          label="进行中团辅"
          value={orgStats?.activeGroupCount}
          suffix="个"
          loading={orgStatsLoading}
        />
        <StatTile
          icon={<BookOpen className="w-4 h-4" />}
          tone="blue"
          label="进行中课程"
          value={orgStats?.activeCourseCount}
          suffix="个"
          loading={orgStatsLoading}
        />
      </div>

      {/* 3 列主区（等宽） */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Col 1 · L1-L4 + 周环比（compact 紧凑排版，避免滚动条） */}
        <div className="flex flex-col gap-2 min-h-0 -mx-1 px-1">
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              icon={<Shield className="w-3.5 h-3.5" />}
              tone="emerald"
              label="L1 健康"
              value={risk?.level_1}
              suffix="人"
              loading={overviewLoading}
              compact
            />
            <StatTile
              icon={<Eye className="w-3.5 h-3.5" />}
              tone="amber"
              label="L2 关注"
              value={risk?.level_2}
              suffix="人"
              loading={overviewLoading}
              compact
            />
            <StatTile
              icon={<AlertCircle className="w-3.5 h-3.5" />}
              tone="orange"
              label="L3 建议"
              value={risk?.level_3}
              suffix="人"
              loading={overviewLoading}
              highlight={!!risk?.level_3 && risk.level_3 > 0}
              compact
            />
            <StatTile
              icon={<AlertTriangle className="w-3.5 h-3.5" />}
              tone="rose"
              label="L4 紧急"
              value={risk?.level_4}
              suffix="人"
              loading={overviewLoading}
              highlight={!!risk?.level_4 && risk.level_4 > 0}
              compact
            />
          </div>

          <div className="px-1 pt-1 text-[11px] text-slate-400 font-medium tracking-wide">
            本周 vs 上周同时段
          </div>

          <div className="grid grid-cols-2 gap-2">
            <KPIDelta
              icon={<MessageSquare className="w-3 h-3" />}
              tone="violet"
              label="个咨"
              current={weekly?.session.current}
              previous={weekly?.session.previous}
              suffix="场"
              loading={weeklyLoading}
              prevLabel="上周"
              compact
            />
            <KPIDelta
              icon={<ClipboardList className="w-3 h-3" />}
              tone="teal"
              label="测评"
              current={weekly?.assessment.current}
              previous={weekly?.assessment.previous}
              suffix="份"
              loading={weeklyLoading}
              prevLabel="上周"
              compact
            />
            <KPIDelta
              icon={<GroupIcon className="w-3 h-3" />}
              tone="amber"
              label="新增团辅"
              current={weekly?.groupActive.current}
              previous={weekly?.groupActive.previous}
              suffix="个"
              loading={weeklyLoading}
              prevLabel="上周"
              compact
            />
            <KPIDelta
              icon={<BookOpen className="w-3 h-3" />}
              tone="blue"
              label="新增课程"
              current={weekly?.courseActive.current}
              previous={weekly?.courseActive.previous}
              suffix="个"
              loading={weeklyLoading}
              prevLabel="上周"
              compact
            />
          </div>
        </div>

        {/* Col 2 + Col 3 · 风险视图 + 学生名单（占 2/3，内部再等分两列） */}
        <div className="min-h-0 lg:col-span-2">
          <SchoolRiskExplorer />
        </div>
      </div>
    </div>
  );
}
