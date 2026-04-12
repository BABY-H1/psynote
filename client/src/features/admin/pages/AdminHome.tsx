import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../api/client';
import {
  Building2,
  Users,
  FileText,
  ClipboardCheck,
  AlertTriangle,
  TrendingUp,
  Activity,
  ChevronRight,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DashboardData {
  tiles: {
    activeTenants: number;
    monthlyActiveUsers: number;
    monthlyCareEpisodes: number;
    monthlyAssessments: number;
    expiringLicenses: number;
  };
  trends: {
    tenantGrowth: { month: string; count: number }[];
    userActivity: { month: string; activeUsers: number }[];
  };
  alerts: {
    expiredLicenseOrgs: { orgId: string; orgName: string; expiresAt: string }[];
    dormantOrgs: { orgId: string; orgName: string; lastActivity: string }[];
    recentAuditEvents: { action: string; resource: string; createdAt: string; userName: string }[];
  };
}

/* ------------------------------------------------------------------ */
/*  Tile config                                                        */
/* ------------------------------------------------------------------ */

const TILES = [
  { key: 'activeTenants' as const, label: '活跃租户', icon: Building2, color: 'blue' },
  { key: 'monthlyActiveUsers' as const, label: '本月活跃用户', icon: Users, color: 'green' },
  { key: 'monthlyCareEpisodes' as const, label: '本月新建个案', icon: FileText, color: 'purple' },
  { key: 'monthlyAssessments' as const, label: '本月测评完成', icon: ClipboardCheck, color: 'orange' },
  { key: 'expiringLicenses' as const, label: '即将到期许可', icon: AlertTriangle, color: 'red' },
] as const;

const COLOR_MAP: Record<string, { bg: string; icon: string }> = {
  blue: { bg: 'bg-blue-50', icon: 'text-blue-500' },
  green: { bg: 'bg-green-50', icon: 'text-green-500' },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-500' },
  orange: { bg: 'bg-orange-50', icon: 'text-orange-500' },
  red: { bg: 'bg-red-50', icon: 'text-red-500' },
};

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

      {/* Snapshot Tiles */}
      <div className="grid grid-cols-5 gap-4">
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
          {/* Tenant Growth */}
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

          {/* User Activity */}
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

          {/* Dormant Orgs */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                休眠机构
              </h3>
            </div>
            <div className="divide-y divide-slate-50">
              {data.alerts.dormantOrgs.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-400">暂无休眠机构</div>
              ) : (
                data.alerts.dormantOrgs.slice(0, 5).map((org) => (
                  <div
                    key={org.orgId}
                    onClick={() => navigate(`/admin/tenants/${org.orgId}`)}
                    className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition"
                  >
                    <div>
                      <div className="text-sm text-slate-700">{org.orgName}</div>
                      <div className="text-xs text-slate-400">无活跃成员</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Audit Events */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">最近操作</h3>
            </div>
            <div className="divide-y divide-slate-50">
              {data.alerts.recentAuditEvents.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-400">暂无记录</div>
              ) : (
                data.alerts.recentAuditEvents.slice(0, 5).map((ev, i) => (
                  <div key={i} className="px-4 py-2.5">
                    <div className="text-xs text-slate-600">
                      <span className="font-medium">{ev.userName}</span>
                      {' '}{ev.action}{' '}
                      <span className="text-slate-400">{ev.resource}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {new Date(ev.createdAt).toLocaleString('zh-CN')}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
