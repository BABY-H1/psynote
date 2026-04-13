import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { AlertTriangle, Shield } from 'lucide-react';

interface CrisisAlert {
  id: string;
  employeeUserId: string;
  counselorUserId: string;
  crisisType: string;
  description: string | null;
  status: string;
  createdAt: string;
  employeeName?: string;
  counselorName?: string;
}

const CRISIS_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  self_harm: { label: '自伤风险', color: 'bg-red-100 text-red-700' },
  harm_others: { label: '他伤风险', color: 'bg-orange-100 text-orange-700' },
  abuse: { label: '虐待', color: 'bg-rose-100 text-rose-700' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: '待处理', color: 'bg-red-100 text-red-700' },
  handling: { label: '处理中', color: 'bg-amber-100 text-amber-700' },
  resolved: { label: '已处理', color: 'bg-green-100 text-green-700' },
};

export function HRCrisisAlerts() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const [alerts, setAlerts] = useState<CrisisAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    api.get<{ alerts: CrisisAlert[] }>(`/orgs/${orgId}/eap/crisis`)
      .then((res) => setAlerts(res.alerts))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 mb-1">危机预警</h1>
      <p className="text-sm text-slate-500 mb-6">
        仅在法定例外情况下（自伤/他伤/虐待）显名通知。其他级别仅显示团体报告。
      </p>

      {loading ? (
        <div className="text-slate-400 text-sm py-12 text-center">加载中...</div>
      ) : alerts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <Shield className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">暂无危机预警</p>
          <p className="text-slate-400 text-xs mt-1">系统运行正常，未检测到高风险状况</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const typeInfo = CRISIS_TYPE_LABELS[alert.crisisType] || { label: alert.crisisType, color: 'bg-slate-100 text-slate-600' };
            const statusInfo = STATUS_LABELS[alert.status] || { label: alert.status, color: 'bg-slate-100 text-slate-600' };

            return (
              <div key={alert.id} className="bg-white rounded-xl border border-red-200 shadow-sm p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {alert.employeeName || '员工'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(alert.createdAt).toLocaleString('zh-CN')}
                        {alert.counselorName && ` · 标记人: ${alert.counselorName}`}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
                {alert.description && (
                  <p className="text-sm text-slate-600 mt-3 pl-12">{alert.description}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
