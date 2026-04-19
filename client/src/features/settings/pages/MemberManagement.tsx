import React, { useState } from 'react';
import { useOrgMembers, useInviteMember, useUpdateMember, useRemoveMember, type OrgMember } from '../../../api/useOrg';
import { useAuthStore } from '../../../stores/authStore';
import { PageLoading, StatusBadge, useToast } from '../../../shared/components';
import { UserPlus, Settings, Search, X } from 'lucide-react';
import { useFeature } from '../../../shared/hooks/useFeature';

const roleLabels: Record<string, string> = {
  org_admin: '管理员',
  counselor: '咨询师',
  client: '来访者',
};

const roleBadgeVariant: Record<string, 'purple' | 'blue' | 'green' | 'yellow'> = {
  org_admin: 'purple',
  counselor: 'blue',
  client: 'green',
};

const statusLabels: Record<string, string> = {
  active: '活跃',
  pending: '待激活',
  disabled: '已禁用',
};

const statusVariant: Record<string, 'green' | 'yellow' | 'slate'> = {
  active: 'green',
  pending: 'yellow',
  disabled: 'slate',
};

type FilterTab = 'all' | 'counselor' | 'client' | 'org_admin';

export function MemberManagement() {
  const { data: members, isLoading } = useOrgMembers();
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [drawerMemberId, setDrawerMemberId] = useState<string | null>(null);
  const drawerMember = (members || []).find((m) => m.id === drawerMemberId) || null;

  const filtered = (members || [])
    .filter((m) => filterTab === 'all' || m.role === filterTab)
    .filter((m) =>
      !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase()),
    );

  const counts = {
    all: members?.length || 0,
    counselor: members?.filter((m) => m.role === 'counselor').length || 0,
    client: members?.filter((m) => m.role === 'client').length || 0,
    org_admin: members?.filter((m) => m.role === 'org_admin').length || 0,
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: `全部 (${counts.all})` },
    { key: 'client', label: `来访者 (${counts.client})` },
    { key: 'counselor', label: `咨询师 (${counts.counselor})` },
    { key: 'org_admin', label: `管理员 (${counts.org_admin})` },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          邀请成员
        </button>
      </div>

      {/* Invite form */}
      {showInvite && <InviteForm onDone={() => setShowInvite(false)} />}

      {/* Filter tabs + search */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                filterTab === tab.key
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索姓名或邮箱"
            className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Member list */}
      {isLoading ? (
        <PageLoading />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">
          {search ? '未找到匹配的成员' : '暂无成员'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">姓名</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">邮箱</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">角色</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">状态</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">加入时间</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  onOpenDetail={() => setDrawerMemberId(member.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Member detail drawer */}
      {drawerMember && (
        <MemberDrawer
          member={drawerMember}
          allMembers={members || []}
          onClose={() => setDrawerMemberId(null)}
        />
      )}
    </div>
  );
}

function MemberRow({
  member,
  onOpenDetail,
}: {
  member: OrgMember;
  onOpenDetail: () => void;
}) {
  return (
    <tr
      className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer"
      onClick={onOpenDetail}
    >
      <td className="px-4 py-3">
        <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
          {member.name}
          {member.fullPracticeAccess && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium">
              全机构
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm text-slate-500">{member.email}</div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge label={roleLabels[member.role] || member.role} variant={roleBadgeVariant[member.role] || 'slate'} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge label={statusLabels[member.status] || member.status} variant={statusVariant[member.status] || 'slate'} />
      </td>
      <td className="px-4 py-3">
        <div className="text-xs text-slate-400">{new Date(member.createdAt).toLocaleDateString('zh-CN')}</div>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail();
          }}
          className="p-1.5 text-slate-400 hover:text-blue-600 rounded"
          title="详细设置"
        >
          <Settings className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

// ─── Member Detail Drawer ───────────────────────────────────────────

function MemberDrawer({
  member,
  allMembers,
  onClose,
}: {
  member: OrgMember;
  allMembers: OrgMember[];
  onClose: () => void;
}) {
  const updateMember = useUpdateMember();
  const removeMember = useRemoveMember();
  const { toast } = useToast();
  const { currentRole, currentOrgType } = useAuthStore();
  const checkFeature = useFeature();
  const isAdmin = currentRole === 'org_admin';
  const hasSupervisorFeature = checkFeature('supervisor');

  const [role, setRole] = useState(member.role);
  const [status, setStatus] = useState(member.status);
  const [supervisorId, setSupervisorId] = useState<string>(member.supervisorId || '');
  const [fullPracticeAccess, setFullPracticeAccess] = useState(member.fullPracticeAccess || false);

  // Reset form when member changes
  React.useEffect(() => {
    setRole(member.role);
    setStatus(member.status);
    setSupervisorId(member.supervisorId || '');
    setFullPracticeAccess(member.fullPracticeAccess || false);
  }, [member.id, member.role, member.status, member.supervisorId, member.fullPracticeAccess]);

  const supervisors = allMembers.filter((m) => m.role === 'counselor' && m.id !== member.id);

  const dirty = role !== member.role
    || status !== member.status
    || (supervisorId || null) !== (member.supervisorId || null)
    || fullPracticeAccess !== (member.fullPracticeAccess || false);

  const handleSave = async () => {
    try {
      await updateMember.mutateAsync({
        memberId: member.id,
        role: role !== member.role ? role : undefined,
        status: status !== member.status ? status : undefined,
        supervisorId: (supervisorId || null) !== (member.supervisorId || null) ? (supervisorId || null) : undefined,
        fullPracticeAccess: fullPracticeAccess !== (member.fullPracticeAccess || false) ? fullPracticeAccess : undefined,
      });
      toast('已保存', 'success');
      onClose();
    } catch (err: any) {
      toast(err?.message || '保存失败', 'error');
    }
  };

  const handleRemove = async () => {
    if (!confirm(`确定移除 ${member.name}？此操作不可撤销。`)) return;
    try {
      await removeMember.mutateAsync(member.id);
      toast('已移除', 'success');
      onClose();
    } catch (err: any) {
      toast(err?.message || '移除失败', 'error');
    }
  };

  // Determine label for dataScope toggle based on orgType
  const fullAccessLabel = currentOrgType === 'school'
    ? '全校可见（可查看所有学生和档案）'
    : currentOrgType === 'enterprise'
      ? '全机构可见（可查看所有员工）'
      : '全机构可见（可查看机构内所有来访者和咨询记录）';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed top-0 right-0 bottom-0 w-full max-w-md z-50 bg-white shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{member.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{member.email}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Role */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">角色</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={!isAdmin}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50"
            >
              <option value="client">来访者</option>
              <option value="counselor">咨询师</option>
              <option value="org_admin">管理员</option>
            </select>
          </div>

          {/* Supervisor (counselor only) */}
          {role === 'counselor' && hasSupervisorFeature && supervisors.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-2">
                督导师
                <span className="text-slate-400 font-normal ml-1">（可选）</span>
              </label>
              <select
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                disabled={!isAdmin}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50"
              >
                <option value="">无</option>
                {supervisors.map((s) => (
                  <option key={s.userId} value={s.userId}>
                    {s.name} ({s.email})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                督导师可以审阅该成员的会谈记录
              </p>
            </div>
          )}
          {role === 'counselor' && !hasSupervisorFeature && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              督导关系功能需要「成长版」或更高套餐
            </div>
          )}

          {/* Full practice access (counselor only) */}
          {role === 'counselor' && (
            <div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fullPracticeAccess}
                  onChange={(e) => setFullPracticeAccess(e.target.checked)}
                  disabled={!isAdmin}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                />
                <div>
                  <div className="text-sm font-medium text-slate-700">{fullAccessLabel}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    勾选后此成员不受「仅可见自己负责来访者」限制
                  </div>
                </div>
              </label>
            </div>
          )}

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">状态</label>
            <div className="flex gap-2">
              <StatusPill
                active={status === 'active'}
                onClick={() => isAdmin && setStatus('active')}
                label="活跃"
              />
              <StatusPill
                active={status === 'disabled'}
                onClick={() => isAdmin && setStatus('disabled')}
                label="禁用"
              />
              {member.status === 'pending' && (
                <StatusPill
                  active={status === 'pending'}
                  onClick={() => isAdmin && setStatus('pending')}
                  label="待激活"
                />
              )}
            </div>
          </div>

          {/* Read-only info */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <InfoLine label="加入时间" value={new Date(member.createdAt).toLocaleDateString('zh-CN')} />
            <InfoLine label="用户 ID" value={member.userId} mono />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          <button
            onClick={handleRemove}
            disabled={!isAdmin}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
          >
            移除成员
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty || updateMember.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {updateMember.isPending ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function StatusPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-lg border transition ${
        active
          ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
}

function InfoLine({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-400">{label}</span>
      <span className={`text-slate-600 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const inviteMember = useInviteMember();
  const { data: members } = useOrgMembers();
  const { currentRole } = useAuthStore();
  const { toast } = useToast();
  const [emails, setEmails] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('client');
  const [supervisorId, setSupervisorId] = useState('');
  const [fullPracticeAccess, setFullPracticeAccess] = useState(false);

  const counselors = (members || []).filter((m) => m.role === 'counselor');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailList = emails.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean);
    if (emailList.length === 0) return;

    let success = 0;
    let fail = 0;
    for (const email of emailList) {
      try {
        await inviteMember.mutateAsync({
          email,
          role,
          name: emailList.length === 1 ? name || undefined : undefined,
          supervisorId: supervisorId || undefined,
          fullPracticeAccess: fullPracticeAccess || undefined,
        });
        success++;
      } catch {
        fail++;
      }
    }

    if (success > 0) toast(`成功邀请 ${success} 人${fail > 0 ? `，${fail} 人失败` : ''}`, 'success');
    else toast('邀请失败', 'error');

    if (success > 0) onDone();
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-900 mb-3">邀请成员</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs text-slate-500 mb-1">邮箱（多个用逗号分隔）</label>
            <input
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="user@example.com"
              required
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">角色</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="client">来访者</option>
              <option value="counselor">咨询师</option>
              <option value="org_admin">管理员</option>
            </select>
          </div>
        </div>
        {!emails.includes(',') && !emails.includes('，') && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">姓名（可选）</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="成员姓名"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        )}
        {/* Supervisor selector - shown for counselor role */}
        {role === 'counselor' && counselors.length > 0 && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">督导师（可选）</label>
            <select
              value={supervisorId}
              onChange={(e) => setSupervisorId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">无</option>
              {counselors.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.name} ({c.email})
                </option>
              ))}
            </select>
          </div>
        )}
        {/* Full practice access toggle - only visible to org_admin */}
        {currentRole === 'org_admin' && role === 'counselor' && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={fullPracticeAccess}
              onChange={(e) => setFullPracticeAccess(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500/30"
            />
            <span className="text-sm text-slate-700">全机构可见</span>
            <span className="text-xs text-slate-400">（可查看机构内所有来访者和咨询记录）</span>
          </label>
        )}
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onDone} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            取消
          </button>
          <button
            type="submit"
            disabled={inviteMember.isPending || !emails.trim()}
            className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
          >
            {inviteMember.isPending ? '邀请中...' : '发送邀请'}
          </button>
        </div>
      </form>
    </div>
  );
}
