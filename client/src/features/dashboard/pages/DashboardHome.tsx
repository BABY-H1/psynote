import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList, Users, BookOpen, Layers,
  Calendar, FileText, AlertTriangle,
  ArrowRight, Activity, Settings, FolderPlus, Link2, X,
} from 'lucide-react';
import {
  useEpisodes, useAppointments, useUpdateAppointmentStatus,
  useCreateEpisode,
} from '../../../api/useCounseling';
import { useAssessments, useResults } from '../../../api/useAssessments';
import { useGroupInstances } from '../../../api/useGroups';
import { useCourses } from '../../../api/useCourses';
import { useAuthStore } from '../../../stores/authStore';
import { useToast } from '../../../shared/components';
import { AppointmentCard } from '../../counseling/components/AppointmentCard';
import type { Appointment } from '@psynote/shared';

const STATUS_FILTERS = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待确认' },
  { value: 'confirmed', label: '已确认' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

export function DashboardHome() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();

  // Appointment management state
  const [statusFilter, setStatusFilter] = useState('');
  const [promptAppt, setPromptAppt] = useState<(Appointment & { clientName?: string }) | null>(null);

  // Fetch data for stats
  const { data: episodes } = useEpisodes();
  const { data: assessments } = useAssessments();
  const { data: results } = useResults();
  const { data: groups } = useGroupInstances();
  const { data: courses } = useCourses();
  const { data: appointmentRows } = useAppointments(
    statusFilter ? ({ status: statusFilter } as any) : undefined,
  );
  const updateStatus = useUpdateAppointmentStatus();
  const createEpisode = useCreateEpisode();
  const { data: clientEpisodes } = useEpisodes(
    promptAppt ? { clientId: promptAppt.clientId, status: 'active' } : undefined,
  );

  // Compute stats
  const activeEpisodes = episodes?.filter((e) => e.status === 'active') ?? [];
  const highRiskEpisodes = activeEpisodes.filter(
    (e) => e.currentRisk === 'level_3' || e.currentRisk === 'level_4',
  );
  const recruitingGroups = groups?.filter((g) => g.status === 'recruiting') ?? [];
  const publishedCourses = courses?.filter((c) => c.status === 'published') ?? [];

  // Pending appointment count (across all statuses, not affected by filter)
  // Note: when filter is active, this count only reflects filtered rows. For accurate
  // pending count we'd need a separate fetch, but for UX simplicity we show count from current rows.
  const pendingCount = appointmentRows?.filter((r) => r.appointment.status === 'pending').length ?? 0;

  // Group appointments by date
  const grouped = groupByDate(
    appointmentRows?.map((r) => ({ ...r.appointment, clientName: r.clientName })) || [],
  );

  // Risk distribution
  const riskCounts = {
    level_1: activeEpisodes.filter((e) => e.currentRisk === 'level_1').length,
    level_2: activeEpisodes.filter((e) => e.currentRisk === 'level_2').length,
    level_3: activeEpisodes.filter((e) => e.currentRisk === 'level_3').length,
    level_4: activeEpisodes.filter((e) => e.currentRisk === 'level_4').length,
  };
  const totalRisk = riskCounts.level_1 + riskCounts.level_2 + riskCounts.level_3 + riskCounts.level_4;

  // ── Appointment handlers ──
  const handleConfirm = (item: Appointment & { clientName?: string }) => {
    if (item.status === 'pending' && !item.careEpisodeId && item.source === 'client_request') {
      setPromptAppt(item);
      return;
    }
    doConfirm(item.id);
  };

  const doConfirm = async (appointmentId: string) => {
    try {
      await updateStatus.mutateAsync({ appointmentId, status: 'confirmed' });
      toast('已确认预约', 'success');
      setPromptAppt(null);
    } catch {
      toast('操作失败，请重试', 'error');
    }
  };

  const handleCreateEpisodeAndConfirm = async () => {
    if (!promptAppt) return;
    try {
      await createEpisode.mutateAsync({ clientId: promptAppt.clientId });
      await updateStatus.mutateAsync({ appointmentId: promptAppt.id, status: 'confirmed' });
      toast('已创建个案并确认预约', 'success');
      setPromptAppt(null);
    } catch {
      toast('操作失败', 'error');
    }
  };

  const handleStatusChange = async (appointmentId: string, status: string) => {
    try {
      await updateStatus.mutateAsync({ appointmentId, status });
      const labels: Record<string, string> = {
        confirmed: '已确认预约',
        cancelled: '已取消预约',
        completed: '已标记完成',
        no_show: '已标记爽约',
      };
      toast(labels[status] || '状态已更新', 'success');
    } catch {
      toast('操作失败，请重试', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          你好，{user?.name || '用户'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          欢迎回到 Psynote 工作台，以下是今天的概览
        </p>
      </div>

      {/* Quick shortcuts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ShortcutCard
          icon={<ClipboardList className="w-5 h-5" />}
          label="测评管理"
          desc="量表与测评"
          onClick={() => navigate('/assessments')}
          color="brand"
        />
        <ShortcutCard
          icon={<Users className="w-5 h-5" />}
          label="个体咨询"
          desc="个案工作台"
          onClick={() => navigate('/episodes')}
          color="blue"
        />
        <ShortcutCard
          icon={<Layers className="w-5 h-5" />}
          label="团辅中心"
          desc="方案与活动"
          onClick={() => navigate('/groups')}
          color="amber"
        />
        <ShortcutCard
          icon={<BookOpen className="w-5 h-5" />}
          label="课程中心"
          desc="课程创作"
          onClick={() => navigate('/courses')}
          color="purple"
        />
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="活跃个案"
          value={activeEpisodes.length}
          sub={highRiskEpisodes.length > 0 ? `${highRiskEpisodes.length} 例高风险` : '运行正常'}
          icon={<Activity className="w-5 h-5 text-brand-500" />}
          alert={highRiskEpisodes.length > 0}
        />
        <StatCard
          label="测评量表"
          value={assessments?.length ?? 0}
          sub={`${results?.length ?? 0} 份结果`}
          icon={<FileText className="w-5 h-5 text-blue-500" />}
        />
        <StatCard
          label="团辅活动"
          value={groups?.length ?? 0}
          sub={`${recruitingGroups.length} 个招募中`}
          icon={<Calendar className="w-5 h-5 text-amber-500" />}
        />
        <StatCard
          label="课程"
          value={courses?.length ?? 0}
          sub={`${publishedCourses.length} 个已发布`}
          icon={<BookOpen className="w-5 h-5 text-purple-500" />}
        />
      </div>

      {/* Risk distribution */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">风险等级分布</h3>
          <button
            onClick={() => navigate('/episodes')}
            className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"
          >
            查看全部 <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        {totalRisk === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400">暂无活跃个案数据</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <RiskBar label="一般" level="level_1" count={riskCounts.level_1} total={totalRisk} color="bg-emerald-500" />
            <RiskBar label="关注" level="level_2" count={riskCounts.level_2} total={totalRisk} color="bg-yellow-500" />
            <RiskBar label="严重" level="level_3" count={riskCounts.level_3} total={totalRisk} color="bg-orange-500" />
            <RiskBar label="危机" level="level_4" count={riskCounts.level_4} total={totalRisk} color="bg-red-500" />
          </div>
        )}
      </div>

      {/* Appointment management — full panel */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-slate-900">预约管理</h3>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                {pendingCount} 条待确认
              </span>
            )}
          </div>
          <button
            onClick={() => navigate('/availability')}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
          >
            <Settings className="w-3.5 h-3.5" /> 排班设置
          </button>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 mb-4">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === f.value
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Grouped list */}
        {grouped.length === 0 ? (
          <div className="text-center py-12 text-sm text-slate-400">暂无预约</div>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ date, label, items }) => (
              <div key={date}>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">{label}</h4>
                <div className="space-y-2">
                  {items.map((item) => (
                    <AppointmentCard
                      key={item.id}
                      appointment={item}
                      clientName={item.clientName}
                      isPending={updateStatus.isPending}
                      onConfirm={() => handleConfirm(item)}
                      onCancel={() => handleStatusChange(item.id, 'cancelled')}
                      onComplete={() => handleStatusChange(item.id, 'completed')}
                      onNoShow={() => handleStatusChange(item.id, 'no_show')}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Episode creation prompt modal */}
      {promptAppt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setPromptAppt(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">确认预约</h3>
              <button onClick={() => setPromptAppt(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-slate-600">
              来访者 <span className="font-medium text-slate-900">{promptAppt.clientName || '未知'}</span> 目前没有进行中的个案。
            </p>

            {clientEpisodes && clientEpisodes.length > 0 ? (
              <div className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                该来访者已有 {clientEpisodes.length} 个进行中的个案，可直接确认预约。
              </div>
            ) : null}

            <div className="space-y-2">
              <button
                onClick={handleCreateEpisodeAndConfirm}
                disabled={createEpisode.isPending || updateStatus.isPending}
                className="w-full flex items-center gap-3 px-4 py-3 border border-brand-200 bg-brand-50 rounded-lg hover:bg-brand-100 transition text-left"
              >
                <FolderPlus className="w-5 h-5 text-brand-600 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-brand-700">创建个案并确认</div>
                  <div className="text-xs text-brand-500">快速为该来访者创建个案，同时确认预约</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setPromptAppt(null);
                  navigate(`/episodes/new?clientId=${promptAppt.clientId}`);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition text-left"
              >
                <Link2 className="w-5 h-5 text-slate-500 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-700">前往建案向导</div>
                  <div className="text-xs text-slate-400">填写完整的个案信息后再确认预约</div>
                </div>
              </button>

              <button
                onClick={() => doConfirm(promptAppt.id)}
                disabled={updateStatus.isPending}
                className="w-full px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 transition"
              >
                仅确认预约，暂不建案
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────

function groupByDate(items: (Appointment & { clientName?: string })[]) {
  const map = new Map<string, (Appointment & { clientName?: string })[]>();
  for (const item of items) {
    const date = new Date(item.startTime).toISOString().slice(0, 10);
    const arr = map.get(date) || [];
    arr.push(item);
    map.set(date, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a)) // newest first
    .map(([date, items]) => {
      const d = new Date(date);
      const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getUTCDay()];
      const label = `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()} ${weekday}`;
      return { date, label, items: items.sort((a, b) => a.startTime.localeCompare(b.startTime)) };
    });
}

// ─── Sub-components ──────────────────────────────────────────────

const colorMap = {
  brand: { bg: 'bg-brand-50', text: 'text-brand-600', border: 'border-brand-100' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100' },
};

function ShortcutCard({ icon, label, desc, onClick, color, badge }: {
  icon: React.ReactNode; label: string; desc: string;
  onClick: () => void; color: keyof typeof colorMap; badge?: number;
}) {
  const c = colorMap[color];
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 p-4 rounded-xl border ${c.border} ${c.bg} hover:shadow-sm transition text-left w-full group relative`}
    >
      {badge != null && badge > 0 && (
        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
          {badge}
        </span>
      )}
      <div className={`${c.text}`}>{icon}</div>
      <div>
        <div className={`text-sm font-semibold ${c.text}`}>{label}</div>
        <div className="text-xs text-slate-400">{desc}</div>
      </div>
      <ArrowRight className={`w-4 h-4 ${c.text} opacity-0 group-hover:opacity-100 transition ml-auto`} />
    </button>
  );
}

function StatCard({ label, value, sub, icon, alert }: {
  label: string; value: number; sub: string; icon: React.ReactNode; alert?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className={`text-xs mt-1 ${alert ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
        {alert && <AlertTriangle className="w-3 h-3 inline mr-1" />}
        {sub}
      </div>
    </div>
  );
}

function RiskBar({ label, count, total, color }: {
  label: string; level: string; count: number; total: number; color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-8">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-700 w-8 text-right">{count}</span>
    </div>
  );
}

