import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface Props {
  complaint: string;
  onComplaintChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function ComplaintStep({ complaint, onComplaintChange, onBack, onNext }: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-bold text-slate-900 mb-1">来访原因</h2>
      <p className="text-sm text-slate-500 mb-4">简要描述来访者的主要问题（可跳过，后续补充）</p>

      <div>
        <label className="block text-xs text-slate-500 mb-1">主诉</label>
        <textarea value={complaint} onChange={(e) => onComplaintChange(e.target.value)}
          rows={4} placeholder="简要描述来访者的主要问题..."
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      <div className="flex justify-between mt-6">
        <button onClick={onBack} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> 上一步
        </button>
        <button onClick={onNext}
          className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 flex items-center gap-1.5">
          下一步 <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
