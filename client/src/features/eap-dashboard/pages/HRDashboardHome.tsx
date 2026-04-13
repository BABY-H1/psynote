import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { Users, ClipboardCheck, UserCheck, AlertTriangle } from 'lucide-react';

interface EmployeeStats {
  total: number;
  anonymousCount: number;
  departments: Array<{ name: string; count: number }>;
}

export function HRDashboardHome() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const [stats, setStats] = useState<EmployeeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    api.get<EmployeeStats>(`/orgs/${orgId}/eap/employees/stats`)
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  if (loading) {
    return <div className="text-slate-400 text-sm py-12 text-center">加载中...</div>;
  }

  const tiles = [
    {
      label: '注册员工',
      value: stats?.total ?? 0,
      icon: Users,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: '部门数',
      value: stats?.departments?.length ?? 0,
      icon: ClipboardCheck,
      color: 'text-green-600 bg-green-50',
    },
    {
      label: '匿名用户',
      value: stats?.anonymousCount ?? 0,
      icon: UserCheck,
      color: 'text-purple-600 bg-purple-50',
    },
    {
      label: '危机预警',
      value: 0, // Will be populated from crisis alerts API later
      icon: AlertTriangle,
      color: 'text-red-600 bg-red-50',
    },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">数据概览</h1>
      <p className="text-sm text-slate-500 mb-6">EAP 员工心理援助计划运营数据</p>

      {/* KPI Tiles */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {tiles.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-500">{label}</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      {/* Department Breakdown */}
      {stats?.departments && stats.departments.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">部门人员分布</h2>
          <div className="space-y-3">
            {stats.departments.map((dept) => {
              const pct = stats.total > 0 ? Math.round((dept.count / stats.total) * 100) : 0;
              return (
                <div key={dept.name} className="flex items-center gap-4">
                  <span className="text-sm text-slate-600 w-24 truncate">{dept.name}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-amber-400 h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm text-slate-500 w-16 text-right">{dept.count} 人</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Placeholder for analytics charts */}
      <div className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">服务使用趋势</h2>
        <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
          暂无数据 — 员工使用服务后将自动生成趋势图
        </div>
      </div>
    </div>
  );
}
