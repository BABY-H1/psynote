import { useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import type { SessionPhase } from '@psynote/shared';

/**
 * Single phase row within a session. In edit mode: name + duration +
 * description + optional facilitatorNotes. In read mode: collapsible
 * facilitator notes behind a chevron.
 */
export function PhaseItem({
  phase,
  index,
  editing,
  onUpdate,
  onRemove,
}: {
  phase: SessionPhase;
  index: number;
  editing: boolean;
  onUpdate: (field: keyof SessionPhase, value: string) => void;
  onRemove: () => void;
}) {
  const [showNotes, setShowNotes] = useState(false);

  if (editing) {
    return (
      <div className="border border-slate-200 rounded-lg p-2.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <input
            value={phase.name || ''}
            onChange={(e) => onUpdate('name', e.target.value)}
            placeholder="环节名称"
            className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <input
            value={phase.duration || ''}
            onChange={(e) => onUpdate('duration', e.target.value)}
            placeholder="时长"
            className="w-20 px-2 py-1 border border-slate-200 rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <button onClick={onRemove} className="text-slate-300 hover:text-red-500">
            <X className="w-3 h-3" />
          </button>
        </div>
        <textarea
          value={phase.description || ''}
          onChange={(e) => onUpdate('description', e.target.value)}
          placeholder="活动说明..."
          rows={2}
          className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
        />
        <textarea
          value={phase.facilitatorNotes || ''}
          onChange={(e) => onUpdate('facilitatorNotes', e.target.value)}
          placeholder="带领者注意事项（可选）"
          rows={1}
          className="w-full px-2 py-1 border border-slate-100 rounded text-xs text-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
        />
      </div>
    );
  }

  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-violet-600">{phase.name || `环节 ${index + 1}`}</span>
        {phase.duration && <span className="text-xs text-slate-400">{phase.duration}</span>}
        {phase.facilitatorNotes && (
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="ml-auto text-xs text-slate-400 hover:text-slate-600 flex items-center gap-0.5"
          >
            {showNotes ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} 带领提示
          </button>
        )}
      </div>
      {phase.description && <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{phase.description}</p>}
      {showNotes && phase.facilitatorNotes && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">{phase.facilitatorNotes}</p>
      )}
    </div>
  );
}
