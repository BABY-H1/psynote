import React, { useState } from 'react';
import { useCreateFollowUpReview } from '../../../api/useCounseling';
import { useToast } from '../../../shared/components';

const riskLabels: Record<string, string> = {
  level_1: '一般', level_2: '关注', level_3: '严重', level_4: '危机',
};

const decisionLabels: Record<string, string> = {
  continue: '继续跟踪', escalate: '升级处理', deescalate: '降低等级', close: '结案',
};

interface Props {
  planId: string;
  episodeId: string;
  currentRisk: string;
  onDone: () => void;
}

export function FollowUpReviewForm({ planId, episodeId, currentRisk, onDone }: Props) {
  const createReview = useCreateFollowUpReview();
  const { toast } = useToast();
  const [riskAfter, setRiskAfter] = useState(currentRisk);
  const [clinicalNote, setClinicalNote] = useState('');
  const [decision, setDecision] = useState('continue');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createReview.mutateAsync({
        planId,
        careEpisodeId: episodeId,
        riskBefore: currentRisk,
        riskAfter,
        clinicalNote: clinicalNote || undefined,
        decision,
      });
      toast('复评已记录', 'success');
      onDone();
    } catch {
      toast('操作失败', 'error');
    }
  };

  return (
    <div className="bg-slate-50 rounded-lg p-4 mt-2">
      <h4 className="text-sm font-medium text-slate-700 mb-3">记录复评</h4>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">当前风险</label>
            <div className="px-3 py-1.5 bg-white border border-slate-200 rounded text-sm text-slate-600">
              {riskLabels[currentRisk] || currentRisk}
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">评估后风险</label>
            <select
              value={riskAfter}
              onChange={(e) => setRiskAfter(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm"
            >
              {Object.entries(riskLabels).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">临床备注</label>
          <textarea
            value={clinicalNote}
            onChange={(e) => setClinicalNote(e.target.value)}
            rows={2}
            className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">决定</label>
          <select
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm"
          >
            {Object.entries(decisionLabels).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onDone} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">
            取消
          </button>
          <button
            type="submit"
            disabled={createReview.isPending}
            className="px-4 py-1.5 bg-brand-600 text-white rounded text-xs hover:bg-brand-500 disabled:opacity-50"
          >
            {createReview.isPending ? '提交中...' : '提交复评'}
          </button>
        </div>
      </form>
    </div>
  );
}
