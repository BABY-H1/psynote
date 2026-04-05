import React from 'react';
import { useGroupScheme } from '../../../../api/useGroups';
import { MapPin, Calendar, Users, Clock, BookOpen, ClipboardCheck } from 'lucide-react';
import type { GroupInstance, GroupEnrollment } from '@psynote/shared';

interface Props {
  instance: GroupInstance & { enrollments: (GroupEnrollment & { user: { name: string; email: string } })[] };
}

export function OverviewTab({ instance }: Props) {
  const { data: scheme } = useGroupScheme(instance.schemeId || undefined);

  const enrollments = instance.enrollments || [];
  const approved = enrollments.filter((e) => e.status === 'approved').length;
  const pending = enrollments.filter((e) => e.status === 'pending').length;
  const waitlisted = enrollments.filter((e) => e.status === 'waitlisted').length;
  const rejected = enrollments.filter((e) => e.status === 'rejected').length;

  return (
    <div className="space-y-6">
      {/* Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoCard icon={<Calendar className="w-4 h-4 text-blue-500" />} label="开始日期" value={instance.startDate || '未设置'} />
        <InfoCard icon={<MapPin className="w-4 h-4 text-green-500" />} label="地点" value={instance.location || '未设置'} />
        <InfoCard icon={<Users className="w-4 h-4 text-violet-500" />} label="容量" value={instance.capacity ? `${approved}/${instance.capacity}` : `${approved}人`} />
        <InfoCard icon={<Clock className="w-4 h-4 text-amber-500" />} label="安排" value={instance.schedule || instance.duration || '未设置'} />
      </div>

      {/* Description */}
      {instance.description && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">活动描述</h3>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{instance.description}</p>
        </div>
      )}

      {/* Enrollment Stats */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">报名统计</h3>
        <div className="flex gap-6">
          <StatBadge label="已通过" count={approved} color="text-green-600 bg-green-50" />
          <StatBadge label="待审批" count={pending} color="text-yellow-600 bg-yellow-50" />
          <StatBadge label="等候中" count={waitlisted} color="text-orange-600 bg-orange-50" />
          <StatBadge label="已拒绝" count={rejected} color="text-red-600 bg-red-50" />
        </div>
      </div>

      {/* Scheme Preview */}
      {scheme && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-900">关联方案: {scheme.title}</h3>
            {scheme.targetAudience && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">
                {scheme.targetAudience}
              </span>
            )}
          </div>
          {scheme.theory && (
            <p className="text-xs text-slate-500 mb-3">理论基础: {scheme.theory}</p>
          )}
          {scheme.sessions && scheme.sessions.length > 0 && (
            <div className="space-y-1.5">
              {scheme.sessions.map((s, i) => (
                <div key={s.id || i} className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <span>{s.title}</span>
                  {s.duration && <span className="text-xs text-slate-400 ml-auto">{s.duration}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Assessment Info */}
      {((instance as any).recruitmentAssessments?.length > 0 || (instance as any).overallAssessments?.length > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardCheck className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-900">评估量表</h3>
          </div>
          <div className="space-y-2 text-sm text-slate-600">
            <div>
              <span className="text-xs text-slate-400">招募量表: </span>
              {(instance as any).recruitmentAssessments?.length > 0
                ? `已配置 ${(instance as any).recruitmentAssessments.length} 个`
                : '未设置'}
            </div>
            <div>
              <span className="text-xs text-slate-400">整体评估: </span>
              {(instance as any).overallAssessments?.length > 0
                ? `已配置 ${(instance as any).overallAssessments.length} 个`
                : '未设置'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function StatBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${color}`}>
      <span className="text-lg font-bold">{count}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}
