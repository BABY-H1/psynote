import React, { useState } from 'react';
import { useCreateFollowUpPlan } from '../../../api/useCounseling';
import { useToast } from '../../../shared/components';

const planTypeLabels: Record<string, string> = {
  reassessment: '复评', callback: '回访', check_in: '签到',
};

const frequencyOptions = ['weekly', 'bi-weekly', 'monthly', 'quarterly'];
const frequencyLabels: Record<string, string> = {
  weekly: '每周', 'bi-weekly': '双周', monthly: '每月', quarterly: '每季度',
};

interface Props {
  episodeId: string;
  onDone: () => void;
}

export function FollowUpPlanForm({ episodeId, onDone }: Props) {
  const createPlan = useCreateFollowUpPlan();
  const { toast } = useToast();
  const [planType, setPlanType] = useState('check_in');
  const [frequency, setFrequency] = useState('monthly');
  const [nextDue, setNextDue] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createPlan.mutateAsync({
        careEpisodeId: episodeId,
        planType,
        frequency,
        nextDue: nextDue ? new Date(nextDue).toISOString() : undefined,
        notes: notes || undefined,
      });
      toast('随访计划已创建', 'success');
      onDone();
    } catch {
      toast('创建失败', 'error');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="font-semibold text-slate-900 mb-4">新建随访计划</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">计划类型</label>
            <select
              value={planType}
              onChange={(e) => setPlanType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {Object.entries(planTypeLabels).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">频率</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {frequencyOptions.map((v) => (
                <option key={v} value={v}>{frequencyLabels[v]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">下次到期日</label>
            <input
              type="date"
              value={nextDue}
              onChange={(e) => setNextDue(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">备注</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onDone} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            取消
          </button>
          <button
            type="submit"
            disabled={createPlan.isPending}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
          >
            {createPlan.isPending ? '创建中...' : '创建计划'}
          </button>
        </div>
      </form>
    </div>
  );
}
