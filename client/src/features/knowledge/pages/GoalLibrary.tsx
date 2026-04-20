import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Check, Edit3, Eye, Loader2, Send, Sparkles, Target, Trash2, Upload,
} from 'lucide-react';
import type { TreatmentGoalLibraryItem } from '@psynote/shared';
import { useGoalLibrary, useCreateGoal, useDeleteGoal } from '../../../api/useGoalLibrary';
import { useExtractGoal, useCreateGoalChat, type ExtractedGoal } from '../../../api/useAI';
import { PageLoading, EmptyState, StatusBadge, useToast } from '../../../shared/components';
import { DistributionControl } from '../../../shared/components/DistributionControl';
import { useIsSystemLibraryScope } from '../../../shared/api/libraryScope';
import { GoalDetail } from '../components/GoalDetail';

/**
 * Problem area label lookup — DB stores raw enum values, UI shows
 * Chinese labels. Kept here (duplicated in GoalDetail) to avoid a
 * cross-file import cycle for such a small map.
 */
const problemAreaLabels: Record<string, string> = {
  anxiety: '焦虑', depression: '抑郁', relationship: '人际关系', trauma: '创伤',
  self_esteem: '自尊', grief: '丧失/悲伤', anger: '情绪管理', substance: '成瘾',
  academic: '学业', career: '职业', family: '家庭', other: '其他',
};

/** Pill colors for short-term vs long-term. */
const CATEGORY_STYLES: Record<string, { label: string; className: string }> = {
  short_term: { label: '短期', className: 'bg-amber-50 text-amber-700' },
  long_term: { label: '长期', className: 'bg-blue-50 text-blue-700' },
};

type ChatMsg = { role: 'user' | 'assistant'; content: string };
type ViewMode =
  | { type: 'list' }
  | { type: 'detail'; goalId: string; editing: boolean }
  | { type: 'import' }
  | { type: 'ai' };

export function GoalLibrary() {
  const [view, setView] = useState<ViewMode>({ type: 'list' });
  const { data: goals, isLoading } = useGoalLibrary();

  const goToList = () => setView({ type: 'list' });
  const goToDetail = (goalId: string, editing: boolean) =>
    setView({ type: 'detail', goalId, editing });

  if (view.type === 'detail') {
    return (
      <GoalDetail
        goalId={view.goalId}
        onBack={goToList}
        initialEditing={view.editing}
      />
    );
  }
  if (view.type === 'import') {
    return <GoalImporter onClose={goToList} onCreated={(id) => goToDetail(id, true)} />;
  }
  if (view.type === 'ai') {
    return <AIGoalCreator onClose={goToList} onCreated={(id) => goToDetail(id, true)} />;
  }

  // Group by problem area — keeps the library navigable when it grows.
  const grouped = (goals || []).reduce((acc, g) => {
    const area = g.problemArea;
    if (!acc[area]) acc[area] = [];
    acc[area].push(g);
    return acc;
  }, {} as Record<string, TreatmentGoalLibraryItem[]>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          管理干预目标模板，在制定个案治疗计划时可直接选用
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView({ type: 'import' })}
            className="px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" /> 文本导入
          </button>
          <button
            onClick={() => setView({ type: 'ai' })}
            className="px-3 py-2 border border-amber-200 text-amber-700 bg-amber-50 rounded-lg text-sm font-medium hover:bg-amber-100 flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" /> AI 生成
          </button>
        </div>
      </div>

      {isLoading ? (
        <PageLoading />
      ) : !goals || goals.length === 0 ? (
        <EmptyState title="暂无干预目标" action={{ label: 'AI 生成目标', onClick: () => setView({ type: 'ai' }) }} />
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([area, items]) => (
            <div key={area}>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">
                {problemAreaLabels[area] || area}
                <span className="text-slate-400 font-normal ml-1">({items.length})</span>
              </h3>
              <div className="grid gap-3">
                {items.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    onView={() => goToDetail(goal.id, false)}
                    onEdit={() => goToDetail(goal.id, true)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GoalCard({
  goal,
  onView,
  onEdit,
}: {
  goal: TreatmentGoalLibraryItem;
  onView: () => void;
  onEdit: () => void;
}) {
  const deleteGoal = useDeleteGoal();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isSystemScope = useIsSystemLibraryScope();
  const categoryStyle = goal.category ? CATEGORY_STYLES[goal.category] : null;

  // Org users can modify their own org's items; sysadmins can modify
  // any platform-level item. Non-owners see buttons but get a toast
  // on click — chosen over hiding them (user preference) so the UI
  // stays predictable across cards regardless of data provenance.
  const canModify = !!goal.orgId || isSystemScope;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onView}>
          <div className="flex items-center gap-2 flex-wrap">
            <Target className="w-4 h-4 text-teal-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-slate-900">{goal.title}</span>
            {!goal.orgId && <StatusBadge label="平台" variant="blue" />}
            {categoryStyle && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${categoryStyle.className}`}>
                {categoryStyle.label}
              </span>
            )}
            <DistributionControl
              resource="goals"
              item={goal}
              onSaved={() => qc.invalidateQueries({ queryKey: ['goalLibrary'] })}
            />
          </div>
          {goal.description && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{goal.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 ml-3">
          <button
            onClick={onView}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
            title="查看"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (!canModify) {
                toast('无权修改：平台级内容仅系统管理员可管理', 'error');
                return;
              }
              onEdit();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
            title="编辑"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={async () => {
              if (!canModify) {
                toast('无权删除：平台级内容仅系统管理员可管理', 'error');
                return;
              }
              if (confirm(`确定删除"${goal.title}"？`)) {
                try {
                  await deleteGoal.mutateAsync(goal.id);
                  toast('已删除', 'success');
                } catch (err: any) {
                  toast(err?.message || '删除失败', 'error');
                }
              }
            }}
            className="p-1.5 text-slate-400 hover:text-red-500 rounded"
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Goal Importer (text → AI extract → confirm → save) ────────

function GoalImporter({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const extract = useExtractGoal();
  const createGoal = useCreateGoal();
  const [text, setText] = useState('');
  const [result, setResult] = useState<ExtractedGoal | null>(null);

  const handleExtract = () => {
    if (!text.trim()) return;
    extract.mutate({ content: text }, {
      onSuccess: (data) => setResult(data),
      onError: () => toast('识别失败，请检查文本内容后重试', 'error'),
    });
  };

  const handleSave = () => {
    if (!result) return;
    createGoal.mutate(
      {
        title: result.title,
        description: result.description,
        problemArea: result.problemArea,
        category: result.category,
        objectivesTemplate: result.objectivesTemplate,
        interventionSuggestions: result.interventionSuggestions,
        visibility: 'organization',
      },
      {
        onSuccess: (created: any) => {
          toast('目标导入成功', 'success');
          onCreated(created.id);
        },
        onError: () => toast('保存失败', 'error'),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Sparkles className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-bold text-slate-900">文本导入干预目标</h3>
      </div>

      {!result ? (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">粘贴目标相关文本，AI 会自动识别结构</p>
            <p className="text-amber-600">支持：教材摘录、临床指南片段、以前的治疗笔记等</p>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder="在此粘贴目标描述..."
            className="w-full border border-slate-200 rounded-xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="flex justify-end">
            <button
              onClick={handleExtract}
              disabled={!text.trim() || extract.isPending}
              className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5"
            >
              {extract.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> AI 识别中...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> 开始识别</>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-2 text-green-700">
              <Check className="w-4 h-4" />
              <span className="text-sm font-semibold">识别完成，请确认</span>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <FieldRow label="标题" value={result.title} bold />
              <FieldRow label="问题领域" value={problemAreaLabels[result.problemArea] || result.problemArea} />
              <FieldRow label="类别" value={CATEGORY_STYLES[result.category]?.label || result.category} />
              {result.description && <FieldRow label="描述" value={result.description} />}
              <FieldRow label="参考目标数" value={`${result.objectivesTemplate.length} 个`} />
              <FieldRow label="建议干预数" value={`${result.interventionSuggestions.length} 个`} />
            </div>
            {result.objectivesTemplate.length > 0 && (
              <div>
                <span className="text-xs text-slate-400 mb-2 block">参考目标预览</span>
                <div className="space-y-1">
                  {result.objectivesTemplate.map((o, i) => (
                    <div key={i} className="text-sm text-slate-600">• {o}</div>
                  ))}
                </div>
              </div>
            )}
            {result.interventionSuggestions.length > 0 && (
              <div>
                <span className="text-xs text-slate-400 mb-2 block">建议干预预览</span>
                <div className="space-y-1">
                  {result.interventionSuggestions.map((s, i) => (
                    <div key={i} className="text-sm text-slate-600">• {s}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setResult(null)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              重新识别
            </button>
            <button
              onClick={handleSave}
              disabled={createGoal.isPending}
              className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
            >
              {createGoal.isPending ? '保存中...' : '确认导入'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Key/value row used in the importer confirmation summary. */
function FieldRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <span className="text-xs text-slate-400">{label}</span>
      <p className={`text-sm ${bold ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{value}</p>
    </div>
  );
}

// ─── AI Goal Creator (multi-turn chat) ──────────────────────────

function AIGoalCreator({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const chatMutation = useCreateGoalChat();
  const createGoal = useCreateGoal();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content:
        '你好！我可以帮你生成专业的干预目标模板。\n\n请问你想围绕哪类问题制定目标？比如：\n• 焦虑 / 抑郁 / 创伤\n• 青少年学业压力\n• 人际关系困难\n• 其他具体场景',
    },
  ]);
  const [input, setInput] = useState('');
  const [currentGoal, setCurrentGoal] = useState<ExtractedGoal | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || chatMutation.isPending) return;
    const userMsg: ChatMsg = { role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');

    const apiMessages = updated.map((m) => ({ role: m.role, content: m.content }));

    chatMutation.mutate({ messages: apiMessages }, {
      onSuccess: (data) => {
        if (data.type === 'goal') {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.summary }]);
          setCurrentGoal(data.goal);
        } else {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]);
        }
      },
      onError: () => setMessages((prev) => [...prev, { role: 'assistant', content: '抱歉，AI 服务暂时不可用。' }]),
    });
  };

  const handleSaveGoal = () => {
    if (!currentGoal) return;
    createGoal.mutate(
      {
        title: currentGoal.title,
        description: currentGoal.description,
        problemArea: currentGoal.problemArea,
        category: currentGoal.category,
        objectivesTemplate: currentGoal.objectivesTemplate,
        interventionSuggestions: currentGoal.interventionSuggestions,
        visibility: 'organization',
      },
      {
        onSuccess: (created: any) => {
          toast('目标已保存', 'success');
          onCreated(created.id);
        },
        onError: () => toast('保存失败', 'error'),
      },
    );
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 14rem)' }}>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Sparkles className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-bold text-slate-900">AI 生成干预目标</h3>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 mb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === 'user' ? 'bg-brand-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-700 rounded-bl-md'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {currentGoal && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 bg-white border border-amber-200">
              <div className="text-xs font-semibold text-amber-700 mb-1">已生成目标草稿</div>
              <div className="text-sm font-medium text-slate-900 mb-1">{currentGoal.title}</div>
              <div className="text-xs text-slate-500 mb-2">
                {problemAreaLabels[currentGoal.problemArea] || currentGoal.problemArea}
                {' · '}
                {CATEGORY_STYLES[currentGoal.category]?.label || currentGoal.category}
                {' · '}
                {currentGoal.objectivesTemplate.length} 个子目标
              </div>
              <button
                onClick={handleSaveGoal}
                disabled={createGoal.isPending}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-500 disabled:opacity-50"
              >
                {createGoal.isPending ? '保存中...' : '保存到库'}
              </button>
            </div>
          </div>
        )}
        {chatMutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-slate-500 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> 思考中...
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
          placeholder="描述你需要的目标..."
          disabled={chatMutation.isPending}
          className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          onClick={handleSend}
          disabled={chatMutation.isPending || !input.trim()}
          className="px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-500 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
