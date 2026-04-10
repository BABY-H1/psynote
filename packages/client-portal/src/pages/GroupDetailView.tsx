/**
 * Phase 9γ — Group instance detail (portal-side).
 *
 * Shows the participant their enrollment for a group: scheme overview,
 * upcoming + past sessions, attendance status, and per-session content blocks.
 *
 * Each session can be expanded inline; expanding renders the
 * ContentBlockRenderer scoped to the SCHEME session id (because content blocks
 * live on the scheme, not the runtime record). Visibility filtering is done
 * client-side (participant + both only).
 *
 * The "签到" button posts to the new check-in endpoint.
 */
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Users, Calendar, CheckCircle2, Circle, ChevronDown, ChevronUp, MapPin,
} from 'lucide-react';
import { api } from '@client/api/client';
import { useAuthStore } from '@client/stores/authStore';
import { PageLoading, useToast } from '@client/shared/components';
import { ContentBlockRenderer } from '../components/ContentBlockRenderer';

interface GroupDetailResponse {
  enrollment: {
    id: string;
    instanceId: string;
    userId: string;
    status: string;
  };
  instance: {
    id: string;
    title: string;
    description?: string;
    schedule?: string;
    location?: string;
    leaderId?: string;
    capacity?: number;
    status: string;
    schemeId?: string;
  };
  scheme: {
    id: string;
    title: string;
    description?: string;
    overallGoal?: string;
    totalSessions?: number;
  } | null;
  schemeSessions: Array<{
    id: string;
    title: string;
    goal?: string;
    sortOrder: number;
  }>;
  sessionRecords: Array<{
    id: string;
    schemeSessionId: string | null;
    sessionNumber: number;
    title: string;
    date: string | null;
    status: string;
    notes: string | null;
    myAttendance: {
      id: string;
      status: string;
    } | null;
  }>;
}

export function GroupDetailView() {
  const { id: instanceId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const orgId = useAuthStore((s) => s.currentOrgId);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['portal-group-detail', orgId, instanceId],
    queryFn: () => api.get<GroupDetailResponse>(`/orgs/${orgId}/client/groups/${instanceId}`),
    enabled: !!orgId && !!instanceId,
  });

  const checkIn = useMutation({
    mutationFn: (sessionRecordId: string) =>
      api.post<{ id: string; status: string }>(
        `/orgs/${orgId}/client/groups/${instanceId}/sessions/${sessionRecordId}/check-in`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-group-detail', orgId, instanceId] });
      toast('已签到', 'success');
    },
    onError: (err: any) => {
      toast(err?.message ?? '签到失败', 'error');
    },
  });

  if (isLoading) return <PageLoading />;

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-slate-500 mb-4">无法加载团辅信息</p>
        <button
          type="button"
          onClick={() => navigate('/portal/services')}
          className="text-sm text-blue-600 hover:underline"
        >
          返回服务大厅
        </button>
      </div>
    );
  }

  const { instance, scheme, sessionRecords } = data;

  const upcomingRecords = sessionRecords.filter((r) => r.status === 'planned');
  const completedRecords = sessionRecords.filter((r) => r.status === 'completed');

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/portal/services')}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="w-3 h-3" /> 返回服务大厅
      </button>

      {/* Group header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
            <Users className="w-6 h-6 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-slate-900">{instance.title}</h1>
            {instance.description && (
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{instance.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
              {instance.schedule && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {instance.schedule}
                </span>
              )}
              {instance.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {instance.location}
                </span>
              )}
            </div>
          </div>
        </div>

        {scheme?.overallGoal && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-500 mb-1">整体目标</div>
            <p className="text-xs text-slate-700 leading-relaxed">{scheme.overallGoal}</p>
          </div>
        )}
      </div>

      {/* Upcoming sessions */}
      {upcomingRecords.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 px-1 mb-2">即将到来</h2>
          <div className="space-y-2">
            {upcomingRecords.map((record) => (
              <SessionCard
                key={record.id}
                record={record}
                expanded={expandedSession === record.id}
                onToggle={() =>
                  setExpandedSession((id) => (id === record.id ? null : record.id))
                }
                onCheckIn={() => checkIn.mutate(record.id)}
                checkInPending={checkIn.isPending}
                enrollmentId={data.enrollment.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed sessions */}
      {completedRecords.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 px-1 mb-2">已完成</h2>
          <div className="space-y-2">
            {completedRecords.map((record) => (
              <SessionCard
                key={record.id}
                record={record}
                expanded={expandedSession === record.id}
                onToggle={() =>
                  setExpandedSession((id) => (id === record.id ? null : record.id))
                }
                onCheckIn={() => checkIn.mutate(record.id)}
                checkInPending={checkIn.isPending}
                enrollmentId={data.enrollment.id}
              />
            ))}
          </div>
        </div>
      )}

      {sessionRecords.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-500">还没有团辅会议安排</p>
          <p className="text-xs text-slate-400 mt-1">带组人发布会议后会在这里显示</p>
        </div>
      )}
    </div>
  );
}

function SessionCard({
  record, expanded, onToggle, onCheckIn, checkInPending, enrollmentId,
}: {
  record: GroupDetailResponse['sessionRecords'][0];
  expanded: boolean;
  onToggle: () => void;
  onCheckIn: () => void;
  checkInPending: boolean;
  enrollmentId: string;
}) {
  const attended = record.myAttendance?.status === 'present';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 text-left hover:bg-slate-50 transition flex items-center justify-between"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-violet-50 flex items-center justify-center text-violet-600 font-bold text-sm flex-shrink-0">
            {record.sessionNumber}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">{record.title}</div>
            {record.date && (
              <div className="text-xs text-slate-400 mt-0.5">
                {new Date(record.date).toLocaleDateString('zh-CN')}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {attended ? (
            <span className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> 已签到
            </span>
          ) : (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Circle className="w-3 h-3" /> 未签到
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-3">
          {!attended && record.status === 'completed' && (
            <button
              type="button"
              onClick={onCheckIn}
              disabled={checkInPending}
              className="w-full py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {checkInPending ? '签到中…' : '签到'}
            </button>
          )}

          {/* Phase 9α — content blocks attached to the SCHEME session (not the record).
              We use schemeSessionId because content blocks live on the scheme; same blocks
              are reused across multiple cohort runtimes. */}
          {record.schemeSessionId ? (
            <ContentBlockRenderer
              parentType="group"
              parentId={record.schemeSessionId}
              enrollmentId={enrollmentId}
              enrollmentType="group"
            />
          ) : (
            <p className="text-xs text-slate-400 italic">本次会议尚无可消费的内容</p>
          )}

          {record.notes && (
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-500 mb-1">带组人备注</div>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                {record.notes}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
