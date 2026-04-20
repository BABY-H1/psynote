import { Globe, Plus } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../api/client';
import { useAuthStore } from '../../../../stores/authStore';
import { useOrgMembers } from '../../../../api/useOrg';
import { useToast } from '../../../../shared/components';
import { ServiceCard, type PublicService } from './ServiceCard';

/**
 * Public services tab — CRUD for services that appear on the org's
 * Portal landing page (`/public/orgs/:slug/services`). Stored inline in
 * `org.settings.publicServices` (jsonb). Each row's editor lives in
 * ServiceCard to keep this file as a thin list + dispatch layer.
 */
export function PublicServicesTab() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const { data: org, isLoading } = useQuery({
    queryKey: ['org-detail', orgId],
    queryFn: () => api.get<{ id: string; slug: string; settings: any }>(`/orgs/${orgId}`),
    enabled: !!orgId,
  });
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: members = [] } = useOrgMembers();
  const counselors = members.filter((m) => m.role === 'counselor' && m.status === 'active');

  const services: PublicService[] = (org?.settings as any)?.publicServices ?? [];

  const updateServices = useMutation({
    mutationFn: (updated: PublicService[]) =>
      api.patch(`/orgs/${orgId}`, {
        settings: { ...((org?.settings as any) ?? {}), publicServices: updated },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-detail'] });
      toast('服务配置已保存', 'success');
    },
  });

  function addService() {
    const newSvc: PublicService = {
      id: crypto.randomUUID(),
      title: '新服务项目',
      description: '',
      sessionFormat: 'individual',
      targetAudience: '',
      availableCounselorIds: counselors.map((c) => c.userId),
      intakeMode: 'booking',
      isActive: false,
    };
    updateServices.mutate([...services, newSvc]);
  }

  function updateOne(idx: number, patch: Partial<PublicService>) {
    updateServices.mutate(services.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function removeService(idx: number) {
    updateServices.mutate(services.filter((_, i) => i !== idx));
  }

  if (isLoading) return <div className="text-sm text-slate-400">加载中…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">配置对外公开的咨询服务项目。来访者通过 Portal 浏览并申请。</p>
          {org?.slug && (
            <p className="text-xs text-slate-400 mt-1">
              机构 Portal 地址：
              <code className="bg-slate-100 px-1 rounded">/public/orgs/{org.slug}/services</code>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={addService}
          disabled={updateServices.isPending}
          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> 新增服务
        </button>
      </div>

      {services.length === 0 && (
        <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center">
          <Globe className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">暂未配置公开服务</p>
          <p className="text-xs text-slate-400 mt-1">点击上方"新增服务"开始配置</p>
        </div>
      )}

      {services.map((svc, idx) => (
        <ServiceCard
          key={svc.id}
          svc={svc}
          counselors={counselors}
          onUpdate={(patch) => updateOne(idx, patch)}
          onRemove={() => removeService(idx)}
          onFlush={() => updateServices.mutate(services)}
        />
      ))}
    </div>
  );
}
