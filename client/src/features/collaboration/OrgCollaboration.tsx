/**
 * Phase 9ε — Org-internal collaboration page.
 *
 * Single page with 4 tabs that consolidate the day-to-day org operations:
 *   - 派单 (Assignment)        — see who needs assignment, dispatch new clients
 *   - 临时授权 (Access Grants)  — manage cross-counselor temporary access
 *   - 督导待审 (Pending Review) — supervisor inbox for note review
 *   - 收到的转介 (Inbox)        — accept/reject incoming referrals (Phase 9δ)
 *
 * The audit log query lives on a sibling page (see AuditLogViewer.tsx) and
 * is reachable from the same nav entry only by org_admin. We separate it
 * because the audience and access pattern differ — admins do periodic
 * compliance reviews, not daily collaboration triage.
 */
import React, { useState } from 'react';
import { Users, ShieldCheck, ClipboardList, Inbox, Loader2, Check, X } from 'lucide-react';
import {
  useUnassignedClients,
  useAssignmentsList,
  usePendingNotes,
  useReviewPendingNote,
} from '../../api/useCollaboration';
import { useToast } from '../../shared/components';

type TabKey = 'assignment' | 'grants' | 'supervision' | 'inbox';

const TABS: { key: TabKey; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'assignment', label: '派单', Icon: Users },
  { key: 'grants', label: '临时授权', Icon: ShieldCheck },
  { key: 'supervision', label: '督导待审', Icon: ClipboardList },
  { key: 'inbox', label: '收到的转介', Icon: Inbox },
];

export function OrgCollaboration() {
  const [tab, setTab] = useState<TabKey>('assignment');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">机构协作</h1>
        <p className="text-sm text-slate-500 mt-1">派单 / 授权 / 督导 / 转介接收 一处管理</p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-200">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
              tab === key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'assignment' && <AssignmentTab />}
        {tab === 'grants' && <GrantsTab />}
        {tab === 'supervision' && <SupervisionTab />}
        {tab === 'inbox' && <ReferralInboxTab />}
      </div>
    </div>
  );
}

// ─── Tab A: Assignment ──────────────────────────────────────────────

function AssignmentTab() {
  const { data: unassigned = [], isLoading: loadingU } = useUnassignedClients();
  const { data: assignments = [], isLoading: loadingA } = useAssignmentsList();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white border border-slate-200 rounded-xl">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">待分配的来访者</h2>
          <span className="text-xs text-slate-400">{unassigned.length}</span>
        </div>
        <div className="divide-y divide-slate-100">
          {loadingU && <div className="p-4 text-sm text-slate-400">加载中…</div>}
          {!loadingU && unassigned.length === 0 && (
            <div className="p-6 text-sm text-slate-400 text-center">暂无未分配的来访者</div>
          )}
          {unassigned.map((c) => (
            <div key={c.id} className="p-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-800">{c.name}</div>
                <div className="text-xs text-slate-400">
                  注册于 {new Date(c.joined_at).toLocaleDateString('zh-CN')}
                </div>
              </div>
              <button
                type="button"
                disabled
                className="px-3 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                title="拖拽到右侧咨询师上即可分配（v0 占位）"
              >
                分配
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">已派单</h2>
          <span className="text-xs text-slate-400">{assignments.length}</span>
        </div>
        <div className="divide-y divide-slate-100">
          {loadingA && <div className="p-4 text-sm text-slate-400">加载中…</div>}
          {!loadingA && assignments.length === 0 && (
            <div className="p-6 text-sm text-slate-400 text-center">暂无派单记录</div>
          )}
          {assignments.map((a) => (
            <div key={a.id} className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-800">{a.client_name}</span>
                <span className="text-xs text-slate-500">→ {a.counselor_name}</span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                <span>{new Date(a.assigned_at).toLocaleDateString('zh-CN')}</span>
                {a.is_primary && (
                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">主咨询师</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab B: Grants ──────────────────────────────────────────────────

function GrantsTab() {
  // The active grants list is already exposed by client-access-grant.routes.ts.
  // We could re-render it here, but for Phase 9ε we keep this tab as a stub
  // that points to the existing UI (or tells the admin to use that page).
  return (
    <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center">
      <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
      <p className="text-sm text-slate-600 mb-1">临时授权管理</p>
      <p className="text-xs text-slate-400">
        v0 占位 — 数据模型 (`client_access_grants`) 已存在，UI 在 Phase 9ε+ 完善
      </p>
    </div>
  );
}

// ─── Tab C: Supervision ─────────────────────────────────────────────

function SupervisionTab() {
  const { data: notes = [], isLoading } = usePendingNotes();
  const review = useReviewPendingNote();
  const { toast } = useToast();
  const [annotation, setAnnotation] = useState('');
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  async function handleReview(noteId: string, decision: 'approve' | 'reject') {
    try {
      await review.mutateAsync({ noteId, decision, annotation });
      toast(decision === 'approve' ? '已通过' : '已退回', 'success');
      setAnnotation('');
      setActiveNoteId(null);
    } catch (err: any) {
      toast(err?.message ?? '操作失败', 'error');
    }
  }

  if (isLoading) return <div className="text-sm text-slate-400">加载中…</div>;

  if (notes.length === 0) {
    return (
      <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center">
        <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500">没有待审核的会谈记录</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {notes.map((note) => {
        const isActive = activeNoteId === note.id;
        return (
          <div key={note.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-slate-800">
                  {note.counselor_name} · {note.client_name}
                </span>
                <span className="text-xs text-slate-400">
                  {note.session_date} · {note.note_format.toUpperCase()}
                </span>
              </div>
              {note.summary && (
                <p className="text-xs text-slate-600 leading-relaxed">{note.summary}</p>
              )}
              <div className="text-xs text-slate-400 mt-1">
                提交于 {note.submitted_for_review_at
                  ? new Date(note.submitted_for_review_at).toLocaleString('zh-CN')
                  : '—'}
              </div>
            </div>

            <div className="px-4 pb-3 flex items-center gap-2">
              {!isActive && (
                <>
                  <button
                    type="button"
                    onClick={() => handleReview(note.id, 'approve')}
                    disabled={review.isPending}
                    className="px-3 py-1 text-xs bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 flex items-center gap-1 disabled:opacity-50"
                  >
                    <Check className="w-3 h-3" /> 通过
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveNoteId(note.id)}
                    className="px-3 py-1 text-xs bg-amber-50 text-amber-700 rounded hover:bg-amber-100 flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> 退回
                  </button>
                </>
              )}
            </div>

            {isActive && (
              <div className="border-t border-slate-100 p-3 space-y-2">
                <textarea
                  value={annotation}
                  onChange={(e) => setAnnotation(e.target.value)}
                  rows={3}
                  className="w-full text-sm border border-slate-200 rounded p-2"
                  placeholder="批注（必填）"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleReview(note.id, 'reject')}
                    disabled={!annotation.trim() || review.isPending}
                    className="px-3 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    {review.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                    确认退回
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveNoteId(null); setAnnotation(''); }}
                    className="px-3 py-1 text-xs text-slate-500"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab D: Referral inbox ──────────────────────────────────────────

function ReferralInboxTab() {
  // Reuses the existing /referrals/inbox endpoint from Phase 9δ.
  // We fetch via direct api here to keep the dependency tree thin.
  const { data: inbox = [], isLoading } = useReferralInbox();

  if (isLoading) return <div className="text-sm text-slate-400">加载中…</div>;

  if (inbox.length === 0) {
    return (
      <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center">
        <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500">没有待处理的转介</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {inbox.map((r) => (
        <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-sm font-semibold text-slate-800 mb-1">
            {r.targetName ?? '转介来访者'}
          </div>
          <div className="text-xs text-slate-500 leading-relaxed">{r.reason}</div>
          {r.riskSummary && (
            <div className="text-xs text-amber-700 mt-1">⚠️ {r.riskSummary}</div>
          )}
          <div className="text-xs text-slate-400 mt-2">
            状态：{r.status} · 创建于 {new Date(r.createdAt).toLocaleString('zh-CN')}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Local hook for inbox (avoids depending on a non-existent useReferrals hook) ──

import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';

interface ReferralInboxRow {
  id: string;
  targetName: string | null;
  reason: string;
  riskSummary: string | null;
  status: string;
  createdAt: string;
}

function useReferralInbox() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  return useQuery({
    queryKey: ['referral-inbox', orgId],
    queryFn: () => api.get<ReferralInboxRow[]>(`/orgs/${orgId}/referrals/inbox`),
    enabled: !!orgId,
  });
}
