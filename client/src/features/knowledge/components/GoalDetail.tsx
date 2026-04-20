import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Edit3, Trash2, Save, Sparkles, Send, Loader2, Target,
} from 'lucide-react';
import type { TreatmentGoalLibraryItem } from '@psynote/shared';
import { useGoalLibrary, useUpdateGoal, useDeleteGoal } from '../../../api/useGoalLibrary';
import { useCreateGoalChat, type ExtractedGoal } from '../../../api/useAI';
import { PageLoading, useToast } from '../../../shared/components';
import { useIsSystemLibraryScope } from '../../../shared/api/libraryScope';

const PROBLEM_AREA_LABELS: Record<string, string> = {
  anxiety: '焦虑', depression: '抑郁', relationship: '人际关系', trauma: '创伤',
  self_esteem: '自尊', grief: '丧失/悲伤', anger: '情绪管理', substance: '成瘾',
  academic: '学业', career: '职业', family: '家庭', other: '其他',
};

const CATEGORY_LABELS: Record<string, string> = {
  short_term: '短期',
  long_term: '长期',
};

interface EditState {
  title: string;
  description: string;
  problemArea: string;
  category: 'short_term' | 'long_term';
  objectives: string[];
  interventions: string[];
}

function goalToEditState(g: TreatmentGoalLibraryItem): EditState {
  return {
    title: g.title || '',
    description: g.description || '',
    problemArea: g.problemArea || 'anxiety',
    category: (g.category as 'short_term' | 'long_term') || 'short_term',
    objectives: ((g.objectivesTemplate as string[]) || []).slice(),
    interventions: ((g.interventionSuggestions as string[]) || []).slice(),
  };
}

/** Convert edit state to the shape the AI chat panel expects for context. */
function editStateToDraft(s: EditState): ExtractedGoal {
  return {
    title: s.title,
    description: s.description,
    problemArea: s.problemArea,
    category: s.category,
    objectivesTemplate: s.objectives,
    interventionSuggestions: s.interventions,
  };
}

interface Props {
  goalId: string;
  onBack: () => void;
  initialEditing?: boolean;
}

/**
 * Full-page detail view for a treatment goal — matches the layout of
 * `AgreementDetail.tsx` so the 6 knowledge-library detail pages all
 * behave the same: left column holds the form, right column holds a
 * role-aware AI chat panel that can refine the current draft.
 *
 * Entry points: GoalLibrary list page calls this with `initialEditing`
 * based on whether the user clicked the eye (view) or pencil (edit)
 * icon. Clicking the back arrow returns to the list.
 */
export function GoalDetail({ goalId, onBack, initialEditing = false }: Props) {
  const { data: goals } = useGoalLibrary();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();
  const { toast } = useToast();
  const isSystemScope = useIsSystemLibraryScope();

  const goal = goals?.find((g) => g.id === goalId);

  const [editing, setEditing] = useState(initialEditing);
  const [editData, setEditData] = useState<EditState | null>(null);

  useEffect(() => {
    if (initialEditing && goal && !editData) {
      setEditData(goalToEditState(goal));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditing, goal]);

  const handleEdit = useCallback(() => {
    if (!goal) return;
    setEditData(goalToEditState(goal));
    setEditing(true);
  }, [goal]);

  const handleCancel = () => {
    setEditing(false);
    setEditData(null);
  };

  const handleSave = async () => {
    if (!editData || !goal) return;
    if (!editData.title.trim()) {
      toast('标题不能为空', 'error');
      return;
    }
    try {
      await updateGoal.mutateAsync({
        goalId,
        title: editData.title,
        description: editData.description || undefined,
        category: editData.category,
        objectivesTemplate: editData.objectives.filter(Boolean),
        interventionSuggestions: editData.interventions.filter(Boolean),
      });
      toast('已保存', 'success');
      setEditing(false);
      setEditData(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    }
  };

  const handleDelete = async () => {
    if (!goal) return;
    if (!confirm(`确定删除"${goal.title}"？`)) return;
    try {
      await deleteGoal.mutateAsync(goalId);
      toast('已删除', 'success');
      onBack();
    } catch {
      toast('删除失败', 'error');
    }
  };

  const applyAIChange = useCallback(
    (newState: Partial<ExtractedGoal>) => {
      setEditData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...(newState.title !== undefined && { title: newState.title }),
          ...(newState.description !== undefined && { description: newState.description }),
          ...(newState.category && { category: newState.category }),
          ...(newState.problemArea && { problemArea: newState.problemArea }),
          ...(newState.objectivesTemplate && { objectives: newState.objectivesTemplate }),
          ...(newState.interventionSuggestions && { interventions: newState.interventionSuggestions }),
        };
      });
      toast('AI 已更新目标', 'success');
    },
    [toast],
  );

  if (!goal) return <PageLoading text="加载目标..." />;

  const data: EditState = editing && editData ? editData : goalToEditState(goal);
  // Owner + sysadmin can delete.
  const canDelete = !!goal.orgId || isSystemScope;

  return (
    <div className="flex h-full">
      {/* LEFT: Content */}
      <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={onBack} className="text-slate-400 hover:text-slate-600">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Target className="w-4 h-4 text-teal-500 flex-shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900 truncate">
              {data.title || '未命名目标'}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateGoal.isPending || !editData}
                  className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {updateGoal.isPending ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中...</>
                  ) : (
                    <><Save className="w-3.5 h-3.5" /> 保存</>
                  )}
                </button>
              </>
            ) : (
              <>
                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                  {PROBLEM_AREA_LABELS[data.problemArea] || data.problemArea}
                </span>
                <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">
                  {CATEGORY_LABELS[data.category]}
                </span>
                <button
                  onClick={handleEdit}
                  className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" /> 编辑
                </button>
                {canDelete && (
                  <button
                    onClick={handleDelete}
                    className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> 删除
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-6 space-y-4">
            {/* Basic info */}
            <CardSection title="基本信息">
              <Field label="目标名称" required>
                {editing ? (
                  <input
                    value={data.title}
                    onChange={(e) =>
                      setEditData((p) => (p ? { ...p, title: e.target.value } : p))
                    }
                    placeholder="如：减少焦虑症状"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                ) : (
                  <p className="text-sm text-slate-700">
                    {data.title || <span className="text-slate-300 italic">未命名</span>}
                  </p>
                )}
              </Field>

              <Field label="描述">
                {editing ? (
                  <input
                    value={data.description}
                    onChange={(e) =>
                      setEditData((p) => (p ? { ...p, description: e.target.value } : p))
                    }
                    placeholder="简要描述目标"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                ) : (
                  <p className="text-sm text-slate-700">
                    {data.description || <span className="text-slate-300 italic">无描述</span>}
                  </p>
                )}
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="问题领域" required>
                  {editing ? (
                    <select
                      value={data.problemArea}
                      onChange={(e) =>
                        setEditData((p) => (p ? { ...p, problemArea: e.target.value } : p))
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      {Object.entries(PROBLEM_AREA_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-slate-700">
                      {PROBLEM_AREA_LABELS[data.problemArea] || data.problemArea}
                    </p>
                  )}
                </Field>
                <Field label="类别" required>
                  {editing ? (
                    <select
                      value={data.category}
                      onChange={(e) =>
                        setEditData((p) => (p ? { ...p, category: e.target.value as 'short_term' | 'long_term' } : p))
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="short_term">短期</option>
                      <option value="long_term">长期</option>
                    </select>
                  ) : (
                    <p className="text-sm text-slate-700">{CATEGORY_LABELS[data.category]}</p>
                  )}
                </Field>
              </div>
            </CardSection>

            {/* Objectives */}
            <CardSection title={`参考目标 (${data.objectives.length})`}>
              {editing ? (
                <textarea
                  value={data.objectives.join('\n')}
                  onChange={(e) =>
                    setEditData((p) => (p ? { ...p, objectives: e.target.value.split('\n') } : p))
                  }
                  placeholder="每行一个具体可测量的子目标，例如：&#10;每周焦虑发作次数减少 50%&#10;掌握 3 种以上应对焦虑的技巧"
                  rows={6}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-y"
                />
              ) : data.objectives.filter(Boolean).length > 0 ? (
                <ul className="text-sm text-slate-700 space-y-1.5">
                  {data.objectives.filter(Boolean).map((o, i) => (
                    <li key={i}>• {o}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-300 italic">未填写</p>
              )}
            </CardSection>

            {/* Interventions */}
            <CardSection title={`建议干预 (${data.interventions.length})`}>
              {editing ? (
                <textarea
                  value={data.interventions.join('\n')}
                  onChange={(e) =>
                    setEditData((p) => (p ? { ...p, interventions: e.target.value.split('\n') } : p))
                  }
                  placeholder="每行一个干预技术，例如：&#10;认知重构训练&#10;渐进式肌肉放松&#10;暴露疗法"
                  rows={6}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-y"
                />
              ) : data.interventions.filter(Boolean).length > 0 ? (
                <ul className="text-sm text-slate-700 space-y-1.5">
                  {data.interventions.filter(Boolean).map((s, i) => (
                    <li key={i}>• {s}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-300 italic">未填写</p>
              )}
            </CardSection>
          </div>
        </div>
      </div>

      {/* RIGHT: AI Chat panel */}
      <div className="w-[420px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-slate-900 truncate">{data.title || '目标'}</h3>
        </div>

        <GoalAIChatPanel
          editing={editing}
          currentDraft={editStateToDraft(data)}
          onApply={applyAIChange}
        />
      </div>
    </div>
  );
}

/* ==================================================================== */
/*  Layout helpers                                                       */
/* ==================================================================== */

function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs text-slate-400 font-medium block mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

/* ==================================================================== */
/*  AI Chat Panel — refine current draft                                 */
/* ==================================================================== */

type ChatMsg = { role: 'user' | 'assistant'; content: string };

function GoalAIChatPanel({
  editing,
  currentDraft,
  onApply,
}: {
  editing: boolean;
  currentDraft: ExtractedGoal;
  onApply: (next: Partial<ExtractedGoal>) => void;
}) {
  const chatMutation = useCreateGoalChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content:
        '我可以帮你修改这个目标。\n\n比如你可以说：\n• "把参考目标改得更可测量"\n• "增加一条关于家校合作的干预建议"\n• "把类别改为长期"',
    },
  ]);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    if (!editing) return;
    const text = input.trim();
    if (!text || chatMutation.isPending) return;
    setInput('');

    const userMsg: ChatMsg = { role: 'user', content: text };
    setMessages((p) => [...p, userMsg]);

    const contextMsg: ChatMsg = {
      role: 'user',
      content:
        `当前干预目标如下，请基于它进行修改：\n\n` +
        `标题：${currentDraft.title}\n` +
        `描述：${currentDraft.description || '(无)'}\n` +
        `问题领域：${currentDraft.problemArea}\n` +
        `类别：${currentDraft.category}\n` +
        `参考目标：\n${currentDraft.objectivesTemplate.map((o) => `- ${o}`).join('\n') || '(无)'}\n` +
        `建议干预：\n${currentDraft.interventionSuggestions.map((s) => `- ${s}`).join('\n') || '(无)'}`,
    };

    const apiMessages = [contextMsg, ...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    chatMutation.mutate(
      { messages: apiMessages },
      {
        onSuccess: (data) => {
          if (data.type === 'goal') {
            onApply(data.goal);
            setMessages((p) => [
              ...p,
              { role: 'assistant', content: data.summary || '已根据你的描述更新左侧表单。' },
            ]);
          } else {
            setMessages((p) => [...p, { role: 'assistant', content: data.content }]);
          }
        },
        onError: (err) => {
          setMessages((p) => [
            ...p,
            {
              role: 'assistant',
              content: err instanceof Error ? `修改失败：${err.message}` : '修改失败，请重试',
            },
          ]);
        },
      },
    );
  };

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 relative">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[92%] rounded-2xl px-3.5 py-2 text-xs ${
                msg.role === 'user'
                  ? 'bg-brand-600 text-white rounded-br-md'
                  : 'bg-white text-slate-700 rounded-bl-md border border-slate-200'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-bl-md px-3.5 py-2 text-xs text-slate-500 flex items-center gap-1.5 border border-slate-200">
              <Loader2 className="w-3 h-3 animate-spin" /> AI 思考中...
            </div>
          </div>
        )}

        {!editing && (
          <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
            <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 max-w-[85%] text-center shadow-sm">
              点击右上角「编辑」按钮，进入编辑态后即可与 AI 对话修改目标
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-200 bg-white">
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder={editing ? '输入修改意见...' : '请先点击编辑'}
            disabled={!editing || chatMutation.isPending}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!editing || chatMutation.isPending || !input.trim()}
            className="px-3 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}
