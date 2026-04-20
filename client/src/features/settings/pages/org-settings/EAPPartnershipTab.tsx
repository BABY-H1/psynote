import { useState } from 'react';
import { Building2, Handshake, Plus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../api/client';
import { useAuthStore } from '../../../../stores/authStore';
import { useOrgMembers } from '../../../../api/useOrg';
import { useToast } from '../../../../shared/components';

/**
 * EAP partnership tab — shown on provider-side orgs. Lists each
 * enterprise client this org provides for and lets admins assign /
 * unassign specific counselors to each partnership.
 */
export function EAPPartnershipTab() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: partnershipData, isLoading } = useQuery({
    queryKey: ['eap-partnerships', orgId],
    queryFn: () => api.get<{ partnerships: any[] }>(`/orgs/${orgId}/eap/partnerships`),
    enabled: !!orgId,
  });

  const { data: assignmentData } = useQuery({
    queryKey: ['eap-assignments', orgId],
    queryFn: () => api.get<{ assignments: any[] }>(`/orgs/${orgId}/eap/assignments`),
    enabled: !!orgId,
  });

  const { data: members } = useOrgMembers();
  const counselors = (members || []).filter((m) => m.role === 'counselor');

  const [assigningFor, setAssigningFor] = useState<string | null>(null);
  const [selectedCounselor, setSelectedCounselor] = useState('');

  const partnerships = partnershipData?.partnerships || [];
  const assignments = assignmentData?.assignments || [];

  const providerPartnerships = partnerships.filter((p: any) => p.role === 'provider');

  async function handleAssign(partnershipId: string) {
    if (!selectedCounselor || !orgId) return;
    try {
      await api.post(`/orgs/${orgId}/eap/assignments`, {
        partnershipId,
        counselorUserId: selectedCounselor,
      });
      toast('咨询师已指派', 'success');
      setAssigningFor(null);
      setSelectedCounselor('');
      qc.invalidateQueries({ queryKey: ['eap-assignments'] });
      qc.invalidateQueries({ queryKey: ['eap-partnerships'] });
    } catch (err: any) {
      toast(err?.message || '指派失败', 'error');
    }
  }

  async function handleRemoveAssignment(assignmentId: string) {
    if (!orgId) return;
    try {
      await api.delete(`/orgs/${orgId}/eap/assignments/${assignmentId}`);
      toast('已撤回指派', 'success');
      qc.invalidateQueries({ queryKey: ['eap-assignments'] });
      qc.invalidateQueries({ queryKey: ['eap-partnerships'] });
    } catch (err: any) {
      toast(err?.message || '撤回失败', 'error');
    }
  }

  if (isLoading) {
    return <div className="text-slate-400 text-sm py-8 text-center">加载中...</div>;
  }

  if (providerPartnerships.length === 0) {
    return (
      <div className="text-center py-12">
        <Handshake className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">暂无 EAP 合作关系</p>
        <p className="text-slate-400 text-xs mt-1">当系统管理员创建企业版租户并绑定您的机构时，合作关系会自动出现在这里</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">管理与企业客户的 EAP 合作关系，指派咨询师提供服务</p>

      {providerPartnerships.map((p: any) => {
        const partnershipAssignments = assignments.filter((a: any) => a.partnershipId === p.id);
        const assignedCounselorIds = new Set(partnershipAssignments.map((a: any) => a.counselorUserId));
        const availableCounselors = counselors.filter((c) => !assignedCounselorIds.has(c.userId));

        return (
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{p.partnerOrg?.name}</h3>
                  <p className="text-xs text-slate-400">
                    企业客户 · {p.assignedCounselorCount || 0} 名咨询师已指派
                  </p>
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${
                p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {p.status === 'active' ? '合作中' : p.status}
              </span>
            </div>

            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-slate-700">已指派咨询师</span>
                {p.status === 'active' && (
                  <button
                    onClick={() => setAssigningFor(assigningFor === p.id ? null : p.id)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    指派咨询师
                  </button>
                )}
              </div>

              {partnershipAssignments.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">暂未指派咨询师</p>
              ) : (
                <div className="space-y-2">
                  {partnershipAssignments.map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg">
                      <div>
                        <span className="text-sm text-slate-700">{a.counselorName || '未知'}</span>
                        <span className="text-xs text-slate-400 ml-2">{a.counselorEmail}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveAssignment(a.id)}
                        className="text-xs text-red-500 hover:text-red-600"
                      >
                        撤回
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {assigningFor === p.id && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                  <div className="flex gap-2">
                    <select
                      value={selectedCounselor}
                      onChange={(e) => setSelectedCounselor(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="">选择咨询师...</option>
                      {availableCounselors.map((c) => (
                        <option key={c.userId} value={c.userId}>
                          {c.name} ({c.email})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleAssign(p.id)}
                      disabled={!selectedCounselor}
                      className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
                    >
                      确认指派
                    </button>
                  </div>
                  {availableCounselors.length === 0 && (
                    <p className="text-xs text-blue-600 mt-2">所有咨询师已指派，无可用人选</p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
