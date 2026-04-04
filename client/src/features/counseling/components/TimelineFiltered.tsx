import React, { useState } from 'react';
import type { CareTimelineEvent } from '@psynote/shared';
import { FileText, BarChart3, AlertTriangle, ArrowRightLeft, FileCheck, Circle } from 'lucide-react';

const eventTypeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  session_note: { icon: <FileText className="w-3 h-3" />, color: 'bg-emerald-500', label: '笔记' },
  assessment: { icon: <BarChart3 className="w-3 h-3" />, color: 'bg-blue-500', label: '评估' },
  risk_change: { icon: <AlertTriangle className="w-3 h-3" />, color: 'bg-orange-500', label: '风险' },
  referral: { icon: <ArrowRightLeft className="w-3 h-3" />, color: 'bg-red-500', label: '转介' },
  document: { icon: <FileCheck className="w-3 h-3" />, color: 'bg-purple-500', label: '协议' },
  treatment_plan: { icon: <FileText className="w-3 h-3" />, color: 'bg-teal-500', label: '计划' },
  follow_up_plan: { icon: <Circle className="w-3 h-3" />, color: 'bg-green-500', label: '随访' },
  follow_up_review: { icon: <Circle className="w-3 h-3" />, color: 'bg-emerald-500', label: '复评' },
  appointment: { icon: <Circle className="w-3 h-3" />, color: 'bg-sky-500', label: '预约' },
  note: { icon: <Circle className="w-3 h-3" />, color: 'bg-slate-400', label: '备注' },
  triage_decision: { icon: <Circle className="w-3 h-3" />, color: 'bg-indigo-500', label: '分流' },
};

const filterOptions = [
  { key: 'all', label: '全部' },
  { key: 'session_note', label: '笔记' },
  { key: 'assessment', label: '评估' },
  { key: 'risk_change', label: '风险' },
  { key: 'referral', label: '转介' },
  { key: 'document', label: '协议' },
];

interface EpisodeGroup {
  id: string;
  label: string;
  status: string;
  isCurrent: boolean;
  events: CareTimelineEvent[];
}

interface Props {
  events: CareTimelineEvent[];
  episodes?: { id: string; chiefComplaint?: string; status: string; openedAt: string; closedAt?: string }[];
  currentEpisodeId?: string;
  onEventClick?: (event: CareTimelineEvent) => void;
  isLoading?: boolean;
}

export function TimelineFiltered({ events, episodes, currentEpisodeId, onEventClick, isLoading }: Props) {
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all'
    ? events
    : events.filter((e) => e.eventType === filter);

  // Group by episode
  const groups: EpisodeGroup[] = [];
  if (episodes && episodes.length > 0) {
    for (const ep of episodes) {
      const epEvents = filtered.filter((e) => e.careEpisodeId === ep.id);
      if (epEvents.length > 0 || ep.id === currentEpisodeId) {
        groups.push({
          id: ep.id,
          label: ep.chiefComplaint || '个案',
          status: ep.status,
          isCurrent: ep.id === currentEpisodeId,
          events: epEvents,
        });
      }
    }
  } else {
    // No episode grouping, show all
    groups.push({ id: 'all', label: '全部事件', status: '', isCurrent: true, events: filtered });
  }

  return (
    <div className="p-3 space-y-3">
      {/* Filter pills */}
      <div className="flex flex-wrap gap-1">
        {filterOptions.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2 py-1 rounded text-xs font-medium transition ${
              filter === f.key
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grouped events */}
      {isLoading ? (
        <div className="text-xs text-slate-400 text-center py-4">加载中...</div>
      ) : groups.length === 0 || groups.every((g) => g.events.length === 0) ? (
        <div className="text-xs text-slate-400 text-center py-4">暂无事件</div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.id}>
              {/* Episode separator */}
              {episodes && episodes.length > 1 && (
                <div className={`flex items-center gap-2 mb-2 ${group.isCurrent ? '' : 'opacity-60'}`}>
                  <div className={`h-px flex-1 ${group.isCurrent ? 'bg-brand-300' : 'bg-slate-200'}`} />
                  <span className={`text-xs font-medium px-2 ${group.isCurrent ? 'text-brand-700' : 'text-slate-400'}`}>
                    {group.label}
                    {group.status === 'closed' && ' (已结案)'}
                  </span>
                  <div className={`h-px flex-1 ${group.isCurrent ? 'bg-brand-300' : 'bg-slate-200'}`} />
                </div>
              )}

              {/* Events */}
              <div className="space-y-0.5">
                {group.events.map((event) => {
                  const config = eventTypeConfig[event.eventType] || eventTypeConfig.note;
                  return (
                    <button
                      key={event.id}
                      onClick={() => onEventClick?.(event)}
                      className={`w-full text-left flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 transition ${
                        !group.isCurrent ? 'opacity-50' : ''
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full ${config.color} text-white flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        {config.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-slate-700 truncate">{event.title}</div>
                        {event.summary && (
                          <div className="text-xs text-slate-400 truncate">{event.summary}</div>
                        )}
                      </div>
                      <div className="text-xs text-slate-300 flex-shrink-0 whitespace-nowrap">
                        {formatDate(event.createdAt)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${m}/${day} ${h}:${min}`;
}
