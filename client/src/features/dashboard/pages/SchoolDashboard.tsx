import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { Users, GraduationCap, ClipboardCheck, AlertTriangle } from 'lucide-react';

interface StudentStats {
  total: number;
  grades: Array<{ name: string; count: number }>;
}

export function SchoolDashboard() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    api.get<StudentStats>(`/orgs/${orgId}/school/students/stats`)
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  if (loading) {
    return <div className="text-slate-400 text-sm py-12 text-center">加载中...</div>;
  }

  const tiles = [
    { label: '在册学生', value: stats?.total ?? 0, icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: '年级数', value: stats?.grades?.length ?? 0, icon: GraduationCap, color: 'text-teal-600 bg-teal-50' },
    { label: '测评完成', value: 0, icon: ClipboardCheck, color: 'text-green-600 bg-green-50' },
    { label: '预警关注', value: 0, icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">学校心理工作台</h1>
      <p className="text-sm text-slate-500 mb-6">学生心理健康概览</p>

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

      {stats?.grades && stats.grades.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">年级学生分布</h2>
          <div className="space-y-3">
            {stats.grades.map((grade) => {
              const pct = stats.total > 0 ? Math.round((grade.count / stats.total) * 100) : 0;
              return (
                <div key={grade.name} className="flex items-center gap-4">
                  <span className="text-sm text-slate-600 w-20 truncate">{grade.name}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div className="bg-teal-400 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm text-slate-500 w-16 text-right">{grade.count} 人</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
