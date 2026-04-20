import { Edit3, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { visibilityLabels } from './types';

/**
 * Top bar: "总" + numbered session tabs (+ plus button in edit mode) on
 * the left, action buttons on the right.
 */
export function SchemeDetailTopBar({
  activeTab,
  sessionCount,
  onTabChange,
  onAddSession,
  editing,
  visibility,
  isSaving,
  onEdit,
  onCancel,
  onSave,
  onDelete,
}: {
  activeTab: 'overview' | number;
  sessionCount: number;
  onTabChange: (t: 'overview' | number) => void;
  onAddSession: () => void;
  editing: boolean;
  visibility: string;
  isSaving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onTabChange('overview')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            activeTab === 'overview'
              ? 'bg-violet-100 text-violet-700'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
          }`}
        >
          总
        </button>
        {Array.from({ length: sessionCount }).map((_, i) => (
          <button
            key={i}
            onClick={() => onTabChange(i)}
            className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition ${
              activeTab === i
                ? 'bg-violet-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-violet-100 hover:text-violet-700'
            }`}
          >
            {i + 1}
          </button>
        ))}
        {editing && (
          <button
            onClick={onAddSession}
            className="w-7 h-7 rounded-full bg-slate-50 text-slate-400 hover:bg-violet-100 hover:text-violet-600 flex items-center justify-center transition"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <button onClick={onCancel} className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50">
              取消
            </button>
            <button
              onClick={onSave}
              disabled={isSaving}
              className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" /> 保存
                </>
              )}
            </button>
          </>
        ) : (
          <>
            <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
              {visibilityLabels[visibility] || visibility}
            </span>
            <button onClick={onEdit} className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5" /> 编辑
            </button>
            <button onClick={onDelete} className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" /> 删除
            </button>
          </>
        )}
      </div>
    </div>
  );
}
