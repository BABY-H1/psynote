import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { Building2, Users, Calendar } from 'lucide-react';

interface Partnership {
  id: string;
  enterpriseOrgId: string;
  providerOrgId: string;
  status: string;
  contractStart: string | null;
  contractEnd: string | null;
  seatAllocation: number | null;
  role: string;
  partnerOrg: { name: string; slug: string };
  assignedCounselorCount: number;
}

export function HRProviders() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    api.get<{ partnerships: Partnership[] }>(`/orgs/${orgId}/eap/partnerships`)
      .then((res) => setPartnerships(res.partnerships))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">合作机构</h1>
      <p className="text-sm text-slate-500 mb-6">管理与心理服务机构的合作关系</p>

      {loading ? (
        <div className="text-slate-400 text-sm py-12 text-center">加载中...</div>
      ) : partnerships.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">暂无合作机构</p>
          <p className="text-slate-400 text-xs mt-1">由系统管理员在创建企业时绑定合作机构</p>
        </div>
      ) : (
        <div className="space-y-4">
          {partnerships.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{p.partnerOrg.name}</h3>
                    <p className="text-xs text-slate-400">{p.partnerOrg.slug}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  p.status === 'active'
                    ? 'bg-green-100 text-green-700'
                    : p.status === 'expired'
                      ? 'bg-red-100 text-red-600'
                      : 'bg-slate-100 text-slate-600'
                }`}>
                  {p.status === 'active' ? '合作中' : p.status === 'expired' ? '已到期' : p.status}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Users className="w-4 h-4 text-slate-400" />
                  <span>{p.assignedCounselorCount} 名咨询师</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span>
                    {p.contractStart
                      ? new Date(p.contractStart).toLocaleDateString('zh-CN')
                      : '—'}
                    {' ~ '}
                    {p.contractEnd
                      ? new Date(p.contractEnd).toLocaleDateString('zh-CN')
                      : '长期'}
                  </span>
                </div>
                {p.seatAllocation && (
                  <div className="text-sm text-slate-600">
                    签约席位: {p.seatAllocation}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
