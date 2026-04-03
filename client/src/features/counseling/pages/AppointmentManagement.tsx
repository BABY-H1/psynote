import React, { useState } from 'react';
import { useAppointments, useUpdateAppointmentStatus } from '../../../api/useCounseling';
import { AppointmentCard } from '../components/AppointmentCard';
import { PageLoading, EmptyState, useToast } from '../../../shared/components';
import type { Appointment } from '@psynote/shared';

const STATUS_FILTERS = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待确认' },
  { value: 'confirmed', label: '已确认' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

export function AppointmentManagement() {
  const [statusFilter, setStatusFilter] = useState('');
  const { data: rows, isLoading } = useAppointments(
    statusFilter ? { status: statusFilter } as any : undefined,
  );
  const updateStatus = useUpdateAppointmentStatus();
  const { toast } = useToast();

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
                    onConfirm={() => handleStatusChange(item.id, 'confirmed')}
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
