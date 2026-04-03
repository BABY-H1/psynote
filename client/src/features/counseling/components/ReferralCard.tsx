import React from 'react';
import { StatusBadge } from '../../../shared/components';
import type { Referral } from '@psynote/shared';

const targetTypeLabels: Record<string, string> = {
  psychiatric: '精神科', crisis_center: '危机中心', hospital: '医院',
  external_counselor: '外部咨询师', other: '其他',
};

const statusConfig: Record<string, { label: string; variant: 'yellow' | 'blue' | 'green' | 'slate' }> = {
  pending: { label: '待处理', variant: 'yellow' },
  accepted: { label: '已接收', variant: 'blue' },
  completed: { label: '已完成', variant: 'green' },
  cancelled: { label: '已取消', variant: 'slate' },
};

interface Props {
  referral: Referral;
  onStatusChange?: (status: string) => void;
  isPending?: boolean;
}

export function ReferralCard({ referral, onStatusChange, isPending }: Props) {
  const status = statusConfig[referral.status] || statusConfig.pending;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge label={status.label} variant={status.variant} />
            {referral.targetType && (
              <span className="text-xs text-slate-400">
                {targetTypeLabels[referral.targetType] || referral.targetType}
              </span>
            )}
            {referral.targetName && (
              <span className="text-xs text-slate-600 font-medium">→ {referral.targetName}</span>
            )}
          </div>
          <p className="text-sm text-slate-700 mt-1">{referral.reason}</p>
          {referral.riskSummary && (
            <p className="text-xs text-slate-500 mt-1">风险：{referral.riskSummary}</p>
          )}
          {referral.followUpPlan && (
            <p className="text-xs text-slate-500 mt-1">跟进：{referral.followUpPlan}</p>
          )}
          <div className="text-xs text-slate-400 mt-2">
            {new Date(referral.createdAt).toLocaleDateString('zh-CN')}
          </div>
        </div>

        {onStatusChange && (
          <div className="flex gap-1.5 flex-shrink-0 ml-3">
            {referral.status === 'pending' && (
              <>
                <button
                  onClick={() => onStatusChange('accepted')}
                  disabled={isPending}
                  className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50"
                >
                  接收
                </button>
                <button
                  onClick={() => onStatusChange('cancelled')}
                  disabled={isPending}
                  className="text-xs px-2 py-1 border border-slate-200 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  取消
                </button>
              </>
            )}
            {referral.status === 'accepted' && (
              <button
                onClick={() => onStatusChange('completed')}
                disabled={isPending}
                className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-500 disabled:opacity-50"
              >
                完成
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
