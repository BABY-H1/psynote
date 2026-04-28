import React, { useState } from 'react';
import type { WorkMode } from './ChatWorkspace';
import type { TreatmentPlan, TreatmentGoal, SessionNote, CrisisCase, NoteTemplate } from '@psynote/shared';
import { useCreateSessionNote, useNoteTemplates, useUpdateAiConversation, useDeleteAiConversation } from '../../../api/useCounseling';
import { useCreateTreatmentPlan, useUpdateGoalStatus } from '../../../api/useTreatmentPlan';
import { useToast } from '../../../shared/components';
import { Save, FileText, Target, User, GraduationCap, BarChart3, X, MessageSquare, Trash2, Edit3 } from 'lucide-react';
import { BUILT_IN_FORMATS } from './NoteFormatSelector';
import { NoteViewer } from './NoteViewer';
import { CrisisChecklistPanel } from './CrisisChecklistPanel';

interface Props {
  mode: WorkMode;
  episodeId: string;
  clientId: string;
  episode: any;
  // Note output
  noteFields: Record<string, string>;
  noteFormat: string;
  onNoteFieldChange: (key: string, value: string) => void;
  onNoteFormatChange?: (format: string) => void;
  // Plan output
  planSuggestion: any;
  activePlan?: TreatmentPlan;
  plans: TreatmentPlan[];
  // Context info
  goalProgress?: { total: number; achieved: number };
  lastNoteSummary?: string;
  lastNoteDate?: string;
  presentingIssues?: string[];
  // Note viewing (from left panel selection)
  viewingNote?: SessionNote | null;
  onCloseNote?: () => void;
  // Assessment result viewing
  viewingResult?: any;
  onCloseResult?: () => void;
  // AI conversation viewing
  viewingConversation?: any;
  onCloseConversation?: () => void;
  // Phase 13: crisis case (only passed when episode is a crisis episode)
  crisisCase?: CrisisCase | null;
  clientName?: string;
}

export function OutputPanel({
  mode, episodeId, clientId, episode,
  noteFields, noteFormat, onNoteFieldChange, onNoteFormatChange,
  planSuggestion, activePlan, plans,
  goalProgress, lastNoteSummary, lastNoteDate, presentingIssues,
  viewingNote, onCloseNote,
  viewingResult, onCloseResult,
  viewingConversation, onCloseConversation,
  crisisCase, clientName,
}: Props) {
  const createNote = useCreateSessionNote();
  const updateGoalStatus = useUpdateGoalStatus();
  const { data: noteTemplates } = useNoteTemplates();
  const { toast } = useToast();
  const [editingNote, setEditingNote] = useState(false);

  // When a note is selected from left panel, show it here instead of mode content
  if (viewingNote) {
    return (
      <div className="flex flex-col h-full">
        <NoteViewer
          note={viewingNote}
          editing={editingNote}
          onEdit={() => setEditingNote(true)}
          onClose={() => { setEditingNote(false); onCloseNote?.(); }}
        />
      </div>
    );
  }

  // When an assessment result is selected from left panel
  if (viewingResult) {
    return (
      <div className="flex flex-col h-full">
        <ResultDetailPanel result={viewingResult} onClose={() => onCloseResult?.()} />
      </div>
    );
  }

  // When an AI conversation is selected from left panel
  if (viewingConversation) {
    return (
      <div className="flex flex-col h-full">
        <ConversationViewer conversation={viewingConversation} onClose={() => onCloseConversation?.()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Mode-specific output — NO shared header */}
      <div className="flex-1 overflow-y-auto">
        {mode === 'note' && (
          <NoteOutput
            fields={noteFields}
            format={noteFormat}
            templates={noteTemplates || []}
            onFormatChange={onNoteFormatChange}
            onChange={onNoteFieldChange}
            onSave={async () => {
              try {
                const fmt = noteFormat;
                const data: any = {
                  careEpisodeId: episodeId,
                  clientId,
                  sessionDate: new Date().toISOString().split('T')[0],
                  noteFormat: fmt,
                };
                if (fmt === 'soap') {
                  data.subjective = noteFields.subjective;
                  data.objective = noteFields.objective;
                  data.assessment = noteFields.assessment;
                  data.plan = noteFields.plan;
                } else {
                  data.fields = noteFields;
                }
                await createNote.mutateAsync(data);
                toast('笔记已保存', 'success');
              } catch {
                toast('保存失败', 'error');
              }
            }}
            isSaving={createNote.isPending}
          />
        )}
        {mode === 'plan' && (
          <PlanOutput
            suggestion={planSuggestion}
            activePlan={activePlan}
            plans={plans}
            episodeId={episodeId}
            onGoalStatusChange={(planId, goalId, status) =>
              updateGoalStatus.mutate({ planId, goalId, status })
            }
          />
        )}
        {mode === 'simulate' && (
          <SimulateContext
            episode={episode}
            lastNoteSummary={lastNoteSummary}
            lastNoteDate={lastNoteDate}
            presentingIssues={presentingIssues}
          />
        )}
        {mode === 'supervise' && (
          <SuperviseContext
            episode={episode}
            activePlan={activePlan}
            lastNoteSummary={lastNoteSummary}
            lastNoteDate={lastNoteDate}
          />
        )}
        {mode === 'crisis' && crisisCase && (
          <CrisisChecklistPanel
            crisisCase={crisisCase}
            episodeId={episodeId}
            clientId={clientId}
            clientName={clientName}
          />
        )}
        {mode === 'crisis' && !crisisCase && (
          <div className="p-6 text-center text-sm text-slate-400">
            没有找到危机案件记录。如果你是从危机候选池跳转进来,请刷新页面。
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Note Output ────────────────────────────────────────────────

function NoteOutput({
  fields, format, templates, onFormatChange, onChange, onSave, isSaving,
}: {
  fields: Record<string, string>; format: string;
  templates?: NoteTemplate[];
  onFormatChange?: (format: string) => void;
  onChange: (key: string, value: string) => void;
  onSave: () => void; isSaving: boolean;
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const customTemplates = (templates || []).filter((t) => !t.id.startsWith('__'));
  const selectedCustom = customTemplates.find((t) => t.id === selectedTemplateId);

  const fmt = selectedCustom
    ? { title: selectedCustom.title, format: selectedCustom.format, fieldDefinitions: selectedCustom.fieldDefinitions }
    : BUILT_IN_FORMATS.find((f: any) => f.format === format) || BUILT_IN_FORMATS[0];
  const hasContent = Object.values(fields).some((v) => v?.trim());

  const handleFormatSelect = (val: string) => {
    const builtIn = BUILT_IN_FORMATS.find((f) => f.format === val);
    if (builtIn) {
      setSelectedTemplateId(null);
      onFormatChange?.(val);
    } else {
      const custom = customTemplates.find((t) => t.id === val);
      if (custom) {
        setSelectedTemplateId(val);
        onFormatChange?.(custom.format);
      }
    }
  };

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <select
          value={selectedTemplateId || format}
          onChange={(e) => handleFormatSelect(e.target.value)}
          className="px-2 py-1 border border-slate-200 rounded text-xs text-slate-600"
        >
          {BUILT_IN_FORMATS.map((f) => (
            <option key={f.id} value={f.format}>{f.title}</option>
          ))}
          {customTemplates.length > 0 && <option disabled>──────</option>}
          {customTemplates.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
        {hasContent && (
          <button onClick={onSave} disabled={isSaving}
            className="flex items-center gap-1 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs hover:bg-brand-500 disabled:opacity-50">
            <Save className="w-3 h-3" />
            {isSaving ? '保存中...' : '保存笔记'}
          </button>
        )}
      </div>

      {fmt.fieldDefinitions.map((fd: any) => (
        <div key={fd.key}>
          <label className="block text-xs font-medium text-slate-500 mb-1">{fd.label}</label>
          <textarea
            value={fields[fd.key] || ''}
            onChange={(e) => onChange(fd.key, e.target.value)}
            placeholder={fd.placeholder}
            rows={3}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
        </div>
      ))}

      {!hasContent && (
        <div className="text-xs text-slate-400 text-center py-4">
          在左侧和 AI 对话，笔记内容会自动填充到这里
          <br />也可以直接在这里编辑
        </div>
      )}
    </div>
  );
}

// ─── Plan Output ────────────────────────────────────────────────

function PlanOutput({
  suggestion, activePlan, plans, episodeId, onGoalStatusChange,
}: {
  suggestion: any; activePlan?: TreatmentPlan; plans: TreatmentPlan[];
  episodeId: string;
  onGoalStatusChange: (planId: string, goalId: string, status: string) => void;
}) {
  const createPlan = useCreateTreatmentPlan();
  const { toast } = useToast();
  const goals = (activePlan?.goals as TreatmentGoal[]) || [];
  const achievedCount = goals.filter((g) => g.status === 'achieved').length;

  return (
    <div className="p-3 space-y-4">
      {activePlan ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-3.5 h-3.5 text-brand-500" />
            <span className="text-xs font-semibold text-slate-700">{activePlan.title || '治疗计划'}</span>
          </div>
          {activePlan.approach && <div className="text-xs text-slate-400 mb-2">取向：{activePlan.approach}</div>}

          {goals.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(achievedCount / goals.length) * 100}%` }} />
              </div>
              <span className="text-xs text-slate-500">{achievedCount}/{goals.length}</span>
            </div>
          )}

          <div className="space-y-1.5">
            {goals.map((g) => (
              <div key={g.id} className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => onGoalStatusChange(activePlan.id, g.id, g.status === 'active' ? 'achieved' : 'active')}
                  className={`w-4 h-4 rounded border flex-shrink-0 ${
                    g.status === 'achieved' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'
                  }`}
                >{g.status === 'achieved' && '✓'}</button>
                <span className={g.status === 'achieved' ? 'text-slate-400 line-through' : 'text-slate-700'}>{g.description}</span>
              </div>
            ))}
          </div>

          {activePlan.sessionPlan && (
            <div className="mt-3 text-xs text-slate-500">安排：{activePlan.sessionPlan}</div>
          )}
        </div>
      ) : (
        <div className="text-xs text-slate-400 text-center py-4">
          尚无治疗计划<br />在左侧和 AI 讨论后，方案会出现在这里
        </div>
      )}

      {suggestion && (
        <div className="border-t border-slate-100 pt-3">
          <div className="text-xs font-medium text-teal-600 mb-2">AI 建议方案</div>
          <div className="text-xs text-slate-600 mb-2">{suggestion.rationale}</div>
          {suggestion.suggestedGoals?.map((g: any, i: number) => (
            <div key={i} className="text-xs text-slate-600 mb-1">• {g.description}</div>
          ))}
          {suggestion.sessionPlanSuggestion && (
            <div className="text-xs text-slate-400 mt-2">安排：{suggestion.sessionPlanSuggestion}</div>
          )}
          {!activePlan && (
            <button
              onClick={async () => {
                try {
                  await createPlan.mutateAsync({
                    careEpisodeId: episodeId, title: '治疗计划',
                    goals: suggestion.suggestedGoals?.map((g: any) => ({ id: crypto.randomUUID(), description: g.description, status: 'active', createdAt: new Date().toISOString() })) || [],
                    interventions: suggestion.suggestedInterventions?.map((i: any) => ({ id: crypto.randomUUID(), description: i.description, frequency: i.frequency })) || [],
                    sessionPlan: suggestion.sessionPlanSuggestion, status: 'active',
                  });
                  toast('治疗计划已创建', 'success');
                } catch { toast('创建失败', 'error'); }
              }}
              disabled={createPlan.isPending}
              className="mt-3 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs hover:bg-teal-500 disabled:opacity-50"
            >{createPlan.isPending ? '创建中...' : '采纳为治疗计划'}</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Simulate Context (来访者背景参考) ──────────────────────────

function SimulateContext({ episode, lastNoteSummary, lastNoteDate, presentingIssues }: {
  episode: any; lastNoteSummary?: string; lastNoteDate?: string; presentingIssues?: string[];
}) {
  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-purple-700">
        <User className="w-3.5 h-3.5" /> 来访者背景参考
      </div>

      {/* Chief complaint */}
      <div>
        <div className="text-xs text-slate-400 mb-1">主诉</div>
        <div className="text-sm text-slate-700">{episode.chiefComplaint || '未填写'}</div>
      </div>

      {/* Presenting issues */}
      {presentingIssues && presentingIssues.length > 0 && (
        <div>
          <div className="text-xs text-slate-400 mb-1">问题标签</div>
          <div className="flex flex-wrap gap-1">
            {presentingIssues.map((tag) => (
              <span key={tag} className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs">{tag}</span>
            ))}
          </div>
        </div>
      )}

      {/* Last note summary */}
      <div>
        <div className="text-xs text-slate-400 mb-1">上次笔记 {lastNoteDate || ''}</div>
        <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5">
          {lastNoteSummary || '暂无会谈记录'}
        </div>
      </div>

      <div className="bg-purple-50 rounded-lg p-3 text-xs text-purple-600">
        在左侧以咨询师身份和"来访者"对话。AI 会基于以上背景扮演来访者，帮助你练习咨询技巧。
      </div>
    </div>
  );
}

// ─── Supervise Context (督导参考素材) ───────────────────────────

function SuperviseContext({ episode, activePlan, lastNoteSummary, lastNoteDate }: {
  episode: any; activePlan?: TreatmentPlan; lastNoteSummary?: string; lastNoteDate?: string;
}) {
  const goals = (activePlan?.goals as TreatmentGoal[]) || [];

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-700">
        <GraduationCap className="w-3.5 h-3.5" /> 督导参考素材
      </div>

      {/* Chief complaint */}
      <div>
        <div className="text-xs text-slate-400 mb-1">来访者主诉</div>
        <div className="text-sm text-slate-700">{episode.chiefComplaint || '未填写'}</div>
      </div>

      {/* Treatment plan */}
      {activePlan ? (
        <div>
          <div className="text-xs text-slate-400 mb-1">当前治疗计划：{activePlan.title || '未命名'}</div>
          {activePlan.approach && <div className="text-xs text-slate-500 mb-1">取向：{activePlan.approach}</div>}
          <div className="space-y-1">
            {goals.map((g) => (
              <div key={g.id} className="text-xs text-slate-600">
                {g.status === 'achieved' ? '✓' : '○'} {g.description}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div className="text-xs text-slate-400 mb-1">治疗计划</div>
          <div className="text-xs text-slate-500">尚无治疗计划</div>
        </div>
      )}

      {/* Last note */}
      <div>
        <div className="text-xs text-slate-400 mb-1">最近笔记 {lastNoteDate || ''}</div>
        <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5">
          {lastNoteSummary || '暂无会谈记录'}
        </div>
      </div>

      <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-600">
        在左侧和 AI 督导对话。督导会通过提问帮助你反思个案，以上信息供参考。
      </div>
    </div>
  );
}

// ─── Assessment Result Detail ─────────────────────────────────

function ResultDetailPanel({ result, onClose }: { result: any; onClose: () => void }) {
  const scaleLabel = result.scaleTitles?.join(' / ') || result.assessmentTitle || '测评';
  const interpretations: { dimension: string; score: number; label: string }[] = result.interpretations || [];

  const riskLabels: Record<string, string> = {
    level_1: '一般', level_2: '关注', level_3: '严重', level_4: '危机',
  };
  const riskColors: Record<string, string> = {
    level_1: 'text-emerald-600 bg-emerald-50',
    level_2: 'text-amber-600 bg-amber-50',
    level_3: 'text-red-600 bg-red-50',
    level_4: 'text-red-800 bg-red-100',
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-semibold text-slate-900">测评报告</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Scale & date */}
        <div>
          <div className="text-sm font-medium text-slate-800">{scaleLabel}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {new Date(result.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* Total score */}
        {result.totalScore != null && (
          <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-slate-800">{result.totalScore}</div>
            <div className="text-xs text-slate-500">总分</div>
            {result.riskLevel && (
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${riskColors[result.riskLevel] || 'text-slate-500 bg-slate-100'}`}>
                {riskLabels[result.riskLevel] || result.riskLevel}
              </span>
            )}
          </div>
        )}

        {/* Dimension interpretations */}
        {interpretations.length > 0 && (
          <div>
            <div className="text-xs font-medium text-slate-500 mb-2">维度得分</div>
            <div className="space-y-2">
              {interpretations.map((interp, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                  <span className="text-xs text-slate-700">{interp.dimension}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-800">{interp.score}分</span>
                    {interp.label && (
                      <span className="text-xs text-slate-500">{interp.label}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Assessment info */}
        {result.assessmentTitle && (
          <div className="text-xs text-slate-400">
            来源：{result.assessmentTitle}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI Conversation Viewer ───────────────────────────────────

function ConversationViewer({ conversation, onClose }: { conversation: any; onClose: () => void }) {
  const updateConv = useUpdateAiConversation();
  const deleteConv = useDeleteAiConversation();
  const { toast } = useToast();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(conversation.title || '');
  const messages = (conversation.messages as any[]) || [];
  // BUG-009: 之前只识别 simulate/supervise, 4 mode 归档后扩展.
  const modeMeta = ({
    note: { label: '笔记草稿', icon: '📝' },
    plan: { label: '方案讨论', icon: '🎯' },
    simulate: { label: '模拟练习', icon: '🗣️' },
    supervise: { label: '督导对话', icon: '🎓' },
  } as const)[conversation.mode as 'note' | 'plan' | 'simulate' | 'supervise'] ?? { label: 'AI 对话', icon: '💬' };
  const modeLabel = modeMeta.label;
  const modeIcon = modeMeta.icon;

  const handleSaveTitle = async () => {
    try {
      await updateConv.mutateAsync({ id: conversation.id, title });
      setEditingTitle(false);
      toast('已更新', 'success');
    } catch { toast('更新失败', 'error'); }
  };

  const handleDelete = async () => {
    if (!confirm('确定删除这段对话？')) return;
    try {
      await deleteConv.mutateAsync(conversation.id);
      toast('已删除', 'success');
      onClose();
    } catch { toast('删除失败', 'error'); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <span className="text-base">{modeIcon}</span>
          {editingTitle ? (
            <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={handleSaveTitle}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
              autoFocus className="text-sm font-semibold text-slate-900 border-b border-brand-500 outline-none px-1" />
          ) : (
            <span className="text-sm font-semibold text-slate-900">{conversation.title || modeLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setEditingTitle(!editingTitle)} className="text-slate-400 hover:text-slate-600" title="编辑标题">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleDelete} className="text-slate-400 hover:text-red-500" title="删除对话">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="text-xs text-slate-400 px-4 py-2 border-b border-slate-100">
        {messages.length}条消息 · {new Date(conversation.createdAt).toLocaleString('zh-CN')}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg: any, i: number) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === 'user'
                ? 'bg-brand-600 text-white rounded-br-md'
                : 'bg-slate-100 text-slate-700 rounded-bl-md'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="text-center text-xs text-slate-400 py-8">暂无对话内容</div>
        )}
      </div>
    </div>
  );
}
