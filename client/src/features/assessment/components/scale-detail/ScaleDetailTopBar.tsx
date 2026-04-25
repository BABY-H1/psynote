import { ArrowLeft, Edit3, Eye, Loader2, PanelRightOpen, Save, Trash2 } from 'lucide-react';
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
  onBack,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onPreviewReport,
  aiPanelOpen,
  onToggleAiPanel,
}: {
  activeSubTab: SubTab;
  onSubTabChange: (t: SubTab) => void;
  editing: boolean;
  scoringMode: string;
  canDelete: boolean;
  canPreviewReport: boolean;
  isSaving: boolean;
  onBack?: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
  onPreviewReport?: () => void;
  aiPanelOpen?: boolean;
  onToggleAiPanel?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-white border-b border-slate-200 flex-shrink-0 min-w-0">
      <div className="flex items-center gap-2 min-w-0 flex-shrink">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded flex-shrink-0"
            title="返回列表"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="flex bg-slate-100 rounded-lg p-0.5 flex-shrink min-w-0">
          {SUBTABS.map((t) => (
            <button
              key={t.key}
              onClick={() => onSubTabChange(t.key)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
                activeSubTab === t.key
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {editing ? (
          <>
            <button
              onClick={onCancel}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 whitespace-nowrap"
            >
              取消
            </button>
            <button
              onClick={onSave}
              disabled={isSaving}
              className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
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
            <span className="hidden sm:inline-block text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full whitespace-nowrap">
              {SCORING_MODE_LABELS[scoringMode] || scoringMode}
            </span>
            <button
              onClick={onEdit}
              className="px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5 whitespace-nowrap"
              title="编辑"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">编辑</span>
            </button>
            {canPreviewReport && onPreviewReport && (
              <button
                onClick={onPreviewReport}
                className="px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5 whitespace-nowrap"
                title="预览报告"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">预览报告</span>
              </button>
            )}
            {canDelete && (
              <button
                onClick={onDelete}
                className="px-2.5 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 flex items-center gap-1.5 whitespace-nowrap"
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">删除</span>
              </button>
            )}
          </>
        )}
        {onToggleAiPanel && !aiPanelOpen && (
          <button
            onClick={onToggleAiPanel}
            className="ml-1 p-1.5 border border-amber-200 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition flex-shrink-0"
            title="展开 AI 助手"
          >
            <PanelRightOpen className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
