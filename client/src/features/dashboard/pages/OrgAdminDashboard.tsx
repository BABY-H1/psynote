/**
 * Phase 10 — Org admin home dashboard.
 *
 * Replaces the counselor workstation for org_admin users. Shows:
 * - Org overview metrics (counselors, clients, sessions)
 * - Action items (unassigned clients, pending notes, expiring consents)
 * - Recent notifications
 * - Quick navigation links
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users, UserCheck, Calendar, AlertTriangle, ClipboardList, Bell,
  ArrowRight, FileWarning, ShieldAlert, UsersRound, BookOpen,
  ClipboardCheck, Inbox,
} from 'lucide-react';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';

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

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
  refType?: string;
  refId?: string;
}

function useDashboardStats() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['dashboard-stats', orgId],
    queryFn: () => api.get<DashboardStats>(`/orgs/${orgId}/dashboard/stats`),
    enabled: !!orgId,
    refetchInterval: 60_000, // refresh every minute
  });
}

function useRecentNotifications() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['notifications', orgId],
    queryFn: () => api.get<Notification[]>(`/orgs/${orgId}/notifications`),
    enabled: !!orgId,
  });
}

export function OrgAdminDashboard() {
  const user = useAuthStore((s) => s.user);
  const { data: stats, isLoading } = useDashboardStats();
  const { data: notifications = [] } = useRecentNotifications();
  const navigate = useNavigate();

  const recentNotifs = notifications.slice(0, 8);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          你好，{user?.name || '管理员'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">机构运营概览</p>
      </div>

      {/* Metrics cards — 2 rows of 3 */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          icon={<UserCheck className="w-5 h-5 text-blue-600" />}
          label="活跃咨询师"
          value={stats?.counselorCount}
          loading={isLoading}
        />
        <MetricCard
          icon={<Users className="w-5 h-5 text-emerald-600" />}
          label="活跃来访者"
          value={stats?.clientCount}
          loading={isLoading}
        />
        <MetricCard
          icon={<Calendar className="w-5 h-5 text-violet-600" />}
          label="本月个咨"
          value={stats?.monthlySessionCount}
          loading={isLoading}
          suffix="场"
        />
        <MetricCard
          icon={<UsersRound className="w-5 h-5 text-orange-600" />}
          label="进行中团辅"
          value={stats?.activeGroupCount}
          loading={isLoading}
          onClick={() => navigate('/delivery')}
        />
        <MetricCard
          icon={<BookOpen className="w-5 h-5 text-teal-600" />}
          label="进行中课程"
          value={stats?.activeCourseCount}
          loading={isLoading}
          onClick={() => navigate('/delivery')}
        />
        <MetricCard
          icon={<ClipboardCheck className="w-5 h-5 text-indigo-600" />}
          label="本月测评"
          value={stats?.monthlyAssessmentCount}
          loading={isLoading}
          suffix="份"
          onClick={() => navigate('/delivery')}
        />
      </div>

      {/* Action items */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 tracking-wider uppercase mb-3">待办事项</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ActionCard
            icon={<AlertTriangle className="w-4 h-4" />}
            label="待分配来访者"
            count={stats?.unassignedCount ?? 0}
            color="amber"
            onClick={() => navigate('/collaboration')}
            loading={isLoading}
          />
          <ActionCard
            icon={<Inbox className="w-4 h-4" />}
            label="待处理申请"
            count={stats?.pendingIntakeCount ?? 0}
            color="violet"
            onClick={() => navigate('/collaboration')}
            loading={isLoading}
          />
          <ActionCard
            icon={<ClipboardList className="w-4 h-4" />}
            label="待审笔记"
            count={stats?.pendingNoteCount ?? 0}
            color="blue"
            onClick={() => navigate('/collaboration')}
            loading={isLoading}
          />
          <ActionCard
            icon={<FileWarning className="w-4 h-4" />}
            label="即将过期同意书"
            count={stats?.expiringConsentCount ?? 0}
            color="red"
            onClick={() => navigate('/settings')}
            loading={isLoading}
          />
        </div>
      </div>

      {/* Recent notifications */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-500 tracking-wider uppercase">最近通知</h2>
          <Bell className="w-4 h-4 text-slate-400" />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {recentNotifs.length === 0 && (
            <div className="p-6 text-sm text-slate-400 text-center">暂无通知</div>
          )}
          {recentNotifs.map((n) => (
            <div
              key={n.id}
              className={`p-3 flex items-start gap-3 ${!n.isRead ? 'bg-blue-50/50' : ''}`}
            >
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${!n.isRead ? 'bg-blue-500' : 'bg-transparent'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-800 font-medium">{n.title}</div>
                {n.body && (
                  <div className="text-xs text-slate-500 mt-0.5 truncate">{n.body}</div>
                )}
                <div className="text-xs text-slate-400 mt-1">
                  {new Date(n.createdAt).toLocaleString('zh-CN')}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 tracking-wider uppercase mb-3">快捷入口</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickLink label="协作中心" onClick={() => navigate('/collaboration')} />
          <QuickLink label="成员管理" onClick={() => navigate('/settings/members')} />
          <QuickLink label="交付中心" onClick={() => navigate('/delivery')} />
          <QuickLink label="知识库" onClick={() => navigate('/knowledge')} />
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, loading, suffix, onClick }: {
  icon: React.ReactNode;
  label: string;
  value?: number;
  loading: boolean;
  suffix?: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 text-left ${onClick ? 'hover:border-slate-300 hover:bg-slate-50 transition cursor-pointer' : ''}`}
    >
      <div className="p-2 bg-slate-50 rounded-lg">{icon}</div>
      <div>
        <div className="text-2xl font-bold text-slate-900">
          {loading ? '—' : (value ?? 0)}{suffix && !loading ? <span className="text-sm font-normal text-slate-400 ml-1">{suffix}</span> : null}
        </div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </Tag>
  );
}

const colorMap = {
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800' },
  red: { bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-100 text-red-800' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-800' },
} as const;

function ActionCard({ icon, label, count, color, onClick, loading }: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: keyof typeof colorMap;
  onClick: () => void;
  loading: boolean;
}) {
  const c = colorMap[color];
  const hasItems = count > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-4 rounded-xl border text-left transition w-full ${
        hasItems
          ? `${c.bg} border-${color}-200 hover:border-${color}-300`
          : 'bg-white border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={hasItems ? c.text : 'text-slate-400'}>{icon}</span>
        {hasItems && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.badge}`}>
            {loading ? '…' : count}
          </span>
        )}
      </div>
      <div className={`text-sm font-medium ${hasItems ? c.text : 'text-slate-500'}`}>{label}</div>
      {!hasItems && !loading && (
        <div className="text-xs text-slate-400 mt-0.5">无待处理</div>
      )}
    </button>
  );
}

function QuickLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white border border-slate-200 rounded-xl p-3 text-sm text-slate-700 font-medium hover:border-slate-300 hover:bg-slate-50 transition flex items-center justify-between"
    >
      {label}
      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
    </button>
  );
}
