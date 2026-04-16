import React, { useState } from 'react';
import { useOrgMembers, useInviteMember, useUpdateMember, useRemoveMember } from '../../../api/useOrg';
import { useAuthStore } from '../../../stores/authStore';
import { PageLoading, StatusBadge, useToast } from '../../../shared/components';
import { UserPlus, MoreVertical, Search } from 'lucide-react';

const roleLabels: Record<string, string> = {
  org_admin: '管理员',
  counselor: '咨询师',
  admin_staff: '行政人员',
  client: '来访者',
};

const roleBadgeVariant: Record<string, 'purple' | 'blue' | 'green' | 'yellow'> = {
  org_admin: 'purple',
  counselor: 'blue',
  admin_staff: 'yellow',
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

type FilterTab = 'all' | 'counselor' | 'client' | 'org_admin' | 'admin_staff';

export function MemberManagement() {
  const { data: members, isLoading } = useOrgMembers();
  const { toast } = useToast();
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);

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
    admin_staff: members?.filter((m) => m.role === 'admin_staff').length || 0,
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: `全部 (${counts.all})` },
    { key: 'client', label: `来访者 (${counts.client})` },
    { key: 'counselor', label: `咨询师 (${counts.counselor})` },
    { key: 'admin_staff', label: `行政人员 (${counts.admin_staff})` },
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
                <MemberRow key={member.id} member={member} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MemberRow({ member }: { member: { id: string; userId: string; email: string; name: string; role: string; status: string; createdAt: string } }) {
  const updateMember = useUpdateMember();
  const removeMember = useRemoveMember();
  const { toast } = useToast();
  const [showMenu, setShowMenu] = useState(false);

  const handleStatusToggle = async () => {
    const newStatus = member.status === 'active' ? 'disabled' : 'active';
    try {
      await updateMember.mutateAsync({ memberId: member.id, status: newStatus });
      toast(`已${newStatus === 'active' ? '启用' : '禁用'}`, 'success');
    } catch {
      toast('操作失败', 'error');
    }
    setShowMenu(false);
  };

  const handleRoleChange = async (role: string) => {
    try {
      await updateMember.mutateAsync({ memberId: member.id, role });
      toast('角色已更新', 'success');
    } catch {
      toast('操作失败', 'error');
    }
    setShowMenu(false);
  };

  const handleRemove = async () => {
    if (!confirm(`确定移除 ${member.name}？`)) return;
    try {
      await removeMember.mutateAsync(member.id);
      toast('已移除', 'success');
    } catch (err: any) {
      toast(err?.message || '操作失败', 'error');
    }
    setShowMenu(false);
  };

  return (
    <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
      <td className="px-4 py-3">
        <div className="text-sm font-medium text-slate-900">{member.name}</div>
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
      <td className="px-4 py-3 text-right relative">
        <button onClick={() => setShowMenu(!showMenu)} className="p-1 text-slate-400 hover:text-slate-600 rounded">
          <MoreVertical className="w-4 h-4" />
        </button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div className="absolute right-4 top-10 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[140px]">
              {member.role !== 'client' && (
                <button onClick={() => handleRoleChange('client')} className="block w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                  设为来访者
                </button>
              )}
              {member.role !== 'counselor' && (
                <button onClick={() => handleRoleChange('counselor')} className="block w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                  设为咨询师
                </button>
              )}
              {member.role !== 'admin_staff' && (
                <button onClick={() => handleRoleChange('admin_staff')} className="block w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                  设为行政人员
                </button>
              )}
              {member.role !== 'org_admin' && (
                <button onClick={() => handleRoleChange('org_admin')} className="block w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                  设为管理员
                </button>
              )}
              <div className="border-t border-slate-100 my-1" />
              <button onClick={handleStatusToggle} className="block w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                {member.status === 'active' ? '禁用' : '启用'}
              </button>
              <button onClick={handleRemove} className="block w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                移除
              </button>
            </div>
          </>
        )}
      </td>
    </tr>
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
              <option value="admin_staff">行政人员</option>
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
        {currentRole === 'org_admin' && (role === 'counselor' || role === 'admin_staff') && (
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
