import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useClientDashboard, useMyTimeline } from '@client/api/useClientPortal';
import { useMyDocuments } from '@client/api/useConsent';
import { Timeline } from '@client/features/counseling/components/Timeline';
import { PageLoading, RiskBadge, EmptyState } from '@client/shared/components';
import { AlertTriangle } from 'lucide-react';

const riskDisplay: Record<string, { label: string; color: string; bg: string }> = {
  level_1: { label: '状态良好', color: 'text-green-700', bg: 'bg-green-50' },
  level_2: { label: '需要关注', color: 'text-yellow-700', bg: 'bg-yellow-50' },
  level_3: { label: '建议咨询', color: 'text-orange-700', bg: 'bg-orange-50' },
  level_4: { label: '请联系咨询师', color: 'text-red-700', bg: 'bg-red-50' },
};

export function ClientDashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useClientDashboard();
  const { data: timeline, isLoading: timelineLoading } = useMyTimeline();
  const { data: myDocs } = useMyDocuments();
  const pendingDocs = (myDocs || []).filter((d) => d.status === 'pending');

  if (isLoading) {
    return <PageLoading />;
  }

  const risk = data?.episode?.currentRisk
    ? riskDisplay[data.episode.currentRisk] || riskDisplay.level_1
    : null;

  return (
    <div className="space-y-6">
      {pendingDocs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-amber-800">
                您有 {pendingDocs.length} 份用户协议待签署
              </div>
              <div className="text-xs text-amber-600 mt-0.5">
                请尽快查看并签署，以便开展后续服务
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/portal/consents')}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-500 flex-shrink-0"
          >
            前往签署
          </button>
        </div>
      )}

      <h2 className="text-xl font-bold text-slate-900">我的健康概览</h2>

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Risk card */}
        <div className={`rounded-xl p-5 border ${risk ? risk.bg : 'bg-slate-50'} border-slate-200`}>
          <div className="text-xs text-slate-500 mb-1">当前状态</div>
          <div className={`text-lg font-bold ${risk ? risk.color : 'text-slate-400'}`}>
            {risk ? risk.label : '暂无评估'}
          </div>
          {data?.episode?.interventionType && (
            <div className="text-xs text-slate-500 mt-2">
              当前服务: {
                { course: '课程学习', group: '团体辅导', counseling: '个体咨询', referral: '专业转介' }[data.episode.interventionType] || data.episode.interventionType
              }
            </div>
          )}
        </div>

        {/* Appointments card */}
        <div className="rounded-xl p-5 bg-white border border-slate-200">
          <div className="text-xs text-slate-500 mb-1">近期预约</div>
          {data?.upcomingAppointments && data.upcomingAppointments.length > 0 ? (
            <div>
              <div className="text-lg font-bold text-brand-600">
                {new Date(data.upcomingAppointments[0].startTime).toLocaleDateString('zh-CN', {
                  month: 'long', day: 'numeric',
                })}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {new Date(data.upcomingAppointments[0].startTime).toLocaleTimeString('zh-CN', {
                  hour: '2-digit', minute: '2-digit',
                })}
                {' '}{data.upcomingAppointments[0].type === 'online' ? '线上' : data.upcomingAppointments[0].type === 'phone' ? '电话' : '线下'}
              </div>
            </div>
          ) : (
            <div className="text-lg font-bold text-slate-300">暂无预约</div>
          )}
        </div>

        {/* Notifications card */}
        <div className="rounded-xl p-5 bg-white border border-slate-200">
          <div className="text-xs text-slate-500 mb-1">未读消息</div>
          <div className="text-lg font-bold text-slate-900">
            {data?.unreadNotificationCount || 0}
          </div>
        </div>
      </div>

      {/* Recent scores trend */}
      {data?.recentResults && data.recentResults.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-3">近期测评</h3>
          <div className="space-y-2">
            {data.recentResults.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <span className="text-sm text-slate-600">
                    {new Date(r.createdAt).toLocaleDateString('zh-CN')}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-900">总分 {r.totalScore}</span>
                    {r.riskLevel && <RiskBadge level={r.riskLevel} />}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* My timeline */}
      <div>
        <h3 className="font-semibold text-slate-900 mb-3">我的健康时间线</h3>
        <Timeline events={timeline || []} isLoading={timelineLoading} />
      </div>
    </div>
  );
}
