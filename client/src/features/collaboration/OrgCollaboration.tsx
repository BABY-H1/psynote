/**
 * Phase 10 — Org collaboration center.
 *
 * 4 tabs:
 *   - 派单 (Assignment)        — assign unassigned clients to counselors
 *   - 临时授权 (Access Grants)  — manage cross-counselor temporary access
 *   - 督导待审 (Pending Review) — supervisor inbox for note review
 *   - 收到的转介 (Inbox)        — accept/reject incoming referrals
 */
import React, { useState } from 'react';
import {
  Users, ShieldCheck, ClipboardList, Inbox, Loader2, Check, X, Plus, Trash2,
} from 'lucide-react';
import {
  useUnassignedClients,
  useAssignmentsList,
  useCreateAssignment,
  useDeleteAssignment,
  useAccessGrants,
  useCreateAccessGrant,
  useRevokeAccessGrant,
  usePendingNotes,
  useReviewPendingNote,
  useRespondReferral,
} from '../../api/useCollaboration';
import { useOrgMembers, type OrgMember } from '../../api/useOrg';
import { useToast } from '../../shared/components';
import { useAuthStore } from '../../stores/authStore';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

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
    <div className="space-y-4">
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
  const { data: members = [] } = useOrgMembers();
  const createAssignment = useCreateAssignment();
  const deleteAssignment = useDeleteAssignment();
  const { toast } = useToast();
  const [selectedClient, setSelectedClient] = useState<string | null>(null);

  const counselors = members.filter((m) => m.role === 'counselor' && m.status === 'active');

  async function handleAssign(clientId: string, counselorId: string) {
    try {
      await createAssignment.mutateAsync({ clientId, counselorId, isPrimary: true });
      toast('已分配', 'success');
      setSelectedClient(null);
    } catch (err: any) {
      toast(err?.message ?? '分配失败', 'error');
    }
  }

  async function handleDelete(assignmentId: string) {
    try {
      await deleteAssignment.mutateAsync(assignmentId);
      toast('已取消分配', 'success');
    } catch (err: any) {
      toast(err?.message ?? '操作失败', 'error');
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left: unassigned clients */}
      <div className="bg-white border border-slate-200 rounded-xl">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">待分配的来访者</h2>
          <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">{unassigned.length}</span>
        </div>
        <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {loadingU && <div className="p-4 text-sm text-slate-400">加载中…</div>}
          {!loadingU && unassigned.length === 0 && (
            <div className="p-6 text-sm text-slate-400 text-center">暂无未分配的来访者</div>
          )}
          {unassigned.map((c) => (
            <div
              key={c.id}
              className={`p-3 cursor-pointer transition ${
                selectedClient === c.id ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-slate-50'
              }`}
              onClick={() => setSelectedClient(selectedClient === c.id ? null : c.id)}
            >
              <div className="text-sm font-medium text-slate-800">{c.name}</div>
              <div className="text-xs text-slate-400">
                {c.email && <span className="mr-2">{c.email}</span>}
                注册于 {new Date(c.joined_at).toLocaleDateString('zh-CN')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: counselor list (when client selected) or assignments list */}
      <div className="bg-white border border-slate-200 rounded-xl">
        {selectedClient ? (
          <>
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">选择咨询师分配</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                为「{unassigned.find((c) => c.id === selectedClient)?.name}」分配咨询师
              </p>
            </div>
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {counselors.length === 0 && (
                <div className="p-6 text-sm text-slate-400 text-center">暂无可用咨询师</div>
              )}
              {counselors.map((m) => (
                <div key={m.id} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{m.name}</div>
                    <div className="text-xs text-slate-400">{m.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAssign(selectedClient, m.userId)}
                    disabled={createAssignment.isPending}
                    className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    {createAssignment.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    分配
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">已派单</h2>
              <span className="text-xs text-slate-400">{assignments.length}</span>
            </div>
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {loadingA && <div className="p-4 text-sm text-slate-400">加载中…</div>}
              {!loadingA && assignments.length === 0 && (
                <div className="p-6 text-sm text-slate-400 text-center">暂无派单记录</div>
              )}
              {assignments.map((a) => (
                <div key={a.id} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-800">{a.client_name}</span>
                      <span className="text-xs text-slate-400">→</span>
                      <span className="text-sm text-slate-700">{a.counselor_name}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>{new Date(a.assigned_at).toLocaleDateString('zh-CN')}</span>
                      {a.is_primary && (
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">主咨询师</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(a.id)}
                    disabled={deleteAssignment.isPending}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition"
                    title="取消分配"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tab B: Access Grants ───────────────────────────────────────────

function GrantsTab() {
  const { data: grants = [], isLoading } = useAccessGrants();
  const { data: members = [] } = useOrgMembers();
  const createGrant = useCreateAccessGrant();
  const revokeGrant = useRevokeAccessGrant();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ clientId: '', grantedToCounselorId: '', reason: '', expiresAt: '' });

  const counselors = members.filter((m) => m.role === 'counselor' && m.status === 'active');
  const clients = members.filter((m) => m.role === 'client' && m.status === 'active');

  // Build lookup maps for display
  const memberMap = new Map(members.map((m) => [m.userId, m.name]));

  async function handleCreate() {
    if (!form.clientId || !form.grantedToCounselorId || !form.reason.trim()) {
      toast('请填写完整信息', 'error');
      return;
    }
    try {
      await createGrant.mutateAsync({
        clientId: form.clientId,
        grantedToCounselorId: form.grantedToCounselorId,
        reason: form.reason,
        expiresAt: form.expiresAt || undefined,
      });
      toast('授权已创建', 'success');
      setShowForm(false);
      setForm({ clientId: '', grantedToCounselorId: '', reason: '', expiresAt: '' });
    } catch (err: any) {
      toast(err?.message ?? '创建失败', 'error');
    }
  }

  async function handleRevoke(grantId: string) {
    try {
      await revokeGrant.mutateAsync(grantId);
      toast('已撤销授权', 'success');
    } catch (err: any) {
      toast(err?.message ?? '撤销失败', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">管理跨咨询师的临时数据访问权限</p>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> 新增授权
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">来访者</label>
              <select
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
              >
                <option value="">选择来访者…</option>
                {clients.map((c) => (
                  <option key={c.userId} value={c.userId}>{c.name} ({c.email})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">授权给咨询师</label>
              <select
                value={form.grantedToCounselorId}
                onChange={(e) => setForm({ ...form, grantedToCounselorId: e.target.value })}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
              >
                <option value="">选择咨询师…</option>
                {counselors.map((c) => (
                  <option key={c.userId} value={c.userId}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">授权原因</label>
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="如：督导会诊需要查阅档案"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">过期时间（可选）</label>
            <input
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={createGrant.isPending}
              className="px-4 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {createGrant.isPending ? '创建中…' : '确认授权'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-xs text-slate-500 hover:text-slate-700"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Active grants list */}
      <div className="bg-white border border-slate-200 rounded-xl">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">活跃授权</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {isLoading && <div className="p-4 text-sm text-slate-400">加载中…</div>}
          {!isLoading && grants.length === 0 && (
            <div className="p-6 text-sm text-slate-400 text-center">暂无活跃授权</div>
          )}
          {grants.map((g) => (
            <div key={g.id} className="p-3 flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-800">
                  <span className="font-medium">{memberMap.get(g.clientId) || g.clientId.slice(0, 8)}</span>
                  <span className="text-slate-400 mx-2">→</span>
                  <span className="font-medium">{memberMap.get(g.grantedToCounselorId) || g.grantedToCounselorId.slice(0, 8)}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{g.reason}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  创建于 {new Date(g.createdAt).toLocaleDateString('zh-CN')}
                  {g.expiresAt && (
                    <span className="ml-2">
                      过期：{new Date(g.expiresAt).toLocaleDateString('zh-CN')}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRevoke(g.id)}
                disabled={revokeGrant.isPending}
                className="px-3 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 disabled:opacity-50"
              >
                撤销
              </button>
            </div>
          ))}
        </div>
      </div>
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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '待同意', color: 'bg-amber-50 text-amber-700' },
  consented: { label: '已同意', color: 'bg-blue-50 text-blue-700' },
  accepted: { label: '已接受', color: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: '已拒绝', color: 'bg-red-50 text-red-700' },
  completed: { label: '已完成', color: 'bg-slate-100 text-slate-600' },
  cancelled: { label: '已取消', color: 'bg-slate-100 text-slate-500' },
};

function ReferralInboxTab() {
  const { data: inbox = [], isLoading } = useReferralInbox();
  const respond = useRespondReferral();
  const { toast } = useToast();

  async function handleRespond(referralId: string, decision: 'accept' | 'reject') {
    try {
      await respond.mutateAsync({ referralId, decision });
      toast(decision === 'accept' ? '已接受转介' : '已拒绝转介', 'success');
    } catch (err: any) {
      toast(err?.message ?? '操作失败', 'error');
    }
  }

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
      {inbox.map((r) => {
        const statusInfo = STATUS_LABELS[r.status] || { label: r.status, color: 'bg-slate-100 text-slate-600' };
        const canRespond = r.status === 'consented';

        return (
          <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="text-sm font-semibold text-slate-800">
                {r.targetName ?? '转介来访者'}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
            <div className="text-xs text-slate-500 leading-relaxed">{r.reason}</div>
            {r.riskSummary && (
              <div className="text-xs text-amber-700 mt-1 bg-amber-50 rounded px-2 py-1 inline-block">
                风险摘要：{r.riskSummary}
              </div>
            )}
            <div className="text-xs text-slate-400 mt-2">
              创建于 {new Date(r.createdAt).toLocaleString('zh-CN')}
            </div>

            {canRespond && (
              <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleRespond(r.id, 'accept')}
                  disabled={respond.isPending}
                  className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
                >
                  <Check className="w-3 h-3" /> 接受
                </button>
                <button
                  type="button"
                  onClick={() => handleRespond(r.id, 'reject')}
                  disabled={respond.isPending}
                  className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 disabled:opacity-50 flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> 拒绝
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
