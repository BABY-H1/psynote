import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../api/client';
import {
  Building2,
  Users,
  FileText,
  AlertTriangle,
  TrendingUp,
  Activity,
  ChevronRight,
  CreditCard,
  RefreshCw,
  Edit2,
  Ban,
  Sparkles,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { TIER_LABELS, type OrgTier } from '@psynote/shared';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DashboardData {
  tiles: {
    activeTenants: number;
    monthlyActiveUsers: number;
    monthlyCareEpisodes: number;
    expiringLicenses: number;
  };
  trends: {
    tenantGrowth: { month: string; count: number }[];
    userActivity: { month: string; activeUsers: number }[];
  };
  alerts: {
    expiredLicenseOrgs: { orgId: string; orgName: string; expiresAt: string }[];
    recentLicenseActivity: { action: string; orgId: string | null; orgName: string; createdAt: string }[];
    operationalOrgs: {
      orgId: string;
      orgName: string;
      slug: string;
      activeMemberCount: number;
      monthlyEpisodes: number;
      tier: OrgTier | null;
      licenseStatus: 'active' | 'expired' | 'invalid' | 'none';
      lastActivityAt: string | null;
    }[];
  };
}

/* ------------------------------------------------------------------ */
/*  Tile config                                                        */
/* ------------------------------------------------------------------ */

const TILES = [
  { key: 'activeTenants' as const, label: '活跃租户', icon: Building2, color: 'blue' },
  { key: 'monthlyActiveUsers' as const, label: '本月活跃用户', icon: Users, color: 'green' },
  { key: 'monthlyCareEpisodes' as const, label: '本月新建个案', icon: FileText, color: 'purple' },
  { key: 'expiringLicenses' as const, label: '即将到期许可', icon: AlertTriangle, color: 'red' },
] as const;

const COLOR_MAP: Record<string, { bg: string; icon: string }> = {
  blue: { bg: 'bg-blue-50', icon: 'text-blue-500' },
  green: { bg: 'bg-green-50', icon: 'text-green-500' },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-500' },
  red: { bg: 'bg-red-50', icon: 'text-red-500' },
};

/**
 * License action → label + icon + color. Mirrors the visual language used
 * on TenantDetail's subscription card so operators pattern-match across
 * views.
 */
const LICENSE_ACTION_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  'license.issued':    { label: '签发', icon: CreditCard, className: 'bg-blue-50 text-blue-700' },
  'license.activated': { label: '激活', icon: CreditCard, className: 'bg-blue-50 text-blue-700' },
  'license.renewed':   { label: '续期', icon: RefreshCw,  className: 'bg-green-50 text-green-700' },
  'license.modified':  { label: '修改', icon: Edit2,      className: 'bg-slate-100 text-slate-700' },
  'license.revoked':   { label: '撤销', icon: Ban,        className: 'bg-red-50 text-red-700' },
};

const LICENSE_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active:  { label: '有效',   className: 'bg-green-100 text-green-700' },
  expired: { label: '已过期', className: 'bg-red-100 text-red-700' },
  invalid: { label: '无效',   className: 'bg-orange-100 text-orange-700' },
  none:    { label: '未签发', className: 'bg-slate-100 text-slate-500' },
};

/* ------------------------------------------------------------------ */
/*  Time formatting                                                    */
/* ------------------------------------------------------------------ */

/**
 * Short relative time: "刚刚" / "N 分钟前" / "N 小时前" / "N 天前" / "YYYY/M/D".
 * Used in the operational-orgs table and license-activity feed where
 * absolute dates would make rows noisier than the signal.
 */
function formatRelative(iso: string | null): string {
  if (!iso) return '暂无活动';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '-';
  const diffMs = Date.now() - t;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diffMs < 5 * min) return '刚刚';
  if (diffMs < hr) return `${Math.floor(diffMs / min)} 分钟前`;
  if (diffMs < day) return `${Math.floor(diffMs / hr)} 小时前`;
  if (diffMs < 30 * day) return `${Math.floor(diffMs / day)} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AdminHome() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<DashboardData>('/admin/dashboard');
        setData(res);
      } catch (err) {
        console.error('Failed to load admin dashboard:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <p className="text-slate-400">加载中...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-600 rounded-lg p-4 text-sm">
          无法加载仪表盘数据，请稍后重试。
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">经营看板</h1>
        <p className="text-sm text-slate-500 mt-1">平台运营概览与关键指标</p>
      </div>

      {/* Snapshot Tiles — 4 */}
      <div className="grid grid-cols-4 gap-4">
        {TILES.map(({ key, label, icon: Icon, color }) => {
          const c = COLOR_MAP[color];
          return (
            <div
              key={key}
              className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-4"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${c.icon}`} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900">{data.tiles[key]}</div>
                  <div className="text-xs text-slate-400">{label}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts + Alerts */}
      <div className="grid grid-cols-3 gap-6">
        {/* Left: Trend Charts */}
        <div className="col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-slate-700">租户增长趋势</h3>
              <span className="text-xs text-slate-400 ml-1">近 12 个月</span>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.trends.tenantGrowth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="新增租户" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-green-500" />
              <h3 className="text-sm font-semibold text-slate-700">用户活跃趋势</h3>
              <span className="text-xs text-slate-400 ml-1">近 6 个月</span>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.trends.userActivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="activeUsers" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="活跃用户" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right: Alerts */}
        <div className="space-y-6">
          {/* Expiring Licenses */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                许可证预警
              </h3>
            </div>
            <div className="divide-y divide-slate-50">
              {data.alerts.expiredLicenseOrgs.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-400">暂无预警</div>
              ) : (
                data.alerts.expiredLicenseOrgs.slice(0, 5).map((org) => (
                  <div
                    key={org.orgId}
                    onClick={() => navigate(`/admin/tenants/${org.orgId}`)}
                    className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition"
                  >
                    <div>
                      <div className="text-sm text-slate-700">{org.orgName}</div>
                      <div className="text-xs text-red-500">
                        {org.expiresAt ? `到期: ${new Date(org.expiresAt).toLocaleDateString('zh-CN')}` : '已过期'}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent License Activity */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                最近套餐活动
              </h3>
            </div>
            <div className="divide-y divide-slate-50">
              {data.alerts.recentLicenseActivity.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-400">暂无活动</div>
              ) : (
                data.alerts.recentLicenseActivity.map((ev, i) => {
                  const meta = LICENSE_ACTION_LABELS[ev.action] ?? {
                    label: ev.action.replace('license.', ''),
                    icon: Sparkles,
                    className: 'bg-slate-100 text-slate-700',
                  };
                  const Icon = meta.icon;
                  return (
                    <div
                      key={i}
                      onClick={() => ev.orgId && navigate(`/admin/tenants/${ev.orgId}`)}
                      className={`px-4 py-2.5 flex items-center gap-2 transition ${
                        ev.orgId ? 'cursor-pointer hover:bg-slate-50' : ''
                      }`}
                    >
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full shrink-0 ${meta.className}`}>
                        <Icon className="w-3 h-3" />
                        {meta.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-700 truncate">{ev.orgName}</div>
                        <div className="text-xs text-slate-400">{formatRelative(ev.createdAt)}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Operational Orgs — full-width table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-500" />
            各机构运营概况
          </h3>
          <span className="text-xs text-slate-400">按最近活动排序</span>
        </div>
        {data.alerts.operationalOrgs.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">暂无机构</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                <th className="text-left px-5 py-2.5">机构名</th>
                <th className="text-left px-4 py-2.5">活跃成员</th>
                <th className="text-left px-4 py-2.5">本月个案</th>
                <th className="text-left px-4 py-2.5">套餐</th>
                <th className="text-left px-4 py-2.5">许可状态</th>
                <th className="text-left px-4 py-2.5">最近活动</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.alerts.operationalOrgs.map((org) => {
                const ls = LICENSE_STATUS_LABELS[org.licenseStatus];
                return (
                  <tr
                    key={org.orgId}
                    onClick={() => navigate(`/admin/tenants/${org.orgId}`)}
                    className="cursor-pointer hover:bg-slate-50 transition"
                  >
                    <td className="px-5 py-3">
                      <div className="text-sm font-medium text-slate-900">{org.orgName}</div>
                      <div className="text-xs text-slate-400 font-mono">{org.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{org.activeMemberCount}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{org.monthlyEpisodes}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {org.tier ? TIER_LABELS[org.tier] : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ls.className}`}>{ls.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatRelative(org.lastActivityAt)}</td>
                    <td className="px-4 py-3"><ChevronRight className="w-4 h-4 text-slate-300" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
