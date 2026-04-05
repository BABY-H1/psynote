import React from 'react';
import { useUpdateEnrollment, useAttendanceSummary } from '../../../../api/useGroups';
import { useToast, EmptyState } from '../../../../shared/components';
import { Check, X, Clock, UserMinus } from 'lucide-react';
import type { GroupInstance, GroupEnrollment } from '@psynote/shared';

const statusConfig: Record<string, { text: string; color: string }> = {
  pending: { text: '待审批', color: 'bg-yellow-100 text-yellow-700' },
  approved: { text: '已通过', color: 'bg-green-100 text-green-700' },
  rejected: { text: '已拒绝', color: 'bg-red-100 text-red-700' },
  withdrawn: { text: '已退出', color: 'bg-slate-100 text-slate-500' },
  waitlisted: { text: '等候中', color: 'bg-orange-100 text-orange-700' },
};

interface Props {
  instance: GroupInstance & { enrollments: (GroupEnrollment & { user: { name: string; email: string } })[] };
}

export function MembersTab({ instance }: Props) {
  const updateEnrollment = useUpdateEnrollment();
  const { data: attendanceSummary } = useAttendanceSummary(instance.id);
  const { toast } = useToast();

  const enrollments = instance.enrollments || [];
  const pending = enrollments.filter((e) => e.status === 'pending');
  const approved = enrollments.filter((e) => e.status === 'approved');
  const waitlisted = enrollments.filter((e) => e.status === 'waitlisted');
  const others = enrollments.filter((e) => e.status === 'rejected' || e.status === 'withdrawn');

  const handleAction = (enrollmentId: string, status: string) => {
    updateEnrollment.mutate({ enrollmentId, status }, {
      onSuccess: () => {
        const labels: Record<string, string> = {
          approved: '已通过审批',
          rejected: '已拒绝',
          withdrawn: '已标记退出',
        };
        toast(labels[status] || '已更新', 'success');
      },
    });
  };

  if (enrollments.length === 0) {
    return <EmptyState title="暂无报名成员" />;
  }

  return (
    <div className="space-y-6">
      {/* Pending */}
      {pending.length > 0 && (
        <Section title="待审批" count={pending.length} color="text-yellow-600">
          {pending.map((e) => (
            <MemberRow key={e.id} enrollment={e} attendanceSummary={attendanceSummary}>
              <button
                onClick={() => handleAction(e.id, 'approved')}
                className="flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100"
              >
                <Check className="w-3 h-3" /> 通过
              </button>
              <button
                onClick={() => handleAction(e.id, 'rejected')}
                className="flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100"
              >
                <X className="w-3 h-3" /> 拒绝
              </button>
            </MemberRow>
          ))}
        </Section>
      )}

      {/* Approved */}
      {approved.length > 0 && (
        <Section title="已通过" count={approved.length} color="text-green-600">
          {approved.map((e) => (
            <MemberRow key={e.id} enrollment={e} attendanceSummary={attendanceSummary}>
              <button
                onClick={() => handleAction(e.id, 'withdrawn')}
                className="flex items-center gap-1 px-2.5 py-1 text-slate-500 rounded-lg text-xs hover:bg-slate-100"
              >
                <UserMinus className="w-3 h-3" /> 退出
              </button>
            </MemberRow>
          ))}
        </Section>
      )}

      {/* Waitlisted */}
      {waitlisted.length > 0 && (
        <Section title="等候列表" count={waitlisted.length} color="text-orange-600">
          {waitlisted.map((e, i) => (
            <MemberRow key={e.id} enrollment={e} attendanceSummary={attendanceSummary} waitlistPosition={i + 1}>
              <button
                onClick={() => handleAction(e.id, 'approved')}
                className="flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100"
              >
                <Check className="w-3 h-3" /> 通过
              </button>
              <button
                onClick={() => handleAction(e.id, 'rejected')}
                className="flex items-center gap-1 px-2.5 py-1 text-slate-500 rounded-lg text-xs hover:bg-slate-100"
              >
                <X className="w-3 h-3" /> 移除
              </button>
            </MemberRow>
          ))}
        </Section>
      )}

      {/* Others */}
      {others.length > 0 && (
        <Section title="已离开" count={others.length} color="text-slate-400">
          {others.map((e) => (
            <MemberRow key={e.id} enrollment={e} attendanceSummary={attendanceSummary} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, count, color, children }: {
  title: string; count: number; color: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <span className={color}>{title}</span>
        <span className="text-xs text-slate-400">({count})</span>
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function MemberRow({ enrollment, attendanceSummary, waitlistPosition, children }: {
  enrollment: GroupEnrollment & { user: { name: string; email: string } };
  attendanceSummary?: Record<string, { present: number; total: number }>;
  waitlistPosition?: number;
  children?: React.ReactNode;
}) {
  const st = statusConfig[enrollment.status] || statusConfig.pending;
  const att = attendanceSummary?.[enrollment.id];

  return (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
      <div className="flex items-center gap-3">
        {waitlistPosition && (
          <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center">
            {waitlistPosition}
          </span>
        )}
        <div>
          <span className="text-sm font-medium text-slate-900">{enrollment.user?.name || '未知'}</span>
          <span className="text-xs text-slate-400 ml-2">{enrollment.user?.email}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.text}</span>
        {att && (
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            出勤 {att.present}/{att.total}
          </span>
        )}
      </div>
      {children && <div className="flex items-center gap-1.5">{children}</div>}
    </div>
  );
}
