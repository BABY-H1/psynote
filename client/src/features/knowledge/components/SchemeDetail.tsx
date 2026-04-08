import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  useGroupScheme, useUpdateGroupScheme, useDeleteGroupScheme,
} from '../../../api/useGroups';
import { useAssessments } from '../../../api/useAssessments';
import {
  useRefineSchemeOverall, useRefineSessionDetail, useGenerateSessionDetail,
} from '../../../api/useAI';
import { PageLoading, useToast } from '../../../shared/components';
import type { SessionPhase, KeyResult } from '@psynote/shared';
import {
  ArrowLeft, Edit3, Trash2, Save, X, Plus,
  Sparkles, Send, Loader2, Check, ChevronDown, ChevronRight, Clock,
} from 'lucide-react';

const visibilityLabels: Record<string, string> = {
  personal: '仅自己', organization: '本机构', public: '公开',
};

interface EditSession {
  id?: string;
  title: string;
  goal: string;
  phases: SessionPhase[];
  materials: string;
  duration: string;
  homework: string;
  assessmentNotes: string;
  relatedGoals: number[];
  sessionTheory: string;
  sessionEvaluation: string;
  relatedAssessments: string[];
}

interface EditData {
  title: string;
  description: string;
  theory: string;
  overallGoal: string;
  specificGoals: KeyResult[];
  targetAudience: string;
  ageRange: string;
  selectionCriteria: string;
  recommendedSize: string;
  totalSessions: number | undefined;
  sessionDuration: string;
  frequency: string;
  facilitatorRequirements: string;
  evaluationMethod: string;
  notes: string;
  recruitmentAssessments: string[];
  overallAssessments: string[];
  screeningNotes: string;
  visibility: string;
  sessions: EditSession[];
}

interface Props {
  schemeId: string;
  onBack: () => void;
  initialEditing?: boolean;
}

function stripSessionPrefix(title: string): string {
  return title.replace(/^第[一二三四五六七八九十\d]+次[：:]\s*/, '');
}

function normalizeGoals(goals: any[]): KeyResult[] {
  if (!goals || goals.length === 0) return [];
  return goals.map((g: any) => typeof g === 'string' ? { title: g } : g);
}

function schemeToEditData(scheme: any): EditData {
  return {
    title: scheme.title || '', description: scheme.description || '', theory: scheme.theory || '',
    overallGoal: scheme.overallGoal || '', specificGoals: normalizeGoals(scheme.specificGoals),
    targetAudience: scheme.targetAudience || '', ageRange: scheme.ageRange || '',
    selectionCriteria: scheme.selectionCriteria || '', recommendedSize: scheme.recommendedSize || '',
    totalSessions: scheme.totalSessions || undefined, sessionDuration: scheme.sessionDuration || '',
    frequency: scheme.frequency || '', facilitatorRequirements: scheme.facilitatorRequirements || '',
    evaluationMethod: scheme.evaluationMethod || '', notes: scheme.notes || '',
    recruitmentAssessments: scheme.recruitmentAssessments || [],
    overallAssessments: scheme.overallAssessments || [],
    screeningNotes: scheme.screeningNotes || '',
    visibility: scheme.visibility || 'personal',
    sessions: (scheme.sessions || []).map((s: any) => ({
      id: s.id, title: s.title || '', goal: s.goal || '', phases: s.phases || [],
      materials: s.materials || '', duration: s.duration || '',
      homework: s.homework || '', assessmentNotes: s.assessmentNotes || '',
      relatedGoals: s.relatedGoals || [], sessionTheory: s.sessionTheory || '',
      sessionEvaluation: s.sessionEvaluation || '',
      relatedAssessments: s.relatedAssessments || [],
    })),
  };
}

export function SchemeDetail({ schemeId, onBack, initialEditing = false }: Props) {
  const { data: scheme, isLoading } = useGroupScheme(schemeId);
  const updateScheme = useUpdateGroupScheme();
  const deleteScheme = useDeleteGroupScheme();
  const { toast } = useToast();

  const [editing, setEditing] = useState(initialEditing);
  const [editData, setEditData] = useState<EditData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | number>('overview');

  const handleEdit = useCallback(() => {
    if (!scheme) return;
    setEditData(schemeToEditData(scheme));
    setEditing(true);
  }, [scheme]);

  // Auto-enter edit mode if requested via prop
  useEffect(() => {
    if (initialEditing && scheme && !editData) {
      setEditData(schemeToEditData(scheme));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditing, scheme]);

  const handleCancel = () => { setEditing(false); setEditData(null); };

  const handleSave = async () => {
    if (!editData) {
      toast('没有可保存的修改', 'error');
      return;
    }
    try {
      const { sessions, ...rest } = editData;
      await updateScheme.mutateAsync({
        schemeId, ...rest,
        sessions: sessions.map((s, i) => ({ ...s, sortOrder: i })),
      });
      toast('方案已更新', 'success');
      setEditing(false);
      setEditData(null);
    } catch (err) {
      console.error('保存团辅方案失败:', err);
      toast('保存失败', 'error');
    }
  };

  const handleDelete = async () => {
    if (!scheme || !confirm(`确定删除"${scheme.title}"？`)) return;
    try { await deleteScheme.mutateAsync(schemeId); toast('已删除', 'success'); onBack(); }
    catch { toast('删除失败', 'error'); }
  };

  // Edit helpers
  const uf = (field: keyof EditData, value: any) => setEditData((p) => p ? { ...p, [field]: value } : p);
  const us = (i: number, field: keyof EditSession, value: any) => {
    setEditData((p) => {
      if (!p) return p;
      const sessions = [...p.sessions];
      sessions[i] = { ...sessions[i], [field]: value };
      return { ...p, sessions };
    });
  };
  const addSession = () => {
    setEditData((p) => p ? { ...p, sessions: [...p.sessions, { title: '', goal: '', phases: [], materials: '', duration: '', homework: '', assessmentNotes: '', relatedGoals: [], sessionTheory: '', sessionEvaluation: '', relatedAssessments: [] }] } : p);
  };
  const removeSession = (i: number) => {
    setEditData((p) => p ? { ...p, sessions: p.sessions.filter((_, j) => j !== i) } : p);
  };
  const addPhase = (si: number) => {
    setEditData((p) => {
      if (!p) return p;
      const sessions = [...p.sessions];
      sessions[si] = { ...sessions[si], phases: [...sessions[si].phases, { name: '', duration: '', description: '' }] };
      return { ...p, sessions };
    });
  };
  const updatePhase = (si: number, pi: number, field: keyof SessionPhase, value: string) => {
    setEditData((p) => {
      if (!p) return p;
      const sessions = [...p.sessions];
      const phases = [...sessions[si].phases];
      phases[pi] = { ...phases[pi], [field]: value };
      sessions[si] = { ...sessions[si], phases };
      return { ...p, sessions };
    });
  };
  const removePhase = (si: number, pi: number) => {
    setEditData((p) => {
      if (!p) return p;
      const sessions = [...p.sessions];
      sessions[si] = { ...sessions[si], phases: sessions[si].phases.filter((_, j) => j !== pi) };
      return { ...p, sessions };
    });
  };

  // AI direct apply — merge AI response into editData (only callable in editing mode)
  const applySchemeChange = useCallback((newData: EditData) => {
    setEditData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        // Only overwrite fields that AI actually returns
        title: newData.title || prev.title,
        description: newData.description || prev.description,
        theory: newData.theory || prev.theory,
        overallGoal: newData.overallGoal || prev.overallGoal,
        specificGoals: newData.specificGoals.length > 0 ? newData.specificGoals : prev.specificGoals,
        targetAudience: newData.targetAudience || prev.targetAudience,
        ageRange: newData.ageRange || prev.ageRange,
        selectionCriteria: newData.selectionCriteria || prev.selectionCriteria,
        recommendedSize: newData.recommendedSize || prev.recommendedSize,
        totalSessions: newData.totalSessions ?? prev.totalSessions,
        sessionDuration: newData.sessionDuration || prev.sessionDuration,
        frequency: newData.frequency || prev.frequency,
        facilitatorRequirements: newData.facilitatorRequirements || prev.facilitatorRequirements,
        evaluationMethod: newData.evaluationMethod || prev.evaluationMethod,
        notes: newData.notes || prev.notes,
        sessions: newData.sessions.length > 0 ? newData.sessions : prev.sessions,
      };
    });
    toast('AI 已更新方案', 'success');
  }, [toast]);

  const applySessionChange = useCallback((index: number, sessionData: Partial<EditSession>) => {
    setEditData((p) => {
      if (!p) return p;
      const sessions = [...p.sessions];
      if (sessions[index]) sessions[index] = { ...sessions[index], ...sessionData };
      return { ...p, sessions };
    });
    toast('AI 已更新该活动', 'success');
  }, [toast]);

  if (isLoading || !scheme) return <PageLoading text="加载方案详情..." />;

  const data = editing && editData ? editData : schemeToEditData(scheme);
  const activeSessionIndex = activeTab === 'overview' ? null : activeTab;

  return (
    <div className="flex flex-row-reverse -m-6" style={{ height: 'calc(100vh - 5rem)' }}>
      {/* RIGHT: AI Chat panel (rendered first, appears on the right via flex-row-reverse) */}
      <div className="w-[420px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-slate-900 truncate">{data.title}</h3>
        </div>

        {/* AI chat */}
        <AIChatPanel scheme={scheme} editData={editing ? editData : null}
          editing={editing}
          activeTab={activeTab}
          onApplyScheme={applySchemeChange}
          onApplySession={applySessionChange} />
      </div>

      {/* LEFT: Tabbed content (rendered second, appears on the left via flex-row-reverse) */}
      <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
        {/* Top bar with tabs + actions */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
          {/* Tab bar */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'overview'
                  ? 'bg-violet-100 text-violet-700'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              总
            </button>
            {data.sessions.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveTab(i)}
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
              <button onClick={addSession} className="w-7 h-7 rounded-full bg-slate-50 text-slate-400 hover:bg-violet-100 hover:text-violet-600 flex items-center justify-center transition">
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button onClick={handleCancel} className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50">取消</button>
                <button onClick={handleSave} disabled={updateScheme.isPending || !editData}
                  className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5">
                  {updateScheme.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中...</> : <><Save className="w-3.5 h-3.5" /> 保存</>}
                </button>
              </>
            ) : (
              <>
                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                  {visibilityLabels[data.visibility] || data.visibility}
                </span>
                <button onClick={handleEdit} className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5"><Edit3 className="w-3.5 h-3.5" /> 编辑</button>
                <button onClick={handleDelete} className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> 删除</button>
              </>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'overview' ? (
            <div className="max-w-3xl mx-auto p-6">
              <LeftPanel data={data} editing={editing} editData={editData} uf={uf} />
            </div>
          ) : activeSessionIndex !== null && activeSessionIndex < data.sessions.length ? (
            <SessionDetailView
              session={data.sessions[activeSessionIndex]}
              index={activeSessionIndex}
              editing={editing}
              specificGoals={data.specificGoals}
              onUpdate={(f, v) => us(activeSessionIndex, f, v)}
              onRemove={() => { removeSession(activeSessionIndex); setActiveTab('overview'); }}
              onAddPhase={() => addPhase(activeSessionIndex)}
              onUpdatePhase={(pi, f, v) => updatePhase(activeSessionIndex, pi, f, v)}
              onRemovePhase={(pi) => removePhase(activeSessionIndex, pi)}
            />
          ) : (
            <div className="max-w-3xl mx-auto p-6">
              <LeftPanel data={data} editing={editing} editData={editData} uf={uf} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Session Detail View ────────────────────────────────────

function SessionDetailView({ session, index, editing, specificGoals, onUpdate, onRemove, onAddPhase, onUpdatePhase, onRemovePhase }: {
  session: EditSession; index: number; editing: boolean;
  specificGoals: KeyResult[];
  onUpdate: (field: keyof EditSession, value: any) => void;
  onRemove: () => void;
  onAddPhase: () => void;
  onUpdatePhase: (pi: number, field: keyof SessionPhase, value: string) => void;
  onRemovePhase: (pi: number) => void;
}) {
  const displayTitle = stripSessionPrefix(session.title) || `活动 ${index + 1}`;

  const toggleGoal = (goalIdx: number) => {
    const current = session.relatedGoals || [];
    const next = current.includes(goalIdx) ? current.filter((g) => g !== goalIdx) : [...current, goalIdx];
    onUpdate('relatedGoals', next);
  };

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 text-sm font-bold flex items-center justify-center">{index + 1}</span>
          {editing ? (
            <input value={session.title} onChange={(e) => onUpdate('title', e.target.value)} placeholder="单元标题"
              className="text-lg font-semibold text-slate-900 border-b-2 border-violet-300 focus:border-violet-500 focus:outline-none bg-transparent px-1" />
          ) : (
            <h3 className="text-lg font-semibold text-slate-900">{displayTitle}</h3>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editing && (
            <>
              <input value={session.duration} onChange={(e) => onUpdate('duration', e.target.value)} placeholder="时长"
                className="w-24 text-xs text-slate-500 border border-slate-200 rounded-lg px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-brand-500" />
              <button onClick={onRemove} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
            </>
          )}
          {!editing && session.duration && <span className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {session.duration}</span>}
        </div>
      </div>

      {/* Fixed template — all fields always visible */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {/* 1. 本次目标 */}
        <div className="p-4">
          <TemplateField label="本次目标" value={session.goal} editing={editing}
            onChange={(v) => onUpdate('goal', v)} placeholder="本次活动要达成的具体目标" />
        </div>

        {/* 2. 对应 Key Results */}
        {specificGoals.length > 0 && (
          <div className="p-4">
            <label className="text-xs text-slate-500 font-semibold block mb-2">对应 Key Results</label>
            {editing ? (
              <div className="space-y-1.5">
                {specificGoals.map((kr, gi) => (
                  <label key={gi} className="flex items-start gap-2 cursor-pointer group">
                    <input type="checkbox" checked={(session.relatedGoals || []).includes(gi)}
                      onChange={() => toggleGoal(gi)}
                      className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
                    <div>
                      <span className="text-xs text-slate-700 group-hover:text-slate-900 font-medium">KR{gi + 1}: {kr.title}</span>
                      {kr.metric && <span className="text-xs text-slate-400 block">衡量: {kr.metric}</span>}
                    </div>
                  </label>
                ))}
              </div>
            ) : (session.relatedGoals || []).length > 0 ? (
              <div className="space-y-1">
                {(session.relatedGoals || []).map((gi) => (
                  specificGoals[gi] ? (
                    <div key={gi} className="text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3 h-3 text-green-500" />
                        <span className="font-medium">KR{gi + 1}: {specificGoals[gi].title}</span>
                      </div>
                    </div>
                  ) : null
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-300 italic">未关联 KR</p>
            )}
          </div>
        )}

        {/* 3. 理论/技术 */}
        <div className="p-4">
          <TemplateField label="理论/技术" value={session.sessionTheory} editing={editing}
            onChange={(v) => onUpdate('sessionTheory', v)} placeholder="本次活动运用的理论或技术（如：认知重构、正念觉察）" />
        </div>

        {/* 4. 活动环节 */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs text-slate-500 font-semibold">活动环节</label>
            {editing && <button onClick={onAddPhase} className="text-xs text-violet-600 hover:text-violet-800 flex items-center gap-0.5"><Plus className="w-3 h-3" /> 添加环节</button>}
          </div>
          {(!session.phases || session.phases.length === 0) ? (
            editing ? null : <p className="text-xs text-slate-300 italic">暂无环节</p>
          ) : (
            <div className="space-y-2">
              {(session.phases || []).map((phase, pi) => (
                <PhaseItem key={pi} phase={phase} index={pi} editing={editing}
                  onUpdate={(f, v) => onUpdatePhase(pi, f, v)} onRemove={() => onRemovePhase(pi)} />
              ))}
            </div>
          )}
        </div>

        {/* 5. 所需材料 */}
        <div className="p-4">
          <TemplateField label="所需材料" value={session.materials} editing={editing}
            onChange={(v) => onUpdate('materials', v)} placeholder="需要准备的材料和工具" />
        </div>

        {/* 6. 课后任务 */}
        <div className="p-4">
          <TemplateField label="课后任务" value={session.homework} editing={editing}
            onChange={(v) => onUpdate('homework', v)} placeholder={'课后练习或任务（无则填"无"）'} type="textarea" />
        </div>

        {/* 7. 本次评估 */}
        <div className="p-4">
          <TemplateField label="本次评估" value={session.sessionEvaluation} editing={editing}
            onChange={(v) => onUpdate('sessionEvaluation', v)} placeholder={'评估方式（如：行为观察、量表测量，无则填"无"）'} />
        </div>

        {/* 8. 评估要点 */}
        <div className="p-4">
          <TemplateField label="观察指标" value={session.assessmentNotes} editing={editing}
            onChange={(v) => onUpdate('assessmentNotes', v)} placeholder="带领者需要观察的行为指标和要点" />
        </div>
      </div>
    </div>
  );
}

// ─── AI Session Preview (pending approval) ──────────────────

// (SessionPreview and SchemePreview removed — AI now applies changes directly)

// ─── Phase Item ─────────────────────────────────────────────

function PhaseItem({ phase, index, editing, onUpdate, onRemove }: {
  phase: SessionPhase; index: number; editing: boolean;
  onUpdate: (field: keyof SessionPhase, value: string) => void;
  onRemove: () => void;
}) {
  const [showNotes, setShowNotes] = useState(false);

  if (editing) {
    return (
      <div className="border border-slate-200 rounded-lg p-2.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <input value={phase.name || ''} onChange={(e) => onUpdate('name', e.target.value)} placeholder="环节名称"
            className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-500" />
          <input value={phase.duration || ''} onChange={(e) => onUpdate('duration', e.target.value)} placeholder="时长"
            className="w-20 px-2 py-1 border border-slate-200 rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand-500" />
          <button onClick={onRemove} className="text-slate-300 hover:text-red-500"><X className="w-3 h-3" /></button>
        </div>
        <textarea value={phase.description || ''} onChange={(e) => onUpdate('description', e.target.value)} placeholder="活动说明..."
          rows={2} className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
        <textarea value={phase.facilitatorNotes || ''} onChange={(e) => onUpdate('facilitatorNotes', e.target.value)} placeholder="带领者注意事项（可选）"
          rows={1} className="w-full px-2 py-1 border border-slate-100 rounded text-xs text-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
      </div>
    );
  }

  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-violet-600">{phase.name || `环节 ${index + 1}`}</span>
        {phase.duration && <span className="text-xs text-slate-400">{phase.duration}</span>}
        {phase.facilitatorNotes && (
          <button onClick={() => setShowNotes(!showNotes)} className="ml-auto text-xs text-slate-400 hover:text-slate-600 flex items-center gap-0.5">
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

// ─── Left Panel (scheme info) ───────────────────────────────

function LeftPanel({ data, editing, editData, uf }: {
  data: EditData; editing: boolean; editData: EditData | null;
  uf: (field: keyof EditData, value: any) => void;
}) {
  return (
    <div className="p-4 space-y-3">
      <InfoField label="方案描述" value={data.description} editing={editing} onChange={(v) => uf('description', v)} type="textarea" />
      <InfoField label="理论依据" value={data.theory} editing={editing} onChange={(v) => uf('theory', v)} type="textarea" />

      <div className="border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold text-slate-500 mb-2">目标 (OKR)</p>
        <InfoField label="Objective（总目标）" value={data.overallGoal} editing={editing} onChange={(v) => uf('overallGoal', v)} type="textarea" />
        {editing ? (
          <div className="mt-2">
            <label className="text-xs text-slate-400 block mb-1">Key Results</label>
            {(editData?.specificGoals || []).map((kr, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-2 mb-1.5 space-y-1">
                <div className="flex gap-1">
                  <input value={kr.title} onChange={(e) => {
                    const goals = [...(editData?.specificGoals || [])];
                    goals[i] = { ...goals[i], title: e.target.value };
                    uf('specificGoals', goals);
                  }} placeholder={`KR${i + 1}: 关键结果`}
                    className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  <button onClick={() => uf('specificGoals', (editData?.specificGoals || []).filter((_: any, j: number) => j !== i))} className="text-slate-300 hover:text-red-500"><X className="w-3 h-3" /></button>
                </div>
                <input value={kr.metric || ''} onChange={(e) => {
                  const goals = [...(editData?.specificGoals || [])];
                  goals[i] = { ...goals[i], metric: e.target.value };
                  uf('specificGoals', goals);
                }} placeholder="衡量方式（如：前后测对比、行为观察）"
                  className="w-full px-2 py-1 border border-slate-100 rounded text-xs text-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </div>
            ))}
            <button onClick={() => uf('specificGoals', [...(editData?.specificGoals || []), { title: '', metric: '' }])} className="text-xs text-violet-600 hover:text-violet-800">+ 添加关键结果</button>
          </div>
        ) : data.specificGoals && data.specificGoals.length > 0 ? (
          <div className="mt-2">
            <label className="text-xs text-slate-400 block mb-1">Key Results</label>
            <ul className="space-y-0.5">
              {data.specificGoals.map((kr, i) => (
                    <li key={i} className="text-xs text-slate-600">
                      <div className="flex gap-1.5"><span className="text-violet-500 font-semibold">KR{i + 1}</span>{kr.title}</div>
                      {kr.metric && <div className="text-slate-400 ml-6 mt-0.5">衡量: {kr.metric}</div>}
                    </li>
                  ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold text-slate-500 mb-2">适用对象</p>
        <InfoField label="目标人群" value={data.targetAudience} editing={editing} onChange={(v) => uf('targetAudience', v)} />
        <InfoField label="适用年龄" value={data.ageRange} editing={editing} onChange={(v) => uf('ageRange', v)} />
        <InfoField label="筛选/排除标准" value={data.selectionCriteria} editing={editing} onChange={(v) => uf('selectionCriteria', v)} type="textarea" />
      </div>

      <div className="border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold text-slate-500 mb-2">团体设置</p>
        <div className="grid grid-cols-2 gap-2">
          <InfoField label="建议人数" value={data.recommendedSize} editing={editing} onChange={(v) => uf('recommendedSize', v)} />
          <InfoField label="总次数" value={data.totalSessions?.toString() || ''} editing={editing} onChange={(v) => uf('totalSessions', v ? parseInt(v) : undefined)} />
          <InfoField label="每次时长" value={data.sessionDuration} editing={editing} onChange={(v) => uf('sessionDuration', v)} />
          <InfoField label="频率" value={data.frequency} editing={editing} onChange={(v) => uf('frequency', v)} />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <InfoField label="带领者要求" value={data.facilitatorRequirements} editing={editing} onChange={(v) => uf('facilitatorRequirements', v)} type="textarea" />
        <InfoField label="评估建议" value={data.evaluationMethod} editing={editing} onChange={(v) => uf('evaluationMethod', v)} type="textarea" />
        <InfoField label="注意事项" value={data.notes} editing={editing} onChange={(v) => uf('notes', v)} type="textarea" />
      </div>

      <div className="border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold text-slate-500 mb-2">推荐量表</p>
        <AssessmentListField label="招募量表" description="报名时来访者需填写" ids={data.recruitmentAssessments || []} editing={editing} onChange={(v) => uf('recruitmentAssessments', v)} />
        <AssessmentListField label="整体评估量表" description="用于纵向追踪（入组+结束）" ids={data.overallAssessments || []} editing={editing} onChange={(v) => uf('overallAssessments', v)} />
        <InfoField label="筛选标准说明" value={data.screeningNotes || ''} editing={editing} onChange={(v) => uf('screeningNotes', v)} type="textarea" />
      </div>

      {editing && (
        <div className="border-t border-slate-100 pt-3">
          <label className="text-xs text-slate-400 block mb-1">可见范围</label>
          <select value={editData?.visibility || 'personal'} onChange={(e) => uf('visibility', e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-500">
            {Object.entries(visibilityLabels).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
          </select>
        </div>
      )}
    </div>
  );
}

// ─── AI Chat Panel ──────────────────────────────────────────

type AIChatMsg = {
  role: 'user' | 'assistant';
  content: string;
  applied?: boolean;
};

function AIChatPanel({ scheme, editData, editing, activeTab, onApplyScheme, onApplySession }: {
  scheme: any; editData: EditData | null;
  editing: boolean;
  activeTab: 'overview' | number;
  onApplyScheme: (data: EditData) => void;
  onApplySession: (index: number, session: Partial<EditSession>) => void;
}) {
  const selectedSessionIndex = activeTab === 'overview' ? null : activeTab;
  const refineScheme = useRefineSchemeOverall();
  const refineSession = useRefineSessionDetail();
  const generateDetail = useGenerateSessionDetail();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<AIChatMsg[]>([
    { role: 'assistant', content: '我可以帮你修改和完善方案。\n\n选中某个活动时，修改针对该活动；\n未选中时，修改针对整体方案。' },
  ]);
  const [input, setInput] = useState('');

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const isPending = refineScheme.isPending || refineSession.isPending || generateDetail.isPending;
  const currentScheme = editData || schemeToEditData(scheme);

  // Context hint shown above input
  const contextHint = activeTab !== 'overview' && activeTab < currentScheme.sessions.length
    ? `当前: 第${activeTab + 1}次 — ${stripSessionPrefix(currentScheme.sessions[activeTab]?.title || '')}`
    : '当前: 总体方案';

  const handleSend = () => {
    if (!editing) return;
    const text = input.trim();
    if (!text || isPending) return;
    setInput('');
    setMessages((p) => [...p, { role: 'user', content: text }]);

    if (selectedSessionIndex !== null && selectedSessionIndex < currentScheme.sessions.length) {
      // Modify the selected session
      const si = selectedSessionIndex;
      const currentSession = currentScheme.sessions[si];

      refineSession.mutate({
        currentSession: currentSession as any,
        overallScheme: currentScheme as any,
        sessionIndex: si,
        instruction: text,
      }, {
        onSuccess: (r: any) => {
          onApplySession(si, r);
          setMessages((p) => [...p, { role: 'assistant', content: `已更新第${si + 1}次活动，右侧已刷新。` }]);
        },
        onError: () => setMessages((p) => [...p, { role: 'assistant', content: '修改失败，请重试。' }]),
      });
    } else {
      // Modify the overall scheme
      refineScheme.mutate({ currentScheme: currentScheme as any, instruction: text }, {
        onSuccess: (r: any) => {
          const newData: EditData = { ...schemeToEditData(r), visibility: editData?.visibility || 'personal' };
          onApplyScheme(newData);
          setMessages((p) => [...p, { role: 'assistant', content: `已更新方案（${newData.sessions.length}次活动），右侧已刷新。` }]);
        },
        onError: () => setMessages((p) => [...p, { role: 'assistant', content: '修改失败，请重试。' }]),
      });
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-white">
        <Sparkles className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold text-slate-900">AI 助手</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 relative">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[92%] rounded-2xl px-3.5 py-2 text-xs ${
              msg.role === 'user' ? 'bg-brand-600 text-white rounded-br-md' : 'bg-white text-slate-700 rounded-bl-md border border-slate-200'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {isPending && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-bl-md px-3.5 py-2 text-xs text-slate-500 flex items-center gap-1.5 border border-slate-200">
              <Loader2 className="w-3 h-3 animate-spin" /> AI 思考中...
            </div>
          </div>
        )}

        {/* Disabled overlay when not editing */}
        {!editing && (
          <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
            <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 max-w-[85%] text-center shadow-sm">
              点击右上角「编辑」按钮，进入编辑态后即可与 AI 对话修改方案
            </div>
          </div>
        )}
      </div>
      <div className="p-3 border-t border-slate-200 bg-white">
        <p className="text-xs text-slate-400 mb-1.5">{contextHint}</p>
        <div className="flex gap-1.5">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder={editing ? '输入修改意见...' : '请先点击编辑'}
            disabled={!editing || isPending}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:cursor-not-allowed" />
          <button onClick={handleSend} disabled={!editing || isPending || !input.trim()}
            className="px-3 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed">
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Reusable Components ────────────────────────────────────

function InfoField({ label, value, editing, onChange, type = 'input' }: {
  label: string; value: string; editing: boolean; onChange: (v: string) => void; type?: 'input' | 'textarea';
}) {
  if (!editing && !value) return null;
  return (
    <div className="mb-2">
      <label className="text-xs text-slate-400 block mb-0.5">{label}</label>
      {editing ? (
        type === 'textarea' ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2}
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
        ) : (
          <input value={value} onChange={(e) => onChange(e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-500" />
        )
      ) : (
        <p className="text-xs text-slate-600 whitespace-pre-wrap">{value}</p>
      )}
    </div>
  );
}

function AssessmentListField({ label, description, ids, editing, onChange }: {
  label: string; description: string; ids: string[]; editing: boolean; onChange: (v: string[]) => void;
}) {
  const { data: assessments } = useAssessments();
  const activeAssessments = (assessments || []).filter((a: any) => a.status !== 'archived');
  const getTitle = (id: string) => activeAssessments.find((a: any) => a.id === id)?.title || id.slice(0, 8) + '...';

  if (!editing && ids.length === 0) return null;

  return (
    <div className="mb-2">
      <label className="text-xs text-slate-400 block mb-0.5">{label}</label>
      {editing ? (
        <div>
          <p className="text-xs text-slate-400 mb-1">{description}</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {activeAssessments.map((a: any) => (
              <label key={a.id} className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={ids.includes(a.id)}
                  onChange={(e) => {
                    if (e.target.checked) onChange([...ids, a.id]);
                    else onChange(ids.filter((id) => id !== a.id));
                  }}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-3 h-3" />
                {a.title}
              </label>
            ))}
          </div>
          {activeAssessments.length === 0 && <p className="text-xs text-slate-400 italic">暂无可用量表</p>}
        </div>
      ) : (
        <div className="space-y-0.5">
          {ids.map((id) => (
            <p key={id} className="text-xs text-slate-600">{getTitle(id)}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldRow({ label, value, editing, onChange, type = 'input', icon }: {
  label: string; value: string; editing: boolean; onChange: (v: string) => void; type?: 'input' | 'textarea'; icon?: React.ReactNode;
}) {
  if (!editing && !value) return null;
  return (
    <div>
      <label className="text-xs text-slate-400 font-medium flex items-center gap-1 mb-1">{icon}{label}</label>
      {editing ? (
        type === 'textarea' ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
        ) : (
          <input value={value} onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
        )
      ) : (
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{value}</p>
      )}
    </div>
  );
}

/** Template field — always visible, shows placeholder when empty */
function TemplateField({ label, value, editing, onChange, placeholder, type = 'input' }: {
  label: string; value: string; editing: boolean; onChange: (v: string) => void;
  placeholder: string; type?: 'input' | 'textarea';
}) {
  return (
    <div>
      <label className="text-xs text-slate-500 font-semibold block mb-1">{label}</label>
      {editing ? (
        type === 'textarea' ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} placeholder={placeholder}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
        ) : (
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
        )
      ) : value ? (
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-xs text-slate-300 italic">{placeholder}</p>
      )}
    </div>
  );
}
