import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import {
  Building2,
  Users,
  FileText,
  AlertTriangle,
  TrendingUp,
  Activity,
  ChevronRight,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { TIER_LABELS, type OrgTier } from '@psynote/shared';

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
    operationalOrgs: {
      orgId: string;
      orgName: string;
      slug: string;
      activeMemberCount: number;
      monthlyEpisodes: number;
      tier: OrgTier | null;
      licenseStatus: 'active' | 'expired' | 'invalid' | 'none';
      licenseExpiresAt: string | null;
      lastActivityAt: string | null;
    }[];
  };
}

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

const LICENSE_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active:  { label: '有效',   className: 'bg-green-100 text-green-700' },
  expired: { label: '已过期', className: 'bg-red-100 text-red-700' },
  invalid: { label: '无效',   className: 'bg-orange-100 text-orange-700' },
  none:    { label: '未签发', className: 'bg-slate-100 text-slate-500' },
};

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

function formatRemainingDays(iso: string | null, status: string): { text: string; className: string } {
  if (status === 'none') return { text: '—', className: 'text-slate-400' };
  if (!iso) return { text: '永久', className: 'text-slate-500' };
  const days = Math.floor((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return { text: `已过期 ${-days}d`, className: 'text-rose-600' };
  if (days <= 7) return { text: `${days}d`, className: 'text-rose-600 font-semibold' };
  if (days <= 30) return { text: `${days}d`, className: 'text-amber-600 font-semibold' };
  return { text: `${days}d`, className: 'text-slate-600' };
}

export function AdminHome() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

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
    <div className="h-full flex flex-col gap-4 min-h-0 p-6">
      {/* Welcome */}
      <div className="flex items-baseline gap-3 flex-wrap flex-shrink-0">
        <h1 className="text-xl font-bold text-slate-900">
          你好，{user?.name || '系统管理员'}
        </h1>
        <p className="text-sm text-slate-500">平台运营概览与关键指标</p>
      </div>

      {/* Snapshot Tiles — 4 */}
      <div className="grid grid-cols-4 gap-3 flex-shrink-0">
        {TILES.map(({ key, label, icon: Icon, color }) => {
          const c = COLOR_MAP[color];
          return (
            <div
              key={key}
              className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 ${c.bg} rounded-xl flex items-center justify-center shrink-0`}>
                  <Icon className={`w-4 h-4 ${c.icon}`} />
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900 leading-tight">{data.tiles[key]}</div>
                  <div className="text-xs text-slate-400">{label}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 左右两栏 · 趋势 chart | 运营概况表 */}
      <div className="flex-1 min-h-0 grid grid-cols-5 gap-4">
        {/* 左 2/5：两个 chart */}
        <div className="col-span-2 min-h-0 flex flex-col gap-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-slate-700">租户增长趋势</h3>
              <span className="text-xs text-slate-400 ml-1">近 12 个月</span>
            </div>
            <div className="h-40">
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

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-green-500" />
              <h3 className="text-sm font-semibold text-slate-700">用户活跃趋势</h3>
              <span className="text-xs text-slate-400 ml-1">近 6 个月</span>
            </div>
            <div className="h-40">
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

        {/* 右 3/5：各机构运营概况 */}
        <div className="col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-0">
          <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-500" />
              各机构运营概况
            </h3>
            <span className="text-xs text-slate-400">按最近活动排序</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {data.alerts.operationalOrgs.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">暂无机构</div>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                    <th className="text-left px-4 py-2">机构名</th>
                    <th className="text-left px-3 py-2">活跃</th>
                    <th className="text-left px-3 py-2">本月个案</th>
                    <th className="text-left px-3 py-2">套餐</th>
                    <th className="text-left px-3 py-2">剩余</th>
                    <th className="text-left px-3 py-2">许可</th>
                    <th className="text-left px-3 py-2">最近</th>
                    <th className="w-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.alerts.operationalOrgs.map((org) => {
                    const ls = LICENSE_STATUS_LABELS[org.licenseStatus];
                    const remaining = formatRemainingDays(org.licenseExpiresAt, org.licenseStatus);
                    return (
                      <tr
                        key={org.orgId}
                        onClick={() => navigate(`/admin/tenants/${org.orgId}`)}
                        className="cursor-pointer hover:bg-slate-50 transition"
                      >
                        <td className="px-4 py-2">
                          <div className="text-sm font-medium text-slate-900">{org.orgName}</div>
                          <div className="text-xs text-slate-400 font-mono">{org.slug}</div>
                        </td>
                        <td className="px-3 py-2 text-sm text-slate-700">{org.activeMemberCount}</td>
                        <td className="px-3 py-2 text-sm text-slate-700">{org.monthlyEpisodes}</td>
                        <td className="px-3 py-2 text-sm text-slate-700">
                          {org.tier ? TIER_LABELS[org.tier] : <span className="text-slate-400">-</span>}
                        </td>
                        <td className={`px-3 py-2 text-sm ${remaining.className}`}>{remaining.text}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${ls.className}`}>{ls.label}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{formatRelative(org.lastActivityAt)}</td>
                        <td className="px-3 py-2"><ChevronRight className="w-4 h-4 text-slate-300" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
