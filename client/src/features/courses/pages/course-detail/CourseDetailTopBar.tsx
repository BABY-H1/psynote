import { Edit3, Loader2, Save, Trash2 } from 'lucide-react';
import { STATUS_LABELS } from './types';

/**
 * CourseDetail's top bar: "总" + numbered session tabs on the left,
 * context-sensitive action buttons on the right.
 *
 * Read mode  → status chip + 编辑 + (删除)?
 * Edit mode  → 取消 + 保存 (disabled/loading when saving)
 *
 * The delete button is hidden for platform-owned courses (canDelete=false),
 * mirroring ScaleDetail's analogous behavior.
 */
export function CourseDetailTopBar({
  activeTab,
  sessionCount,
  onTabChange,
  editing,
  status,
  canDelete,
  isSaving,
  onEdit,
  onCancel,
  onSave,
  onDelete,
}: {
  activeTab: 'overview' | number;
  sessionCount: number;
  onTabChange: (t: 'overview' | number) => void;
  editing: boolean;
  status: string;
  canDelete: boolean;
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
              ? 'bg-amber-100 text-amber-700'
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
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-700'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <button
              onClick={onCancel}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50"
            >
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
              {STATUS_LABELS[status] || status}
            </span>
            <button
              onClick={onEdit}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" /> 编辑
            </button>
            {canDelete && (
              <button
                onClick={onDelete}
                className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> 删除
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
