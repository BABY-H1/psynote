import React from 'react';
import type { Appointment } from '@psynote/shared';
import { StatusBadge } from '../../../shared/components';

const statusConfig: Record<string, { label: string; variant: 'yellow' | 'blue' | 'green' | 'slate' | 'red' }> = {
  pending: { label: '待确认', variant: 'yellow' },
  confirmed: { label: '已确认', variant: 'blue' },
  completed: { label: '已完成', variant: 'green' },
  cancelled: { label: '已取消', variant: 'slate' },
  no_show: { label: '未到场', variant: 'red' },
};

const typeLabels: Record<string, string> = {
  online: '线上',
  offline: '线下',
  phone: '电话',
};

const sourceLabels: Record<string, string> = {
  client_request: '来访者预约',
  counselor_manual: '咨询师创建',
  admin_assigned: '管理员分配',
  risk_triage: '风险分诊',
};

interface Props {
  appointment: Appointment;
  clientName?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  onComplete?: () => void;
  onNoShow?: () => void;
  isPending?: boolean;
  /** If provided, the whole card becomes clickable (action buttons stopPropagation). */
  onCardClick?: () => void;
}

function stopAnd(cb?: () => void) {
  if (!cb) return undefined;
  return (e: React.MouseEvent) => {
    e.stopPropagation();
    cb();
  };
}

export function AppointmentCard({
  appointment,
  clientName,
  onConfirm,
  onCancel,
  onComplete,
  onNoShow,
  isPending,
  onCardClick,
}: Props) {
  const status = statusConfig[appointment.status] || statusConfig.pending;
  const clickable = !!onCardClick;

  const cardProps = clickable
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: onCardClick,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onCardClick!();
          }
        },
      }
    : {};

  return (
    <div
      className={`bg-white rounded-lg border border-slate-200 p-4 transition ${
        clickable ? 'cursor-pointer hover:border-brand-300 hover:shadow-sm' : ''
      }`}
      {...cardProps}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900 text-sm">
              {new Date(appointment.startTime).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {' - '}
              {new Date(appointment.endTime).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {clientName && (
              <span className="text-sm text-slate-700">{clientName}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {appointment.type && (
              <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-500">
                {typeLabels[appointment.type] || appointment.type}
              </span>
            )}
            {appointment.source && (
              <span>{sourceLabels[appointment.source] || appointment.source}</span>
            )}
          </div>
          {appointment.notes && (
            <p className="text-xs text-slate-500 mt-1">{appointment.notes}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge label={status.label} variant={status.variant} />
        </div>
      </div>

      {/* Action buttons */}
      {(onConfirm || onCancel || onComplete || onNoShow) && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
          {appointment.status === 'pending' && onConfirm && (
            <button
              onClick={stopAnd(onConfirm)}
              disabled={isPending}
              className="px-3 py-1.5 bg-brand-600 text-white rounded text-xs font-medium hover:bg-brand-500 disabled:opacity-50"
            >
              确认
            </button>
          )}
          {appointment.status === 'pending' && onCancel && (
            <button
              onClick={stopAnd(onCancel)}
              disabled={isPending}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              拒绝
            </button>
          )}
          {appointment.status === 'confirmed' && onComplete && (
            <button
              onClick={stopAnd(onComplete)}
              disabled={isPending}
              className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-500 disabled:opacity-50"
            >
              完成
            </button>
          )}
          {appointment.status === 'confirmed' && onCancel && (
            <button
              onClick={stopAnd(onCancel)}
              disabled={isPending}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              取消
            </button>
          )}
          {appointment.status === 'confirmed' && onNoShow && (
            <button
              onClick={stopAnd(onNoShow)}
              disabled={isPending}
              className="px-3 py-1.5 border border-red-200 text-red-600 rounded text-xs hover:bg-red-50 disabled:opacity-50"
            >
              标记爽约
            </button>
          )}
        </div>
      )}
    </div>
  );
}
