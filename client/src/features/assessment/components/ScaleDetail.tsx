import { useCallback, useEffect, useState } from 'react';
import { Sparkles, PanelRightClose } from 'lucide-react';
import { useScale, useUpdateScale, useDeleteScale } from '../../../api/useScales';
import { PageLoading, useToast } from '../../../shared/components';
import { OverviewTab } from './scale-detail/OverviewTab';
import { DimensionsTab } from './scale-detail/DimensionsTab';
import { ItemsTab } from './scale-detail/ItemsTab';
import { OptionsTab } from './scale-detail/OptionsTab';
import { ScaleAIChatPanel } from './scale-detail/ScaleAIChatPanel';
import { ScaleDetailTopBar } from './scale-detail/ScaleDetailTopBar';
import { editStateToUpdatePayload, scaleToEditState } from './scale-detail/scaleEditState';
import { useScaleEditState } from './scale-detail/useScaleEditState';
import type { EditState, SubTab } from './scale-detail/types';

interface Props {
  scaleId: string;
  onBack: () => void;
  initialEditing?: boolean;
  onPreviewReport?: () => void;
}

/**
 * Scale editor — top-level orchestrator. Delegates:
 *   - per-tab rendering to the 4 *Tab components under ./scale-detail
 *   - all mutable edit state + 12 updaters to `useScaleEditState`
 *   - the AI chat sidebar to `ScaleAIChatPanel`
 *   - the action bar to `ScaleDetailTopBar`
 *
 * What's kept here: the read-vs-edit switch, save/delete handlers (they
 * touch the mutation hooks + toast directly), the sub-tab selection
 * state, and the derived `data` that every tab reads from.
 */
export function ScaleDetail({ scaleId, onBack, initialEditing = false, onPreviewReport }: Props) {
  const { data: scale, isLoading } = useScale(scaleId);
  const updateScale = useUpdateScale();
  const deleteScale = useDeleteScale();
  const { toast } = useToast();

  const state = useScaleEditState();
  const [editing, setEditing] = useState(initialEditing);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('overview');
  const [expandedDimGroups, setExpandedDimGroups] = useState<Set<number>>(new Set([0]));
  // AI 助手面板默认展开,可折叠 — 在窄屏 (<1280px viewport, 即 lg-xl 之间)
  // 给主区让出宽度. localStorage 记住用户偏好,跨页面持久化.
  const [aiPanelOpen, setAiPanelOpen] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem('scale.aiPanelOpen');
      if (saved === 'false') return false;
      if (saved === 'true') return true;
    } catch { /* SSR / disabled storage */ }
    // 默认根据视窗判断: 大屏开,小屏收
    return typeof window !== 'undefined' && window.innerWidth >= 1280;
  });
  const toggleAiPanel = () => {
    setAiPanelOpen((prev) => {
      const next = !prev;
      try { window.localStorage.setItem('scale.aiPanelOpen', String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  useEffect(() => {
    if (initialEditing && scale && !state.editData) {
      state.setEditData(scaleToEditState(scale));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditing, scale]);

  const handleEdit = useCallback(() => {
    if (!scale) return;
    state.setEditData(scaleToEditState(scale));
    setEditing(true);
  }, [scale, state]);

  const handleCancel = () => {
    setEditing(false);
    state.setEditData(null);
  };

  const handleSave = async () => {
    const editData = state.editData;
    if (!editData || !scale) {
      toast('没有可保存的修改', 'error');
      return;
    }
    try {
      await updateScale.mutateAsync(editStateToUpdatePayload(editData, scaleId));
      toast('量表已保存', 'success');
      setEditing(false);
      state.setEditData(null);
    } catch (err) {
      console.error('保存量表失败:', err);
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    }
  };

  const handleDelete = async () => {
    if (!scale) return;
    if (!confirm(`确定删除"${scale.title}"？此操作不可恢复。`)) return;
    try {
      await deleteScale.mutateAsync(scaleId);
      toast('量表已删除', 'success');
      onBack();
    } catch {
      toast('删除失败', 'error');
    }
  };

  const applyAIChange = useCallback(
    (newState: Partial<EditState>) => {
      state.setEditData((prev) => (prev ? { ...prev, ...newState } : prev));
      toast('AI 已更新量表', 'success');
    },
    [state, toast],
  );

  if (isLoading || !scale) return <PageLoading text="加载量表详情..." />;

  const data: EditState = editing && state.editData ? state.editData : scaleToEditState(scale);

  const toggleDimGroup = (idx: number) =>
    setExpandedDimGroups((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  return (
    <div className="flex -m-6 overflow-hidden" style={{ height: 'calc(100vh - 5rem)' }}>
      <div className="flex-1 flex flex-col bg-slate-50 min-w-0 overflow-hidden">
        <ScaleDetailTopBar
          activeSubTab={activeSubTab}
          onSubTabChange={setActiveSubTab}
          editing={editing}
          scoringMode={data.scoringMode}
          canDelete={!!scale.orgId}
          canPreviewReport={!!onPreviewReport}
          isSaving={updateScale.isPending}
          onBack={onBack}
          onEdit={handleEdit}
          onCancel={handleCancel}
          onSave={handleSave}
          onDelete={handleDelete}
          onPreviewReport={onPreviewReport}
          aiPanelOpen={aiPanelOpen}
          onToggleAiPanel={toggleAiPanel}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-6">
            {activeSubTab === 'overview' && (
              <OverviewTab
                editing={editing}
                title={data.title}
                description={data.description}
                instructions={data.instructions}
                scoringMode={data.scoringMode}
                isPublic={data.isPublic}
                onTitleChange={(v) => state.updateField('title', v)}
                onDescriptionChange={(v) => state.updateField('description', v)}
                onInstructionsChange={(v) => state.updateField('instructions', v)}
                onScoringModeChange={(v) => state.updateField('scoringMode', v)}
                onIsPublicChange={(v) => state.updateField('isPublic', v)}
              />
            )}
            {activeSubTab === 'dimensions' && (
              <DimensionsTab
                editing={editing}
                dimensions={data.dimensions}
                onUpdate={state.updateDimension}
                onAdd={state.addDimension}
                onRemove={state.removeDimension}
                onAddRule={state.addRule}
                onUpdateRule={state.updateRule}
                onRemoveRule={state.removeRule}
              />
            )}
            {activeSubTab === 'items' && (
              <ItemsTab
                editing={editing}
                items={data.items}
                dimensions={data.dimensions}
                expandedDimGroups={expandedDimGroups}
                onToggleGroup={toggleDimGroup}
                onUpdateItem={state.updateItem}
                onAddItem={state.addItem}
                onRemoveItem={state.removeItem}
              />
            )}
            {activeSubTab === 'options' && (
              <OptionsTab
                editing={editing}
                options={data.options}
                onUpdate={state.updateOption}
                onAdd={state.addOption}
                onRemove={state.removeOption}
              />
            )}
          </div>
        </div>
      </div>

      {aiPanelOpen && (
        <div className="w-[360px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
            <Sparkles className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <h3 className="font-bold text-slate-900 truncate flex-1">{data.title || '量表详情'}</h3>
            <button
              onClick={toggleAiPanel}
              className="text-slate-400 hover:text-slate-600 flex-shrink-0"
              title="收起 AI 助手"
            >
              <PanelRightClose className="w-5 h-5" />
            </button>
          </div>

          <ScaleAIChatPanel editing={editing} currentState={data} onApply={applyAIChange} />
        </div>
      )}
    </div>
  );
}
