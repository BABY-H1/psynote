import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../api/client';
import { useAuthStore } from '../../../../stores/authStore';
import { useToast } from '../../../../shared/components';

/**
 * Basic info tab — a thin form over PATCH /orgs/:orgId that currently
 * only edits `name`. Room to grow later; kept minimal to mirror the
 * monolith's behavior exactly.
 */
export function BasicInfoTab() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const { data: org, isLoading } = useQuery({
    queryKey: ['org-detail', orgId],
    queryFn: () =>
      api.get<{ id: string; name: string; slug: string; settings: any; createdAt: string }>(`/orgs/${orgId}`),
    enabled: !!orgId,
  });
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (org && !initialized) {
      setName(org.name);
      setInitialized(true);
    }
  }, [org, initialized]);

  const updateOrg = useMutation({
    mutationFn: (data: { name: string }) => api.patch(`/orgs/${orgId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-detail'] });
      toast('已保存', 'success');
    },
  });

  if (isLoading) return <div className="text-sm text-slate-400">加载中…</div>;

  return (
    <div className="space-y-6 max-w-lg">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">机构名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">创建时间</label>
          <p className="text-sm text-slate-600">
            {org?.createdAt ? new Date(org.createdAt).toLocaleDateString('zh-CN') : '—'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => updateOrg.mutate({ name })}
          disabled={updateOrg.isPending || name === org?.name}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {updateOrg.isPending ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
}
