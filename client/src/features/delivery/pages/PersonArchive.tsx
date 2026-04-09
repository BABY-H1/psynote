import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Activity,
  Layers,
  BookOpen,
  ClipboardList,
  Mail,
  Calendar,
  TrendingUp,
} from 'lucide-react';
import {
  PageLoading,
  EmptyCard,
  CardGrid,
  DeliveryCard,
  type DeliveryCardData,
} from '../../../shared/components';
import {
  usePersonArchive,
  type ArchivedService,
  type ArchiveTimelineEvent,
  type ArchiveServiceKind,
} from '../../../api/usePersonArchive';

/**
 * Phase 6 — Person archive detail page.
 *
 * Mounted at `/delivery/people/:userId`. Shows the full cross-module service
 * history of one user:
 *   - Header: avatar + name + email + 4 stat tiles (counseling/group/course/assessment counts)
 *   - Services: cross-module DeliveryCard grid, sorted by last activity desc
 *   - Timeline: chronological event list (oldest → newest)
 */
export function PersonArchive() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = usePersonArchive(userId);

  if (isLoading || !data) return <PageLoading text="加载对象档案..." />;

  const { user, stats, services, timeline } = data;

  const statTiles: { label: string; value: number; icon: React.ReactNode; tone: string }[] = [
    { label: '个案', value: stats.counseling, icon: <Activity className="w-4 h-4" />, tone: 'bg-brand-50 text-brand-600' },
    { label: '团辅', value: stats.group, icon: <Layers className="w-4 h-4" />, tone: 'bg-amber-50 text-amber-600' },
    { label: '课程', value: stats.course, icon: <BookOpen className="w-4 h-4" />, tone: 'bg-purple-50 text-purple-600' },
    { label: '测评', value: stats.assessment, icon: <ClipboardList className="w-4 h-4" />, tone: 'bg-cyan-50 text-cyan-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        type="button"
        onClick={() => navigate('/delivery?type=archive')}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="w-4 h-4" /> 返回对象列表
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-xl font-bold flex-shrink-0">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900">{user.name}</h1>
            {user.email && (
              <div className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                {user.email}
              </div>
            )}
            <div className="text-xs text-slate-400 mt-1">
              共 {stats.total} 项服务记录
            </div>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          {statTiles.map((s) => (
            <div key={s.label} className="bg-slate-50 rounded-lg p-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.tone}`}>
                {s.icon}
              </div>
              <div>
                <div className="text-xs text-slate-500">{s.label}</div>
                <div className="text-lg font-bold text-slate-900">{s.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two-column body: services on the left, timeline on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Services (2/3 width) */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">服务列表</h2>
          {services.length === 0 ? (
            <EmptyCard title="该对象暂无服务记录" />
          ) : (
            <CardGrid cols={1}>
              {services.map((svc) => (
                <DeliveryCard
                  key={`${svc.kind}-${svc.id}`}
                  data={archivedServiceToCardData(svc)}
                  onOpen={() => openArchivedService(svc, navigate)}
                />
              ))}
            </CardGrid>
          )}
        </div>

        {/* Timeline (1/3 width) */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">完整时间线</h2>
          {timeline.length === 0 ? (
            <EmptyCard title="无时间线事件" />
          ) : (
            <Timeline events={timeline} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function archivedServiceToCardData(svc: ArchivedService): DeliveryCardData {
  const meta: DeliveryCardData['meta'] = [];
  if (svc.kind === 'counseling') {
    if (svc.currentRisk) meta.push({ label: '风险', value: svc.currentRisk });
  } else if (svc.kind === 'assessment') {
    if (svc.totalScore !== null) meta.push({ label: '总分', value: svc.totalScore });
  }
  if (svc.joinedAt) {
    meta.push({ label: '加入', value: formatDate(svc.joinedAt) });
  }
  return {
    id: svc.id,
    kind: svc.kind,
    title: svc.title,
    status: svc.status as DeliveryCardData['status'],
    description: svc.description ?? undefined,
    meta,
  };
}

function openArchivedService(svc: ArchivedService, navigate: (to: string) => void) {
  if (svc.kind === 'counseling') {
    navigate(`/episodes/${svc.id}`);
    return;
  }
  navigate(`/delivery?type=${svc.kind}`);
}

const TIMELINE_TONE: Record<ArchiveServiceKind, string> = {
  counseling: 'bg-brand-500',
  group: 'bg-amber-500',
  course: 'bg-purple-500',
  assessment: 'bg-cyan-500',
};

function Timeline({ events }: { events: ArchiveTimelineEvent[] }) {
  // Display newest first for the right-side column (better for "what's new")
  const display = [...events].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <ol className="relative border-l border-slate-200 pl-4 space-y-4">
        {display.map((event) => (
          <li key={event.id} className="relative">
            <span
              className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full ${TIMELINE_TONE[event.kind]}`}
            />
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {formatDate(event.at)}
            </div>
            <div className="text-sm text-slate-800 mt-0.5">{event.title}</div>
            {event.detail && (
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-slate-400" /> {event.detail}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
