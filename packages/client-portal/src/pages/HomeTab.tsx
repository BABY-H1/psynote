import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  ClipboardCheck,
  CalendarClock,
  Sparkles,
} from 'lucide-react';
import { useClientDashboard, useMyTimeline } from '@client/api/useClientPortal';
import { useMyDocuments } from '@client/api/useConsent';
import { PageLoading, RiskBadge } from '@client/shared/components';
import { TaskCard } from '../components/TaskCard';
import { SectionHeader } from '../components/SectionHeader';

/**
 * Phase 8c — HomeTab: task-driven landing page.
 *
 * The goal here is "open the portal → immediately see what I need to do".
 * We show:
 *
 *   1. Greeting banner with risk status + current intervention type
 *   2. 待办事项 — a list of task cards, computed client-side from 3 sources:
 *        a) unsigned consent documents (useMyDocuments.status='pending')
 *        b) upcoming appointments within next 7 days (useClientDashboard.upcomingAppointments)
 *        c) pending assessment fill-ins — Phase 8c v1 does NOT have a proper
 *           "todo assessment" API; we stub the UI and leave a TODO to wire
 *           when the backend adds `/client/pending-assessments`.
 *   3. 最近动态 — the most recent 3 timeline events from useMyTimeline(),
 *      so users can scroll and see "what happened recently" without leaving
 *      the home tab.
 *   4. Empty-state hero card when there's nothing to do.
 *
 * Data strategy:
 * - Reuses 3 existing hooks; no new server endpoints.
 * - Todo list is computed via useMemo so it only recomputes when underlying
 *   data changes.
 */

const RISK_DISPLAY: Record<
  string,
  { label: string; text: string; bg: string; border: string }
> = {
  level_1: {
    label: '状态良好',
    text: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
  },
  level_2: {
    label: '需要关注',
    text: 'text-yellow-700',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
  },
  level_3: {
    label: '建议咨询',
    text: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
  },
  level_4: {
    label: '请联系咨询师',
    text: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
};

const INTERVENTION_LABEL: Record<string, string> = {
  course: '课程学习',
  group: '团体辅导',
  counseling: '个体咨询',
  referral: '专业转介',
};

export function HomeTab() {
  const navigate = useNavigate();
  const { data: dashboard, isLoading: dashboardLoading } = useClientDashboard();
  const { data: timeline } = useMyTimeline();
  const { data: myDocs } = useMyDocuments();

  // Compute the todo list by combining 3 data sources.
  const todos = useMemo(() => {
    type Todo = {
      id: string;
      icon: React.ReactNode;
      title: string;
      subtitle: string;
      tone: 'brand' | 'amber' | 'blue' | 'green' | 'rose';
      onClick: () => void;
    };
    const list: Todo[] = [];

    // 1. Pending consent documents
    const pendingDocs = (myDocs ?? []).filter((d) => d.status === 'pending');
    if (pendingDocs.length > 0) {
      list.push({
        id: 'pending-docs',
        icon: <FileText className="w-5 h-5" />,
        title: `待签署 ${pendingDocs.length} 份协议`,
        subtitle: '请尽快查看并签署，以便开展后续服务',
        tone: 'amber',
        onClick: () => navigate('/portal/account/consents'),
      });
    }

    // 2. Upcoming appointments within next 7 days
    const now = Date.now();
    const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;
    const upcoming = (dashboard?.upcomingAppointments ?? []).filter((a: any) => {
      const t = new Date(a.startTime).getTime();
      return t >= now && t <= sevenDaysFromNow;
    });
    upcoming.forEach((appt: any) => {
      const d = new Date(appt.startTime);
      const typeLabel =
        appt.type === 'online' ? '线上' : appt.type === 'phone' ? '电话' : '线下';
      list.push({
        id: `appt-${appt.id}`,
        icon: <CalendarClock className="w-5 h-5" />,
        title: `${d.getMonth() + 1}月${d.getDate()}日 ${d.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        })}`,
        subtitle: `${typeLabel}咨询 · 咨询师已确认`,
        tone: 'blue',
        onClick: () => navigate('/portal/services'),
      });
    });

    // 3. Pending assessments — Phase 8c v1 stub. A proper endpoint
    // would be something like GET /client/pending-assessments; for now
    // we surface a placeholder only if useMyTimeline reveals a recently
    // issued assessment event. This keeps the UI functional on demo data
    // and lets the backend catch up later.
    // (Deliberate no-op for now — leave it out rather than showing fake UI.)

    return list;
  }, [myDocs, dashboard, navigate]);

  if (dashboardLoading) {
    return <PageLoading />;
  }

  const riskKey = dashboard?.episode?.currentRisk;
  const risk = riskKey ? RISK_DISPLAY[riskKey] ?? RISK_DISPLAY.level_1 : null;
  const interventionLabel =
    dashboard?.episode?.interventionType &&
    INTERVENTION_LABEL[dashboard.episode.interventionType];

  // Take the 3 most recent timeline events for the "最近动态" section
  const recentEvents = (timeline ?? []).slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Greeting / status banner */}
      {risk ? (
        <div className={`rounded-2xl p-4 border ${risk.bg} ${risk.border}`}>
          <div className="flex items-center gap-3">
            <Sparkles className={`w-5 h-5 ${risk.text}`} />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-500">当前状态</div>
              <div className={`text-base font-bold ${risk.text}`}>{risk.label}</div>
              {interventionLabel && (
                <div className="text-xs text-slate-500 mt-0.5">
                  当前服务: {interventionLabel}
                </div>
              )}
            </div>
            {riskKey && <RiskBadge level={riskKey as any} />}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl p-4 border bg-slate-50 border-slate-200">
          <div className="text-xs text-slate-500">当前状态</div>
          <div className="text-base font-bold text-slate-400">暂无评估记录</div>
        </div>
      )}

      {/* 待办 */}
      <section>
        <SectionHeader title="待办事项" count={todos.length} />
        {todos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center bg-white">
            <div className="text-sm font-medium text-slate-500">
              🎉 所有事项都已完成
            </div>
            <div className="text-xs text-slate-400 mt-1">
              保持良好状态，等待下一次服务安排
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {todos.map((todo) => (
              <TaskCard
                key={todo.id}
                icon={todo.icon}
                title={todo.title}
                subtitle={todo.subtitle}
                tone={todo.tone}
                onClick={todo.onClick}
              />
            ))}
          </div>
        )}
      </section>

      {/* 最近动态 */}
      {recentEvents.length > 0 && (
        <section>
          <SectionHeader
            title="最近动态"
            action={
              <button
                type="button"
                onClick={() => navigate('/portal/archive')}
                className="text-xs text-brand-600 font-medium"
              >
                全部 →
              </button>
            }
          />
          <div className="space-y-2">
            {recentEvents.map((event: any) => (
              <TimelinePreviewCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}

      {/* Unread notifications badge (small footer stat) */}
      {dashboard?.unreadNotificationCount ? (
        <div className="text-center text-xs text-slate-400">
          你有 {dashboard.unreadNotificationCount} 条未读消息
        </div>
      ) : null}
    </div>
  );
}

/**
 * Compact timeline event preview card, used only on the HomeTab for the
 * "最近动态" section. The full Timeline component from the client package
 * is used on ArchiveTab for complete history.
 */
function TimelinePreviewCard({ event }: { event: any }) {
  const date = event.createdAt ? new Date(event.createdAt) : null;
  const dateLabel = date
    ? `${date.getMonth() + 1}/${date.getDate()} ${date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : '';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-slate-700 flex-1 min-w-0">
          {event.title || event.type || '活动'}
        </div>
        {dateLabel && (
          <div className="text-[10px] text-slate-400 flex-shrink-0">{dateLabel}</div>
        )}
      </div>
      {event.description && (
        <div className="text-xs text-slate-500 mt-1 line-clamp-2">{event.description}</div>
      )}
    </div>
  );
}
