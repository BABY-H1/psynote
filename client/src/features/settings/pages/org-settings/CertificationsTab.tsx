import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../api/client';
import { useAuthStore } from '../../../../stores/authStore';
import { useOrgMembers } from '../../../../api/useOrg';
import { useToast } from '../../../../shared/components';

/**
 * Certifications tab — lists counselors (+ org_admins, who may double as
 * counselors in small orgs) and lets an admin add/remove certificates
 * per member. Expired + about-to-expire certs highlight in red/amber.
 */
export function CertificationsTab() {
  const { data: members = [], isLoading } = useOrgMembers();
  const qc = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrgId);
  const { toast } = useToast();

  const counselors = members.filter((m) => m.role === 'counselor' || m.role === 'org_admin');

  const updateCerts = useMutation({
    mutationFn: ({ memberId, certifications }: { memberId: string; certifications: any[] }) =>
      api.patch(`/orgs/${orgId}/members/${memberId}`, { certifications }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      toast('证书已更新', 'success');
    },
  });

  if (isLoading) return <div className="text-sm text-slate-400">加载中…</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">管理咨询师的执业资质证书，过期证书将高亮预警。</p>

      {counselors.length === 0 && <div className="text-sm text-slate-400">暂无咨询师</div>}

      {counselors.map((m) => {
        const certs = (m.certifications ?? []) as Array<{
          name: string;
          issuer: string;
          number: string;
          issuedAt: string;
          expiresAt?: string;
        }>;
        const now = new Date();

        return (
          <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">{m.name}</div>
                <div className="text-xs text-slate-400">{m.email} · {m.role}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const newCert = {
                    name: '',
                    issuer: '',
                    number: '',
                    issuedAt: new Date().toISOString().slice(0, 10),
                  };
                  updateCerts.mutate({ memberId: m.id, certifications: [...certs, newCert] });
                }}
                className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
              >
                + 添加证书
              </button>
            </div>

            {certs.length === 0 ? (
              <div className="text-xs text-slate-400">暂无证书记录</div>
            ) : (
              <div className="space-y-2">
                {certs.map((cert, idx) => {
                  const isExpiring =
                    cert.expiresAt && new Date(cert.expiresAt) <= new Date(now.getTime() + 30 * 86400000);
                  const isExpired = cert.expiresAt && new Date(cert.expiresAt) < now;

                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between text-xs p-2 rounded ${
                        isExpired
                          ? 'bg-red-50 border border-red-200'
                          : isExpiring
                            ? 'bg-amber-50 border border-amber-200'
                            : 'bg-slate-50'
                      }`}
                    >
                      <div>
                        <span className="font-medium text-slate-700">{cert.name || '(未命名证书)'}</span>
                        {cert.issuer && <span className="text-slate-400 ml-2">· {cert.issuer}</span>}
                        {cert.number && <span className="text-slate-400 ml-2">#{cert.number}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {isExpired && <span className="text-red-600 font-medium">已过期</span>}
                        {isExpiring && !isExpired && (
                          <span className="text-amber-600 font-medium">即将过期</span>
                        )}
                        {cert.expiresAt && <span className="text-slate-400">{cert.expiresAt}</span>}
                        <button
                          type="button"
                          onClick={() => {
                            const updated = certs.filter((_, i) => i !== idx);
                            updateCerts.mutate({ memberId: m.id, certifications: updated });
                          }}
                          className="text-red-400 hover:text-red-600"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
