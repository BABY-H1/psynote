import React, { useEffect, useState } from 'react';
import {
  ClipboardList, MessageSquare, Users as GroupIcon, BookOpen,
  Shield, Eye, AlertCircle, AlertTriangle,
} from 'lucide-react';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { StatTile } from '../../../shared/components/dashboard';
import { useSchoolOverview } from '../../../api/useSchoolAnalytics';
import { useQuery } from '@tanstack/react-query';
import { SchoolRiskSection } from '../components/school/SchoolRiskSection';
import { SchoolCrisisSection } from '../components/school/SchoolCrisisSection';

/**
 * Phase 14c — Redesigned SchoolDashboard ("先总后分" principle).
 *
 * Layout:
 *   欢迎栏
 *   ├── 核心指标 · 总 (8 tile, 2 rows × 4 cols)
 *   │    Row 1 · 运营: 本月完成测评 / 本月个咨 / 进行中团辅 / 进行中课程
 *   │    Row 2 · 风险 L1-L4: 健康 / 关注 / 建议 / 紧急
 *   ├── 风险关注 · 分 (SchoolRiskSection)
 *   │    年级分布 (左) + 班级×风险矩阵 (右)
 *   └── 危机处置 (SchoolCrisisSection)
 *        5 小卡 (总/处置中/待处置/待督导/本月结) + 按班级分布小条形图
 *
 * Removed from the old (72-line) version:
 *   - Hardcoded "测评完成=0 / 预警关注=0" tiles
 *   - "在册学生 / 年级数" tiles (per user feedback, low info value)
 *   - Standalone grade distribution block (merged into SchoolRiskSection)
 */

interface StudentStats {
  total: number;
  grades: Array<{ name: string; count: number }>;
}

interface DashboardStats {
  counselorCount: number;
  clientCount: number;
  monthlySessionCount: number;
  unassignedCount: number;
  pendingNoteCount: number;
  expiringConsentCount: number;
  activeGroupCount: number;
  activeCourseCount: number;
  monthlyAssessmentCount: number;
  pendingIntakeCount: number;
}

function useOrgDashboardStats() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['dashboard-stats', orgId],
    queryFn: () => api.get<DashboardStats>(`/orgs/${orgId}/dashboard/stats`),
    enabled: !!orgId,
    refetchInterval: 60_000,
  });
}

export function SchoolDashboard() {
  const user = useAuthStore((s) => s.user);
  const orgId = useAuthStore((s) => s.currentOrgId);

  // Legacy student-stats endpoint — still the source of truth for grade-level
  // breakdown (SchoolRiskSection reuses this).
  const [studentStats, setStudentStats] = useState<StudentStats | null>(null);
  useEffect(() => {
    if (!orgId) return;
    api.get<StudentStats>(`/orgs/${orgId}/school/students/stats`)
      .then(setStudentStats)
      .catch(() => {});
  }, [orgId]);

  const { data: overview, isLoading: overviewLoading } = useSchoolOverview();
  const { data: orgStats, isLoading: orgStatsLoading } = useOrgDashboardStats();

  const risk = overview?.riskLevelDistribution;

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          你好，{user?.name || '管理员'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">学校心理服务概览</p>
      </div>

      {/* ─── 核心指标 · "总" ─── */}
      <SectionDivider label="核心指标 · 总" />

      {/* Row 1: 运营 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

      {/* Row 2: 风险分布 L1-L4 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={<Shield className="w-4 h-4" />}
          tone="emerald"
          label="L1 健康"
          value={risk?.level_1}
          suffix="人"
          loading={overviewLoading}
        />
        <StatTile
          icon={<Eye className="w-4 h-4" />}
          tone="amber"
          label="L2 关注"
          value={risk?.level_2}
          suffix="人"
          loading={overviewLoading}
        />
        <StatTile
          icon={<AlertCircle className="w-4 h-4" />}
          tone="orange"
          label="L3 建议"
          value={risk?.level_3}
          suffix="人"
          loading={overviewLoading}
          highlight={!!risk?.level_3 && risk.level_3 > 0}
        />
        <StatTile
          icon={<AlertTriangle className="w-4 h-4" />}
          tone="rose"
          label="L4 紧急"
          value={risk?.level_4}
          suffix="人"
          loading={overviewLoading}
          highlight={!!risk?.level_4 && risk.level_4 > 0}
        />
      </div>

      {/* ─── 风险关注 · "分" ─── */}
      <SectionDivider label="风险关注 · 分" />
      <SchoolRiskSection
        grades={studentStats?.grades ?? []}
        totalStudents={studentStats?.total ?? 0}
      />

      {/* ─── 危机处置 ─── */}
      <SectionDivider label="危机处置" />
      <SchoolCrisisSection />
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
