import React, { useState } from 'react';
import { useCreateReferral } from '../../../api/useCounseling';
import { useToast } from '../../../shared/components';

const targetTypeLabels: Record<string, string> = {
  psychiatric: '精神科',
  crisis_center: '危机中心',
  hospital: '医院',
  external_counselor: '外部咨询师',
  other: '其他',
};

interface Props {
  episodeId: string;
  clientId: string;
  onDone: () => void;
}

export function ReferralForm({ episodeId, clientId, onDone }: Props) {
  const createReferral = useCreateReferral();
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [riskSummary, setRiskSummary] = useState('');
  const [targetType, setTargetType] = useState('');
  const [targetName, setTargetName] = useState('');
  const [targetContact, setTargetContact] = useState('');
  const [followUpPlan, setFollowUpPlan] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createReferral.mutateAsync({
        careEpisodeId: episodeId,
        clientId,
        reason,
        riskSummary: riskSummary || undefined,
        targetType: targetType || undefined,
        targetName: targetName || undefined,
        targetContact: targetContact || undefined,
        followUpPlan: followUpPlan || undefined,
      });
      toast('转介已创建', 'success');
      onDone();
    } catch {
      toast('创建失败', 'error');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="font-semibold text-slate-900 mb-4">新建转介</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">转介原因 *</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            rows={3}
            placeholder="描述转介原因..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">风险摘要</label>
          <textarea
            value={riskSummary}
            onChange={(e) => setRiskSummary(e.target.value)}
            rows={2}
            placeholder="当前风险评估概要..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">转介目标类型</label>
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">未选择</option>
              {Object.entries(targetTypeLabels).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">目标机构/咨询师</label>
            <input
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder="名称"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">联系方式</label>
            <input
              value={targetContact}
              onChange={(e) => setTargetContact(e.target.value)}
              placeholder="电话/邮箱"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">后续跟进计划</label>
          <textarea
            value={followUpPlan}
            onChange={(e) => setFollowUpPlan(e.target.value)}
            rows={2}
            placeholder="转介后的跟进安排..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onDone} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            取消
          </button>
          <button
            type="submit"
            disabled={createReferral.isPending || !reason}
            className="px-6 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 disabled:opacity-50"
          >
            {createReferral.isPending ? '创建中...' : '发起转介'}
          </button>
        </div>
      </form>
    </div>
  );
}
