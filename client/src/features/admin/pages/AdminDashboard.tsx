import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { api } from '../../../api/client';
import { Building2, Users, UserCheck, ChevronRight, Shield, Search, Settings, Key, Plus } from 'lucide-react';
import { UserManagement } from './UserManagement';
import { SystemConfig } from './SystemConfig';
import { LicenseManagement } from './LicenseManagement';

type AdminTab = 'orgs' | 'users' | 'config' | 'licenses';

interface PlatformStats {
  organizations: number;
  users: number;
  memberships: number;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
  memberCount: number;
}

interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  members: {
    id: string;
    userId: string;
    role: string;
    status: string;
    fullPracticeAccess: boolean;
    supervisorId: string | null;
    createdAt: string;
    userName: string;
    userEmail: string;
  }[];
}

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  free: { label: '免费版', color: 'bg-slate-100 text-slate-600' },
  pro: { label: '专业版', color: 'bg-blue-100 text-blue-700' },
  enterprise: { label: '企业版', color: 'bg-purple-100 text-purple-700' },
};

const ROLE_LABELS: Record<string, string> = {
  org_admin: '机构管理员',
  counselor: '咨询师',
  admin_staff: '行政人员',
  client: '来访者',
};

export function AdminDashboard() {
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<AdminTab>('orgs');
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<OrgDetail | null>(null);
  const [_memberUsers, _setMemberUsers] = useState<Record<string, { name: string; email: string }>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [createOrgForm, setCreateOrgForm] = useState({ name: '', slug: '', adminEmail: '' });
  const [createOrgError, setCreateOrgError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [statsData, orgsData] = await Promise.all([
        api.get<PlatformStats>('/admin/stats'),
        api.get<OrgRow[]>('/admin/orgs'),
      ]);
      setStats(statsData);
      setOrgs(orgsData);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function selectOrg(orgId: string) {
    try {
      const detail = await api.get<OrgDetail>(`/admin/orgs/${orgId}`);
      setSelectedOrg(detail);
    } catch (err) {
      console.error('Failed to load org detail:', err);
    }
  }

  async function updatePlan(orgId: string, plan: string) {
    try {
      await api.patch(`/admin/orgs/${orgId}`, { plan });
      setEditingPlan(null);
      // Refresh
      await loadData();
      if (selectedOrg?.id === orgId) {
        await selectOrg(orgId);
      }
    } catch (err) {
      console.error('Failed to update plan:', err);
    }
  }

  async function createOrg() {
    setCreateOrgError('');
    const { name, slug } = createOrgForm;
    if (!name.trim() || !slug.trim()) {
      setCreateOrgError('名称和标识都不能为空');
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setCreateOrgError('标识只能包含小写字母、数字和连字符');
      return;
    }
    try {
      await api.post('/orgs', { name: name.trim(), slug: slug.trim() });
      setShowCreateOrg(false);
      setCreateOrgForm({ name: '', slug: '', adminEmail: '' });
      await loadData();
    } catch (err: any) {
      setCreateOrgError(err?.message || '创建失败');
    }
  }

  const filteredOrgs = orgs.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.slug.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Psynote</h1>
              <p className="text-xs text-red-500 font-medium">系统管理</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {([
            { key: 'orgs' as AdminTab, label: '机构管理', icon: Building2 },
            { key: 'users' as AdminTab, label: '用户管理', icon: Users },
            { key: 'licenses' as AdminTab, label: '许可证管理', icon: Key },
            { key: 'config' as AdminTab, label: '系统配置', icon: Settings },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`w-full text-left block px-3 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === key
                  ? 'bg-red-50 text-red-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4 inline mr-2" />
              {label}
            </button>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-slate-100">
          <div className="text-sm text-slate-700 font-medium truncate">{user?.name}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">系统管理员</span>
            <button onClick={logout} className="text-xs text-slate-400 hover:text-slate-600 ml-auto">
              退出
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'users' ? (
          <UserManagement />
        ) : activeTab === 'config' ? (
          <SystemConfig />
        ) : activeTab === 'licenses' ? (
          <LicenseManagement />
        ) : (
        <div className="max-w-6xl mx-auto">
          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <StatCard
                icon={<Building2 className="w-5 h-5 text-blue-500" />}
                label="机构总数"
                value={stats.organizations}
                bg="bg-blue-50"
              />
              <StatCard
                icon={<Users className="w-5 h-5 text-green-500" />}
                label="用户总数"
                value={stats.users}
                bg="bg-green-50"
              />
              <StatCard
                icon={<UserCheck className="w-5 h-5 text-purple-500" />}
                label="成员关系"
                value={stats.memberships}
                bg="bg-purple-50"
              />
            </div>
          )}

          <div className="flex gap-6">
            {/* Org List */}
            <div className={selectedOrg ? 'w-1/2' : 'w-full'}>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-slate-900">机构列表</h2>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="搜索机构..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 w-48"
                      />
                    </div>
                    <button
                      onClick={() => setShowCreateOrg(true)}
                      className="flex items-center gap-1 text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 transition"
                    >
                      <Plus className="w-3.5 h-3.5" /> 新建机构
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {filteredOrgs.length === 0 ? (
                    <div className="px-5 py-8 text-center text-slate-400 text-sm">暂无机构</div>
                  ) : (
                    filteredOrgs.map((org) => (
                      <div
                        key={org.id}
                        onClick={() => selectOrg(org.id)}
                        className={`px-5 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition ${
                          selectedOrg?.id === org.id ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        <div className="w-9 h-9 bg-brand-100 rounded-lg flex items-center justify-center text-brand-600 font-bold text-sm shrink-0">
                          {org.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">{org.name}</div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {org.slug} · {org.memberCount} 人
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${PLAN_LABELS[org.plan]?.color || 'bg-slate-100 text-slate-600'}`}>
                          {PLAN_LABELS[org.plan]?.label || org.plan}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Org Detail */}
            {selectedOrg && (
              <div className="w-1/2">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">{selectedOrg.name}</h2>
                      <p className="text-xs text-slate-400 mt-0.5">{selectedOrg.slug} · 创建于 {new Date(selectedOrg.createdAt).toLocaleDateString('zh-CN')}</p>
                    </div>
                    <button
                      onClick={() => setSelectedOrg(null)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      关闭
                    </button>
                  </div>

                  {/* Plan */}
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-sm text-slate-600">套餐</span>
                    {editingPlan === selectedOrg.id ? (
                      <div className="flex gap-2">
                        {['free', 'pro', 'enterprise'].map((p) => (
                          <button
                            key={p}
                            onClick={() => updatePlan(selectedOrg.id, p)}
                            className={`text-xs px-3 py-1 rounded-full border transition ${
                              selectedOrg.plan === p
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-slate-200 text-slate-500 hover:border-blue-300'
                            }`}
                          >
                            {PLAN_LABELS[p]?.label}
                          </button>
                        ))}
                        <button onClick={() => setEditingPlan(null)} className="text-xs text-slate-400 hover:text-slate-600">取消</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${PLAN_LABELS[selectedOrg.plan]?.color}`}>
                          {PLAN_LABELS[selectedOrg.plan]?.label || selectedOrg.plan}
                        </span>
                        <button
                          onClick={() => setEditingPlan(selectedOrg.id)}
                          className="text-xs text-blue-500 hover:text-blue-700"
                        >
                          变更
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Members */}
                  <div className="px-5 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-medium text-slate-700 mb-2">
                      成员 ({selectedOrg.members.length})
                    </h3>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {selectedOrg.members.length === 0 ? (
                        <p className="text-xs text-slate-400 py-2">暂无成员</p>
                      ) : (
                        selectedOrg.members.map((m) => (
                          <div key={m.id} className="flex items-center gap-3 py-1.5">
                            <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-slate-700 truncate">{m.userName}</div>
                              <div className="text-xs text-slate-400 truncate">{m.userEmail}</div>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              m.role === 'org_admin' ? 'bg-blue-100 text-blue-700' :
                              m.role === 'counselor' ? 'bg-green-100 text-green-700' :
                              m.role === 'admin_staff' ? 'bg-orange-100 text-orange-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {ROLE_LABELS[m.role] || m.role}
                            </span>
                            <span className={`text-xs ${m.status === 'active' ? 'text-green-500' : 'text-slate-400'}`}>
                              {m.status === 'active' ? '活跃' : m.status}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Settings summary */}
                  <div className="px-5 py-3">
                    <h3 className="text-sm font-medium text-slate-700 mb-1">配置信息</h3>
                    <pre className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3 overflow-auto max-h-40">
                      {JSON.stringify(selectedOrg.settings, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Create Org Modal */}
        {showCreateOrg && (
          <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowCreateOrg(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="text-base font-semibold text-slate-900">新建机构</h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">机构名称</label>
                  <input
                    type="text"
                    placeholder="如：心理健康中心"
                    value={createOrgForm.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setCreateOrgForm((prev) => ({
                        ...prev,
                        name,
                        // Auto-generate slug from name (pinyin would be ideal, fallback to simple transform)
                        slug: prev.slug || '',
                      }));
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">机构标识 (slug)</label>
                  <input
                    type="text"
                    placeholder="如：mental-health-center"
                    value={createOrgForm.slug}
                    onChange={(e) => setCreateOrgForm((prev) => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 font-mono"
                  />
                  <p className="text-xs text-slate-400 mt-1">只能包含小写字母、数字和连字符，全局唯一</p>
                </div>
                {createOrgError && (
                  <p className="text-sm text-red-500">{createOrgError}</p>
                )}
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  onClick={() => { setShowCreateOrg(false); setCreateOrgError(''); }}
                  className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2"
                >
                  取消
                </button>
                <button
                  onClick={createOrg}
                  className="text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
                >
                  创建
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: number; bg: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 flex items-center gap-4">
      <div className={`w-11 h-11 ${bg} rounded-xl flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <div className="text-xs text-slate-400">{label}</div>
      </div>
    </div>
  );
}
