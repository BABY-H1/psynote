import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useGroupScheme, useUpdateGroupScheme, useDeleteGroupScheme } from '../../../api/useGroups';
import { PageLoading, useToast } from '../../../shared/components';
import { OverviewPanel } from './scheme-detail/OverviewPanel';
import { SchemeAIChatPanel } from './scheme-detail/SchemeAIChatPanel';
import { SchemeDetailTopBar } from './scheme-detail/SchemeDetailTopBar';
import { SessionDetailView } from './scheme-detail/SessionDetailView';
import {
  editDataToSavePayload,
  mergeAiSchemeChange,
  schemeToEditData,
} from './scheme-detail/schemeEditState';
import type { EditData, EditSession } from './scheme-detail/types';
import { useSchemeEditState } from './scheme-detail/useSchemeEditState';

interface Props {
  schemeId: string;
  onBack: () => void;
  initialEditing?: boolean;
}

/**
 * Group-scheme editor — orchestrator. Delegates per-tab rendering,
 * mutable state + updaters, AI chat, tab+actions bar to files under
 * ./scheme-detail/. What stays here: read/edit switch, save/delete,
 * AI apply wrappers, and the derived `data` every sub-panel reads from.
 */
export function SchemeDetail({ schemeId, onBack, initialEditing = false }: Props) {
  const { data: scheme, isLoading } = useGroupScheme(schemeId);
  const updateScheme = useUpdateGroupScheme();
  const deleteScheme = useDeleteGroupScheme();
  const { toast } = useToast();

  const state = useSchemeEditState();
  const [editing, setEditing] = useState(initialEditing);
  const [activeTab, setActiveTab] = useState<'overview' | number>('overview');

  useEffect(() => {
    if (initialEditing && scheme && !state.editData) {
      state.setEditData(schemeToEditData(scheme));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditing, scheme]);

  const handleEdit = () => {
    if (!scheme) return;
    state.setEditData(schemeToEditData(scheme));
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    state.setEditData(null);
  };

  const handleSave = async () => {
    if (!state.editData) {
      toast('没有可保存的修改', 'error');
      return;
    }
    try {
      await updateScheme.mutateAsync(editDataToSavePayload(state.editData, schemeId) as any);
      toast('方案已更新', 'success');
      setEditing(false);
      state.setEditData(null);
    } catch (err) {
      console.error('保存团辅方案失败:', err);
      toast('保存失败', 'error');
    }
  };

  const handleDelete = async () => {
    if (!scheme || !confirm(`确定删除"${scheme.title}"？`)) return;
    try {
      await deleteScheme.mutateAsync(schemeId);
      toast('已删除', 'success');
      onBack();
    } catch {
      toast('删除失败', 'error');
    }
  };

  const applySchemeChange = useCallback(
    (newData: EditData) => {
      state.setEditData((prev) => (prev ? mergeAiSchemeChange(prev, newData) : prev));
      toast('AI 已更新方案', 'success');
    },
    [state, toast],
  );

  const applySessionChange = useCallback(
    (index: number, sessionData: Partial<EditSession>) => {
      state.patchSession(index, sessionData);
      toast('AI 已更新该活动', 'success');
    },
    [state, toast],
  );

  if (isLoading || !scheme) return <PageLoading text="加载方案详情..." />;

  const data = editing && state.editData ? state.editData : schemeToEditData(scheme);
  const activeSessionIndex = activeTab === 'overview' ? null : activeTab;

  return (
    <div className="flex flex-row-reverse h-full">
      <div className="w-[420px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-slate-900 truncate">{data.title}</h3>
        </div>
        <SchemeAIChatPanel
          scheme={scheme}
          editData={editing ? state.editData : null}
          editing={editing}
          activeTab={activeTab}
          onApplyScheme={applySchemeChange}
          onApplySession={applySessionChange}
        />
      </div>

      <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
        <SchemeDetailTopBar
          activeTab={activeTab}
          sessionCount={data.sessions.length}
          onTabChange={setActiveTab}
          onAddSession={state.addSession}
          editing={editing}
          visibility={data.visibility}
          isSaving={updateScheme.isPending}
          onEdit={handleEdit}
          onCancel={handleCancel}
          onSave={handleSave}
          onDelete={handleDelete}
        />

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'overview' ? (
            <div className="max-w-3xl mx-auto p-6">
              <OverviewPanel data={data} editing={editing} editData={state.editData} uf={state.uf} />
            </div>
          ) : activeSessionIndex !== null && activeSessionIndex < data.sessions.length ? (
            <SessionDetailView
              session={data.sessions[activeSessionIndex]}
              index={activeSessionIndex}
              editing={editing}
              specificGoals={data.specificGoals}
              onUpdate={(f, v) => state.us(activeSessionIndex, f, v)}
              onRemove={() => {
                state.removeSession(activeSessionIndex);
                setActiveTab('overview');
              }}
              onAddPhase={() => state.addPhase(activeSessionIndex)}
              onUpdatePhase={(pi, f, v) => state.updatePhase(activeSessionIndex, pi, f, v)}
              onRemovePhase={(pi) => state.removePhase(activeSessionIndex, pi)}
            />
          ) : (
            <div className="max-w-3xl mx-auto p-6">
              <OverviewPanel data={data} editing={editing} editData={state.editData} uf={state.uf} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
