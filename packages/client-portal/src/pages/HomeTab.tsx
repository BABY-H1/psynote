import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, CalendarClock, Layers, BookOpen, MessageSquare, ChevronRight,
} from 'lucide-react';
import { useClientDashboard, useMyTimeline, useAvailableGroups, useAvailableCourses } from '@client/api/useClientPortal';
import { useMyDocuments } from '@client/api/useConsent';
import { useAuthStore } from '@client/stores/authStore';
import { PageLoading } from '@client/shared/components';
import { TaskCard } from '../components/TaskCard';
import { SectionHeader } from '../components/SectionHeader';
import { useViewingContext } from '../stores/viewingContext';

/**
 * HomeTab —— "打开门户立刻看到要做什么"。
 *
 * 去掉旧版顶部的风险/干预状态 banner（对来访者过度暴露不友好，且 Phase 8c
 * 的实现基本是没接上的死路）。只保留 3 段内容：
 *
 *   1. 待办事项 —— 合并自三个数据源（待签协议 / 7 天内预约）
 *   2. 可报名活动 / 预约咨询 —— 机构对我开放的团辅、课程和咨询入口
 *      （tabs 切换，避免一屏塞太满）
 *   3. 最近动态 —— 时间线前 3 条
 */

type HubTab = 'activities' | 'counseling';

export function HomeTab() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const viewingAs = useViewingContext((s) => s.viewingAs);
  const viewingAsName = useViewingContext((s) => s.viewingAsName);
  const isViewingChild = !!viewingAs;
  const { data: dashboard, isLoading: dashboardLoading } = useClientDashboard({ as: viewingAs ?? undefined });
  const { data: timeline } = useMyTimeline();
  const { data: myDocs } = useMyDocuments({ as: viewingAs ?? undefined });
  const { data: groups } = useAvailableGroups();
  const { data: courses } = useAvailableCourses();

  const [hubTab, setHubTab] = useState<HubTab>('activities');

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
          hour: '2-digit', minute: '2-digit',
        })}`,
        subtitle: `${typeLabel}咨询 · 咨询师已确认`,
        tone: 'blue',
        onClick: () => navigate('/portal/services'),
      });
    });

    return list;
  }, [myDocs, dashboard, navigate]);

  if (dashboardLoading) return <PageLoading />;

  const recentEvents = isViewingChild ? [] : (timeline ?? []).slice(0, 3);

  const openGroups = isViewingChild ? [] : (groups ?? []).filter((g: any) => !g.myEnrollmentStatus);
  const openCourses = isViewingChild ? [] : (courses ?? []).filter((c: any) => !c.enrollment);

  const greetingName = isViewingChild ? viewingAsName : user?.name;

  return (
    <div className="flex flex-col gap-4">
      {/* 欢迎 */}
      <div>
        <h1 className="text-lg font-bold text-slate-900">
          你好，{greetingName || '朋友'}
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {isViewingChild ? '正在查看孩子的状态' : '愿你今天感觉不错'}
        </p>
      </div>

      {/* 1. 待办事项 */}
      <section>
        <SectionHeader title="待办事项" count={todos.length} />
        {todos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center bg-white">
            <div className="text-sm font-medium text-slate-500">🎉 所有事项都已完成</div>
            <div className="text-xs text-slate-400 mt-1">保持良好状态，等待下一次服务安排</div>
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

      {/* 2. 可报名活动 / 预约咨询 */}
      {!isViewingChild && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-900">发现服务</h3>
            <div className="flex bg-slate-100 rounded-full p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setHubTab('activities')}
                className={`px-3 py-1 rounded-full transition ${
                  hubTab === 'activities' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                可报名活动
              </button>
              <button
                type="button"
                onClick={() => setHubTab('counseling')}
                className={`px-3 py-1 rounded-full transition ${
                  hubTab === 'counseling' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                预约咨询
              </button>
            </div>
          </div>

          {hubTab === 'activities' ? (
            <div className="space-y-2">
              {openGroups.length === 0 && openCourses.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center bg-white">
                  <div className="text-sm text-slate-500">暂无开放的活动</div>
                  <div className="text-xs text-slate-400 mt-1">机构发布后会出现在这里</div>
                </div>
              ) : (
                <>
                  {openGroups.slice(0, 3).map((g: any) => (
                    <ActivityRow
                      key={g.id}
                      icon={<Layers className="w-5 h-5" />}
                      tone="amber"
                      title={g.title}
                      subtitle={g.description || '团体辅导'}
                      meta={g.startDate ? `${g.startDate}${g.location ? ' · ' + g.location : ''}` : '待定'}
                      onClick={() => navigate(`/portal/services/group/${g.id}`)}
                    />
                  ))}
                  {openCourses.slice(0, 3).map((c: any) => (
                    <ActivityRow
                      key={c.courseId || c.id}
                      icon={<BookOpen className="w-5 h-5" />}
                      tone="purple"
                      title={c.courseTitle || c.title}
                      subtitle={c.courseCategory || '自助课程'}
                      meta="点击了解"
                      onClick={() => navigate(`/portal/services/course/${c.courseId || c.id}`)}
                    />
                  ))}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => navigate('/portal/book')}
                className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3 text-left transition active:scale-[0.98] hover:border-slate-300"
              >
                <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900">预约个体咨询</div>
                  <div className="text-xs text-slate-500 mt-0.5">选择咨询师并发起预约申请</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
              </button>
              <div className="text-xs text-slate-400 px-2">
                提交申请后，咨询师确认时间会在"待办事项"中通知你。
              </div>
            </div>
          )}
        </section>
      )}

      {/* 3. 最近动态 */}
      {recentEvents.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-900">最近动态</h3>
            <button
              type="button"
              onClick={() => navigate('/portal/archive')}
              className="text-xs text-brand-600 font-medium"
            >
              全部 →
            </button>
          </div>
          <div className="space-y-2">
            {recentEvents.map((event: any) => (
              <TimelinePreviewCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ActivityRow({
  icon, tone, title, subtitle, meta, onClick,
}: {
  icon: React.ReactNode;
  tone: 'amber' | 'purple';
  title: string;
  subtitle: string;
  meta: string;
  onClick: () => void;
}) {
  const toneMap = {
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-start gap-3 text-left transition active:scale-[0.98] hover:border-slate-300"
    >
      <div className={`w-11 h-11 rounded-xl ${toneMap[tone]} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900 truncate">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{subtitle}</div>
        <div className="text-xs text-slate-400 mt-1">{meta}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-3" />
    </button>
  );
}

function TimelinePreviewCard({ event }: { event: any }) {
  const date = event.createdAt ? new Date(event.createdAt) : null;
  const dateLabel = date
    ? `${date.getMonth() + 1}/${date.getDate()} ${date.toLocaleTimeString('zh-CN', {
        hour: '2-digit', minute: '2-digit',
      })}`
    : '';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-slate-700 flex-1 min-w-0">
          {event.title || event.type || '活动'}
        </div>
        {dateLabel && <div className="text-[10px] text-slate-400 flex-shrink-0">{dateLabel}</div>}
      </div>
      {event.description && (
        <div className="text-xs text-slate-500 mt-1 line-clamp-2">{event.description}</div>
      )}
    </div>
  );
}
