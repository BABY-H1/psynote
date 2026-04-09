import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMyAppointments } from '@client/api/useClientPortal';
import { PageLoading, EmptyState, StatusBadge } from '@client/shared/components';

const statusMap: Record<string, { label: string; variant: 'yellow' | 'blue' | 'green' | 'slate' | 'red' }> = {
  pending: { label: '待确认', variant: 'yellow' },
  confirmed: { label: '已确认', variant: 'blue' },
  completed: { label: '已完成', variant: 'green' },
  cancelled: { label: '已取消', variant: 'slate' },
  no_show: { label: '未到场', variant: 'red' },
};

const typeMap: Record<string, string> = {
  online: '线上',
  offline: '线下',
  phone: '电话',
};

export function MyAppointments() {
  const { data: appointments, isLoading } = useMyAppointments();
  const navigate = useNavigate();

  if (isLoading) {
    return <PageLoading />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">我的预约</h2>
        <button
          onClick={() => navigate('/portal/book')}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500"
        >
          预约咨询
        </button>
      </div>

      {!appointments || appointments.length === 0 ? (
        <EmptyState title="暂无预约记录" />
      ) : (
        <div className="space-y-3">
          {appointments.map((apt) => {
            const status = statusMap[apt.status] || statusMap.pending;
            return (
              <div
                key={apt.id}
                className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-sm font-semibold text-slate-900">
                      {new Date(apt.startTime).toLocaleDateString('zh-CN', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="text-sm text-slate-600">
                      {new Date(apt.startTime).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' - '}
                      {new Date(apt.endTime).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    {apt.type && <span>{typeMap[apt.type] || apt.type}</span>}
                    {apt.notes && <span>{apt.notes}</span>}
                  </div>
                </div>
                <StatusBadge label={status.label} variant={status.variant} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
