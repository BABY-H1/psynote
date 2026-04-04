import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useAppointments, useUpdateAppointmentStatus,
  useCreateEpisode, useEpisodes,
} from '../../../api/useCounseling';
import { AppointmentCard } from '../components/AppointmentCard';
import { PageLoading, EmptyState, useToast } from '../../../shared/components';
import { FolderPlus, Link2, X } from 'lucide-react';
import type { Appointment } from '@psynote/shared';

const STATUS_FILTERS = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待确认' },
  { value: 'confirmed', label: '已确认' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

export function AppointmentManagement() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('');
  const { data: rows, isLoading } = useAppointments(
    statusFilter ? { status: statusFilter } as any : undefined,
  );
  const updateStatus = useUpdateAppointmentStatus();
  const createEpisode = useCreateEpisode();
  const { toast } = useToast();

  // Modal state for episode creation prompt
  const [promptAppt, setPromptAppt] = useState<(Appointment & { clientName?: string }) | null>(null);

  // Fetch active episodes for the prompted client
  const { data: clientEpisodes } = useEpisodes(
    promptAppt ? { clientId: promptAppt.clientId, status: 'active' } : undefined,
  );

  const handleConfirm = (item: Appointment & { clientName?: string }) => {
    // If client request with no linked episode, prompt to create one
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

  // Group appointments by date
  const grouped = groupByDate(rows?.map((r) => ({ ...r.appointment, clientName: r.clientName })) || []);

  // Count pending
  const pendingCount = rows?.filter((r) => r.appointment.status === 'pending').length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900">预约管理</h2>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
              {pendingCount} 条待确认
            </span>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-1">
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

      {/* Content */}
      {isLoading ? (
        <PageLoading />
      ) : grouped.length === 0 ? (
        <EmptyState title="暂无预约" />
      ) : (
        <div className="space-y-6">
          {grouped.map(({ date, label, items }) => (
            <div key={date}>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">{label}</h3>
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
