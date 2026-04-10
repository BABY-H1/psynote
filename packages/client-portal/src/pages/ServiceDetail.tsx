import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Calendar, Clock, MapPin, User as UserIcon, Video, Phone } from 'lucide-react';
import { useMyAppointments } from '@client/api/useClientPortal';
import { PageLoading, StatusBadge } from '@client/shared/components';
import { SectionHeader } from '../components/SectionHeader';
// Phase 9γ — group drill-down
import { GroupDetailView } from './GroupDetailView';

/**
 * Phase 8c — ServiceDetail: counseling service drill-down.
 *
 * Route: /portal/services/counseling/:counselorId
 *
 * Shows:
 *   - Counselor identity card (name + avatar placeholder)
 *   - "下次预约" CTA button → navigates to BookAppointment with counselor pre-selected
 *   - "预约历史" list: all appointments with this counselor, past + upcoming,
 *     sorted newest-first. Each row shows date, time, type, status.
 *
 * Group and course detail pages are deferred — they'd need dedicated endpoints
 * (`/client/groups/:id`, `/client/courses/:id`) that don't exist yet. For now
 * clicking a group card in MyServicesTab lands here for counseling, and does
 * nothing actionable for group/course beyond the navigate() call. Phase 8c is
 * explicitly scoped to "zero server changes", so ServiceDetail covers the one
 * kind (counseling) where existing APIs are sufficient.
 */
export function ServiceDetail() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const navigate = useNavigate();
  const { data: appointments, isLoading } = useMyAppointments();

  if (isLoading) return <PageLoading />;

  // Phase 9γ — group drill-down delegates to GroupDetailView.
  if (kind === 'group') {
    return <GroupDetailView />;
  }

  if (kind !== 'counseling') {
    // Course drill-down has its own dedicated route via /portal/services/course/:id.
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center bg-white">
        <div className="text-sm font-medium text-slate-500">此服务详情暂不可用</div>
        <button
          type="button"
          onClick={() => navigate('/portal/services')}
          className="mt-4 text-xs text-brand-600 font-medium"
        >
          返回我的服务
        </button>
      </div>
    );
  }

  // Filter appointments to this counselor
  const mine = (appointments ?? []).filter((a: any) => {
    const aCounselorId = a.counselorId || a.counselor?.id;
    return aCounselorId === id;
  });

  const now = Date.now();
  const upcoming = mine
    .filter((a: any) => new Date(a.startTime).getTime() >= now)
    .sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));
  const past = mine
    .filter((a: any) => new Date(a.startTime).getTime() < now)
    .sort((a: any, b: any) => b.startTime.localeCompare(a.startTime));

  const counselorName =
    (mine[0] as any)?.counselor?.name || '我的咨询师';

  return (
    <div className="space-y-6">
      {/* Counselor card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-xl font-bold flex-shrink-0">
          <UserIcon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-slate-900 truncate">
            {counselorName}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            共 {mine.length} 次预约
          </div>
        </div>
      </div>

      {/* Book next appointment CTA */}
      <button
        type="button"
        onClick={() => navigate(`/portal/book?counselorId=${id}`)}
        className="w-full py-3.5 bg-brand-600 text-white rounded-2xl text-sm font-semibold hover:bg-brand-500 active:scale-[0.99] transition flex items-center justify-center gap-2"
      >
        <Calendar className="w-4 h-4" />
        预约下一次咨询
      </button>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section>
          <SectionHeader title="即将到来" count={upcoming.length} />
          <div className="space-y-2">
            {upcoming.map((apt: any) => (
              <AppointmentCard key={apt.id} apt={apt} />
            ))}
          </div>
        </section>
      )}

      {/* Past */}
      {past.length > 0 && (
        <section>
          <SectionHeader title="历史预约" count={past.length} />
          <div className="space-y-2">
            {past.map((apt: any) => (
              <AppointmentCard key={apt.id} apt={apt} />
            ))}
          </div>
        </section>
      )}

      {mine.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center bg-white">
          <div className="text-sm font-medium text-slate-500">暂无预约记录</div>
          <div className="text-xs text-slate-400 mt-1">
            点击上方按钮预约你的第一次咨询
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_MAP: Record<
  string,
  { label: string; variant: 'yellow' | 'blue' | 'green' | 'slate' | 'red' }
> = {
  pending: { label: '待确认', variant: 'yellow' },
  confirmed: { label: '已确认', variant: 'blue' },
  completed: { label: '已完成', variant: 'green' },
  cancelled: { label: '已取消', variant: 'slate' },
  no_show: { label: '未到场', variant: 'red' },
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  online: <Video className="w-3 h-3" />,
  phone: <Phone className="w-3 h-3" />,
  offline: <MapPin className="w-3 h-3" />,
};

const TYPE_LABEL: Record<string, string> = {
  online: '线上',
  phone: '电话',
  offline: '线下',
};

function AppointmentCard({ apt }: { apt: any }) {
  const status = STATUS_MAP[apt.status] ?? STATUS_MAP.pending;
  const start = new Date(apt.startTime);
  const end = new Date(apt.endTime);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900">
            {start.toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
            <Clock className="w-3 h-3" />
            {start.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            {' - '}
            {end.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            {apt.type && (
              <>
                <span className="mx-1">·</span>
                {TYPE_ICON[apt.type]}
                {TYPE_LABEL[apt.type] ?? apt.type}
              </>
            )}
          </div>
          {apt.notes && (
            <div className="text-xs text-slate-400 mt-1 line-clamp-2">{apt.notes}</div>
          )}
        </div>
        <StatusBadge label={status.label} variant={status.variant} />
      </div>
    </div>
  );
}
