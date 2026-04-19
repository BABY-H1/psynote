import React, { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { Search, UserPlus, Shield, ShieldOff, KeyRound, Ban, CheckCircle, ChevronRight, X } from 'lucide-react';
import { getRoleLabel, getRoleBadgeColor } from '../../../shared/constants/roles';

interface UserRow {
  id: string;
  email: string;
  name: string;
  isSystemAdmin: boolean;
  createdAt: string;
  orgCount: number;
}

interface UserDetail {
  id: string;
  email: string;
  name: string;
  isSystemAdmin: boolean;
  createdAt: string;
  memberships: {
    id: string;
    orgId: string;
    role: string;
    status: string;
    orgName: string;
    orgSlug: string;
    orgPlan: string;
  }[];
}


export function UserManagement() {
  const [userList, setUserList] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showResetPwd, setShowResetPwd] = useState<string | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [createForm, setCreateForm] = useState({ email: '', name: '', password: '', isSystemAdmin: false });
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await api.get<UserRow[]>('/admin/users');
      setUserList(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function searchUsers(q: string) {
    setSearch(q);
    try {
      const data = await api.get<UserRow[]>(`/admin/users${q ? `?search=${encodeURIComponent(q)}` : ''}`);
      setUserList(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function selectUser(userId: string) {
    try {
      const detail = await api.get<UserDetail>(`/admin/users/${userId}`);
      setSelectedUser(detail);
    } catch (err) {
      console.error(err);
    }
  }

  async function toggleSystemAdmin(userId: string, current: boolean) {
    try {
      await api.patch(`/admin/users/${userId}`, { isSystemAdmin: !current });
      showMsg(current ? '已取消系统管理员' : '已设为系统管理员');
      await loadUsers();
      if (selectedUser?.id === userId) await selectUser(userId);
    } catch (err) {
      console.error(err);
    }
  }

  async function toggleUserStatus(userId: string, disable: boolean) {
    try {
      await api.post(`/admin/users/${userId}/toggle-status`, { disabled: disable });
      showMsg(disable ? '已禁用该用户' : '已启用该用户');
      if (selectedUser?.id === userId) await selectUser(userId);
    } catch (err) {
      console.error(err);
    }
  }

  async function resetPassword(userId: string) {
    if (!newPwd || newPwd.length < 6) { showMsg('密码至少6位'); return; }
    try {
      await api.post(`/admin/users/${userId}/reset-password`, { password: newPwd });
      showMsg('密码已重置');
      setShowResetPwd(null);
      setNewPwd('');
    } catch (err) {
      console.error(err);
    }
  }

  async function createUser() {
    if (!createForm.email || !createForm.name || !createForm.password) {
      showMsg('请填写完整信息'); return;
    }
    try {
      await api.post('/admin/users', createForm);
      showMsg('用户创建成功');
      setShowCreate(false);
      setCreateForm({ email: '', name: '', password: '', isSystemAdmin: false });
      await loadUsers();
    } catch (err: any) {
      showMsg(err.message || '创建失败');
    }
  }

  function showMsg(msg: string) {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 3000);
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400">加载中...</div>;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Toast */}
      {actionMsg && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {actionMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">账号管理</h2>
          <p className="text-sm text-slate-500 mt-0.5">管理平台账号：创建系统管理员、重置密码、跨机构禁用用户</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition"
        >
          <UserPlus className="w-4 h-4" /> 创建用户
        </button>
      </div>

      {/* Create User Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[420px] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">创建用户</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">姓名</label>
                <input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" placeholder="请输入姓名" />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">邮箱</label>
                <input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" placeholder="请输入邮箱" />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">密码</label>
                <input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" placeholder="至少6位" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={createForm.isSystemAdmin} onChange={(e) => setCreateForm({ ...createForm, isSystemAdmin: e.target.checked })}
                  className="rounded border-slate-300" />
                设为系统管理员
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">取消</button>
              <button onClick={createUser} className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600">创建</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-6">
        {/* User List */}
        <div className={selectedUser ? 'w-1/2' : 'w-full'}>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text" placeholder="搜索姓名或邮箱..." value={search}
                  onChange={(e) => searchUsers(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
              {userList.map((u) => (
                <div
                  key={u.id}
                  onClick={() => selectUser(u.id)}
                  className={`px-5 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition ${selectedUser?.id === u.id ? 'bg-blue-50/50' : ''}`}
                >
                  <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-medium text-sm shrink-0">
                    {u.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate flex items-center gap-1.5">
                      {u.name}
                      {u.isSystemAdmin && <Shield className="w-3.5 h-3.5 text-red-500" />}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{u.email}</div>
                  </div>
                  <span className="text-xs text-slate-400">{u.orgCount} 个机构</span>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              ))}
              {userList.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-slate-400">暂无用户</div>
              )}
            </div>
          </div>
        </div>

        {/* User Detail */}
        {selectedUser && (
          <div className="w-1/2">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    {selectedUser.name}
                    {selectedUser.isSystemAdmin && (
                      <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">系统管理员</span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">{selectedUser.email} · 创建于 {new Date(selectedUser.createdAt).toLocaleDateString('zh-CN')}</p>
                </div>
                <button onClick={() => setSelectedUser(null)} className="text-xs text-slate-400 hover:text-slate-600">关闭</button>
              </div>

              {/* Actions */}
              <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-2">
                <button
                  onClick={() => toggleSystemAdmin(selectedUser.id, selectedUser.isSystemAdmin)}
                  className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition ${
                    selectedUser.isSystemAdmin
                      ? 'border-red-200 text-red-600 hover:bg-red-50'
                      : 'border-blue-200 text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  {selectedUser.isSystemAdmin ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                  {selectedUser.isSystemAdmin ? '取消系统管理员' : '设为系统管理员'}
                </button>
                <button
                  onClick={() => { setShowResetPwd(selectedUser.id); setNewPwd(''); }}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
                >
                  <KeyRound className="w-3.5 h-3.5" /> 重置密码
                </button>
                {selectedUser.memberships.some((m) => m.status === 'active') ? (
                  <button
                    onClick={() => toggleUserStatus(selectedUser.id, true)}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-50 transition"
                  >
                    <Ban className="w-3.5 h-3.5" /> 禁用用户
                  </button>
                ) : selectedUser.memberships.length > 0 ? (
                  <button
                    onClick={() => toggleUserStatus(selectedUser.id, false)}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-green-200 text-green-600 hover:bg-green-50 transition"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> 启用用户
                  </button>
                ) : null}
              </div>

              {/* Reset Password inline */}
              {showResetPwd === selectedUser.id && (
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                  <input
                    type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
                    placeholder="输入新密码（至少6位）"
                    className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                  <button onClick={() => resetPassword(selectedUser.id)} className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600">确认</button>
                  <button onClick={() => setShowResetPwd(null)} className="text-xs text-slate-400 hover:text-slate-600">取消</button>
                </div>
              )}

              {/* Memberships */}
              <div className="px-5 py-3">
                <h4 className="text-sm font-medium text-slate-700 mb-2">所属机构 ({selectedUser.memberships.length})</h4>
                {selectedUser.memberships.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">该用户尚未加入任何机构</p>
                ) : (
                  <div className="space-y-2">
                    {selectedUser.memberships.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 py-1.5 px-3 bg-slate-50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-700 truncate">{m.orgName}</div>
                          <div className="text-xs text-slate-400">{m.orgSlug}</div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getRoleBadgeColor(m.role)}`}>
                          {getRoleLabel(m.role)}
                        </span>
                        <span className={`text-xs ${m.status === 'active' ? 'text-green-500' : 'text-red-400'}`}>
                          {m.status === 'active' ? '活跃' : '已禁用'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
