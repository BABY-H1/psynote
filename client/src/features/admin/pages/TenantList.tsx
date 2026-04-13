import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../api/client';
import { Building2, Search, Plus, ChevronRight, Edit2, Trash2, X } from 'lucide-react';
import { TIER_LABELS, type OrgTier, type LicenseStatus } from '@psynote/shared';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
  memberCount: number;
  orgType?: string;
  isEnterprise?: boolean;
  partnershipCount?: number;
  license: {
    status: LicenseStatus;
    tier: OrgTier | null;
    maxSeats: number | null;
    expiresAt: string | null;
  };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TIER_COLORS: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-600',
  growth: 'bg-blue-100 text-blue-700',
  flagship: 'bg-purple-100 text-purple-700',
  // Legacy tier names for backward compat
  solo: 'bg-slate-100 text-slate-600',
  team: 'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700',
  platform: 'bg-red-100 text-red-700',
};

const LICENSE_STATUS: Record<LicenseStatus, { label: string; color: string }> = {
  active: { label: '有效', color: 'text-green-600' },
  expired: { label: '已过期', color: 'text-red-500' },
  invalid: { label: '无效', color: 'text-orange-500' },
  none: { label: '未签发', color: 'text-slate-400' },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TenantList() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editingTenant, setEditingTenant] = useState<TenantRow | null>(null);
  const [editForm, setEditForm] = useState({ name: '', slug: '' });
  const [editError, setEditError] = useState('');

  useEffect(() => {
    loadTenants();
  }, []);

  async function loadTenants() {
    setLoading(true);
    try {
      const data = await api.get<TenantRow[]>('/admin/tenants');
      setTenants(data);
    } catch (err) {
      console.error('Failed to load tenants:', err);
    } finally {
      setLoading(false);
    }
  }

  async function deleteTenant(id: string, name: string) {
    if (!confirm(`确定删除租户「${name}」？\n\n此操作不可撤销，将删除该机构的所有成员和关联数据。`)) return;
    try {
      await api.delete(`/admin/tenants/${id}`);
      await loadTenants();
    } catch (err: any) {
      alert(err?.message || '删除失败');
    }
  }

  function openEdit(t: TenantRow) {
    setEditingTenant(t);
    setEditForm({ name: t.name, slug: t.slug });
    setEditError('');
  }

  async function saveEdit() {
    if (!editingTenant) return;
    setEditError('');
    try {
      await api.patch(`/admin/tenants/${editingTenant.id}`, editForm);
      setEditingTenant(null);
      await loadTenants();
    } catch (err: any) {
      setEditError(err?.message || '保存失败');
    }
  }

  const filtered = tenants.filter((t) => {
    if (search) {
      const q = search.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !t.slug.toLowerCase().includes(q)) return false;
    }
    if (tierFilter !== 'all' && t.license.tier !== tierFilter) return false;
    if (statusFilter !== 'all' && t.license.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">租户管理</h1>
          <p className="text-sm text-slate-500 mt-1">管理平台机构、套餐与成员</p>
        </div>
        <button
          onClick={() => navigate('/admin/tenants/new')}
          className="flex items-center gap-1.5 bg-blue-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-600 transition"
        >
          <Plus className="w-4 h-4" />
          新建租户
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜索机构名称或标识..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
        </div>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="all">全部套餐</option>
          <option value="solo">个人版</option>
          <option value="team">团队版</option>
          <option value="enterprise">企业版</option>
          <option value="platform">平台版</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="all">全部状态</option>
          <option value="active">有效</option>
          <option value="expired">已过期</option>
          <option value="none">未签发</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="px-5 py-12 text-center text-slate-400 text-sm">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-slate-400 text-sm">
            {tenants.length === 0 ? '暂无租户，点击"新建租户"开始' : '没有匹配的结果'}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">机构名称</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">标识</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">套餐</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">成员数</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">许可状态</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">创建时间</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((t) => {
                const tier = t.license.tier;
                const status = LICENSE_STATUS[t.license.status];
                return (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/admin/tenants/${t.id}`)}
                    className="hover:bg-slate-50 cursor-pointer transition"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${
                          t.isEnterprise
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-brand-100 text-brand-600'
                        }`}>
                          {t.name.charAt(0)}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">{t.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            t.isEnterprise
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-blue-50 text-blue-600'
                          }`}>
                            {t.isEnterprise ? '企业' : '机构'}
                          </span>
                          {t.isEnterprise && t.partnershipCount ? (
                            <span className="text-xs text-slate-400">
                              {t.partnershipCount} 个合作机构
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 font-mono">{t.slug}</td>
                    <td className="px-4 py-3">
                      {tier ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${TIER_COLORS[tier] || 'bg-slate-100 text-slate-600'}`}>
                          {TIER_LABELS[tier as OrgTier] || tier}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-slate-600">
                      {t.memberCount}
                      {t.license.maxSeats ? (
                        <span className="text-slate-400">/{t.license.maxSeats}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {new Date(t.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(t); }}
                          className="p-1.5 text-slate-400 hover:text-blue-500 transition"
                          title="编辑"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteTenant(t.id, t.name); }}
                          className="p-1.5 text-slate-400 hover:text-red-500 transition"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className="w-4 h-4 text-slate-300 ml-1" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {/* Edit Modal */}
      {editingTenant && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setEditingTenant(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">编辑租户</h3>
              <button onClick={() => setEditingTenant(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">机构名称</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">机构标识 (slug)</label>
                <input
                  type="text"
                  value={editForm.slug}
                  onChange={(e) => setEditForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 font-mono"
                />
              </div>
              {editError && <p className="text-sm text-red-500">{editError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setEditingTenant(null)} className="text-sm text-slate-500 px-4 py-2">取消</button>
              <button onClick={saveEdit} className="text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
