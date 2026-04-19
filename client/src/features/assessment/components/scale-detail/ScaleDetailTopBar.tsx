import { Edit3, Loader2, Save, Trash2 } from 'lucide-react';
import type { SubTab } from './types';
import { SCORING_MODE_LABELS } from './types';

const SUBTABS: { key: SubTab; label: string }[] = [
  { key: 'overview', label: '总览' },
  { key: 'dimensions', label: '维度' },
  { key: 'items', label: '题目' },
  { key: 'options', label: '选项配置' },
];

/**
 * ScaleDetail's top bar: sub-tab switcher on the left, context-sensitive
 * action buttons on the right.
 *
 * Read mode  → 计分模式 chip + 编辑 + (预览报告)? + (删除)?
 * Edit mode  → 取消 + 保存 (disabled/loading when mutation pending)
 *
 * The delete button is hidden for platform-owned scales (where
 * `canDelete=false`, derived upstream from `scale.orgId`).
 */
export function ScaleDetailTopBar({
  activeSubTab,
  onSubTabChange,
  editing,
  scoringMode,
  canDelete,
  canPreviewReport,
  isSaving,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onPreviewReport,
}: {
  activeSubTab: SubTab;
  onSubTabChange: (t: SubTab) => void;
  editing: boolean;
  scoringMode: string;
  canDelete: boolean;
  canPreviewReport: boolean;
  isSaving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
  onPreviewReport?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
      <div className="flex bg-slate-100 rounded-lg p-0.5">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            onClick={() => onSubTabChange(t.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeSubTab === t.key
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
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
              {SCORING_MODE_LABELS[scoringMode] || scoringMode}
            </span>
            <button
              onClick={onEdit}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" /> 编辑
            </button>
            {canPreviewReport && onPreviewReport && (
              <button
                onClick={onPreviewReport}
                className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50"
              >
                预览报告
              </button>
            )}
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
