import React from 'react';
import type { CareTimelineEvent } from '@psynote/shared';

const eventTypeLabels: Record<string, { label: string; color: string }> = {
  assessment: { label: '测评', color: 'bg-blue-500' },
  appointment: { label: '预约', color: 'bg-purple-500' },
  session_note: { label: '咨询记录', color: 'bg-indigo-500' },
  group_enrollment: { label: '团辅', color: 'bg-teal-500' },
  course_enrollment: { label: '课程', color: 'bg-cyan-500' },
  referral: { label: '转介', color: 'bg-red-500' },
  risk_change: { label: '风险变更', color: 'bg-orange-500' },
  triage_decision: { label: '分流决定', color: 'bg-amber-500' },
  follow_up_plan: { label: '跟踪计划', color: 'bg-green-500' },
  follow_up_review: { label: '跟踪复评', color: 'bg-emerald-500' },
  ai_insight: { label: 'AI洞察', color: 'bg-violet-500' },
  note: { label: '备注', color: 'bg-slate-400' },
  document: { label: '文档', color: 'bg-slate-500' },
};

interface Props {
  events: CareTimelineEvent[];
  isLoading?: boolean;
}

export function Timeline({ events, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-400 text-sm">加载时间线...</div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 text-sm">
        暂无时间线事件
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-2 bottom-2 w-px bg-slate-200" />

      <div className="space-y-4">
        {events.map((event) => {
          const meta = eventTypeLabels[event.eventType] || { label: event.eventType, color: 'bg-slate-400' };

          return (
            <div key={event.id} className="relative pl-10">
              {/* Dot */}
              <div className={`absolute left-2.5 top-1.5 w-3 h-3 rounded-full ${meta.color} ring-2 ring-white`} />

              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full text-white ${meta.color}`}>
                      {meta.label}
                    </span>
                    <h4 className="text-sm font-medium text-slate-900">{event.title}</h4>
                  </div>
                  <time className="text-xs text-slate-400">
                    {new Date(event.createdAt).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                {event.summary && (
                  <p className="text-sm text-slate-600 mt-1">{event.summary}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
