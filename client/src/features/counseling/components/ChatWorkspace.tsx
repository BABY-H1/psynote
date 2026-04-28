import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  useNoteGuidanceChat, useSuggestTreatmentPlan,
  useSimulatedClient, useSupervision,
} from '../../../api/useAI';
import { useCreateSessionNote, useCreateAiConversation, useUpdateAiConversation } from '../../../api/useCounseling';
import { useToast } from '../../../shared/components';
import { Send, Loader2, FileText, Target, Users, GraduationCap, Paperclip, X } from 'lucide-react';
import type { TreatmentPlan } from '@psynote/shared';
import { BUILT_IN_FORMATS } from './NoteFormatSelector';

export type WorkMode = 'note' | 'plan' | 'simulate' | 'supervise' | 'crisis';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  suggestion?: { field: string; content: string; rationale: string };
}

/**
 * Phase I imperative API:
 * - Issue 2 (loadConversation): EpisodeDetail 在用户从 LeftPanel 点击某条
 *   ai_conversation 历史时, 触发 ChatWorkspace 切到对应 mode + 注入
 *   messages, 实现"续写"而不是只读 viewer.
 * - Issue 1 (bindCurrentNoteToSession): EpisodeDetail 在用户保存 sessionNote
 *   后调用此方法把当前 mode='note' 的 conversation.sessionNoteId 关联过
 *   去, LeftPanel 因此把"草稿对话"显示在"会谈记录"区. 返回值用于 toast
 *   反馈但 EpisodeDetail 一般不消费 (fire-and-forget).
 */
export interface ChatWorkspaceHandle {
  loadConversation: (mode: WorkMode, messages: ChatMessage[], conversationId: string) => void;
  bindCurrentNoteToSession: (sessionNoteId: string) => Promise<void>;
}

const modeConfig: Record<WorkMode, { icon: React.ReactNode; label: string; placeholder: string; color: string }> = {
  note: { icon: <FileText className="w-3.5 h-3.5" />, label: '写笔记', placeholder: '描述这次会谈的情况...', color: 'brand' },
  plan: { icon: <Target className="w-3.5 h-3.5" />, label: '讨论方案', placeholder: '和 AI 讨论治疗计划...', color: 'teal' },
  simulate: { icon: <Users className="w-3.5 h-3.5" />, label: '模拟来访', placeholder: '开始咨询对话（你是咨询师）...', color: 'purple' },
  supervise: { icon: <GraduationCap className="w-3.5 h-3.5" />, label: '督导', placeholder: '和 AI 督导讨论你的个案...', color: 'amber' },
  // Phase 13 — crisis mode is NOT a chat mode; OutputPanel renders the
  // CrisisChecklistPanel directly. We define an entry so WorkMode union
  // compiles, but the ChatWorkspace input box is hidden for this mode.
  crisis: { icon: <FileText className="w-3.5 h-3.5" />, label: '危机处置', placeholder: '', color: 'red' },
};

interface ClientContext {
  name?: string;
  age?: number;
  gender?: string;
  occupation?: string;
  education?: string;
  presentingIssues?: string[];
  medicalHistory?: string;
  familyBackground?: string;
}

interface Props {
  episodeId: string;
  clientId: string;
  chiefComplaint?: string;
  activePlan?: TreatmentPlan;
  clientContext?: ClientContext;
  sessionHistorySummary?: string;
  assessmentSummary?: string;
  lastNoteSummary?: string;
  onNoteFieldsUpdate: (fields: Record<string, string>, format: string) => void;
  onPlanSuggestion: (data: any) => void;
  onModeChange?: (mode: WorkMode) => void;
  onNoteFormatChange?: (format: string) => void;
  /** When true, force initial mode to 'crisis' and expose the crisis tab. */
  isCrisisEpisode?: boolean;
  initialMode?: WorkMode;
}

export const ChatWorkspace = forwardRef<ChatWorkspaceHandle, Props>(function ChatWorkspace({
  episodeId, clientId, chiefComplaint, activePlan,
  clientContext, sessionHistorySummary, assessmentSummary, lastNoteSummary,
  onNoteFieldsUpdate, onPlanSuggestion, onModeChange, onNoteFormatChange,
  isCrisisEpisode, initialMode,
}: Props, ref) {
  const [mode, setModeInternal] = useState<WorkMode>(
    initialMode || (isCrisisEpisode ? 'crisis' : 'note'),
  );
  const setMode = (m: WorkMode) => {
    setModeInternal(m);
    onModeChange?.(m);
  };
  // Emit the initial mode to the parent on mount so OutputPanel renders in
  // sync (otherwise OutputPanel starts in its default 'note' layout until the
  // user manually switches modes).
  useEffect(() => {
    if (onModeChange) onModeChange(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // When the crisis case arrives asynchronously, snap into crisis mode so the
  // user lands on the checklist without having to click the tab. Only runs
  // once per `isCrisisEpisode` becoming true, and only if the user is still on
  // the default 'note' tab (never hijacks their own mode choice).
  useEffect(() => {
    if (isCrisisEpisode && mode === 'note') {
      setMode('crisis');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCrisisEpisode]);
  const [messages, setMessages] = useState<Record<WorkMode, ChatMessage[]>>({
    note: [], plan: [], simulate: [], supervise: [], crisis: [],
  });
  const [input, setInput] = useState('');
  const [noteFormat, setNoteFormat] = useState('soap');
  const [attachments, setAttachments] = useState<{ name: string; content: string }[]>([]);
  const [conversationIds, setConversationIds] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Auto-save hooks for simulate/supervise
  const createConversation = useCreateAiConversation();
  const updateConversation = useUpdateAiConversation();

  /*
   * Phase I Issue 2: 暴露 imperative API 给 EpisodeDetail.
   * loadConversation: 当用户从 sidebar 点击历史对话, EpisodeDetail 调用这
   * 个方法把对应 mode + messages + conversationId 注入 state, 用户可继续
   * 对话 (而不是只读 viewer).
   * bindCurrentNoteToSession: Phase I Issue 1, 用户保存 sessionNote 后调.
   */
  useImperativeHandle(ref, () => ({
    loadConversation: (loadMode, loadMessages, loadConvId) => {
      // 强制 setMode 先于 setMessages, 防止 onModeChange 触发的 effect 看到
      // 旧 mode 的 messages 渲染.
      setMode(loadMode);
      setMessages((prev) => ({ ...prev, [loadMode]: loadMessages }));
      setConversationIds((prev) => ({ ...prev, [loadMode]: loadConvId }));
    },
    bindCurrentNoteToSession: async (sessionNoteId) => {
      const noteConvId = conversationIds.note;
      if (!noteConvId) {
        // 没有 conversation 就不需要绑定 (用户没跟 AI 对话直接手填 SOAP form 也走这条路径)
        return;
      }
      try {
        await updateConversation.mutateAsync({ id: noteConvId, sessionNoteId });
        // 绑定后清掉本地 noteConvId, 让下次写新笔记开新 conversation
        setConversationIds((prev) => {
          const next = { ...prev };
          delete next.note;
          return next;
        });
        // 同时清空当前 note mode 的 messages, 让下次 mode='note' 是空白起点
        setMessages((prev) => ({ ...prev, note: [] }));
      } catch (err) {
        // 绑定失败不阻断保存 — sessionNote 已建好, conversation 留作 "AI 对话" 区
        console.warn('[ChatWorkspace] bind note conv failed:', err);
      }
    },
  }), [conversationIds, updateConversation]);

  // AI hooks
  const noteChat = useNoteGuidanceChat();
  const planSuggest = useSuggestTreatmentPlan();
  const simulateChat = useSimulatedClient();
  const superviseChat = useSupervision();

  const isPending = noteChat.isPending || planSuggest.isPending || simulateChat.isPending || superviseChat.isPending;
  const currentMessages = messages[mode];
  const config = modeConfig[mode];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [currentMessages]);

  const getFieldDefs = () => {
    const fmt = BUILT_IN_FORMATS.find((f: any) => f.format === noteFormat);
    return fmt?.fieldDefinitions || BUILT_IN_FORMATS[0].fieldDefinitions;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) { toast('文件过大（最大5MB）', 'error'); continue; }
      try {
        const text = await file.text();
        setAttachments((prev) => [...prev, { name: file.name, content: text }]);
      } catch { toast(`无法读取 ${file.name}`, 'error'); }
    }
    e.target.value = '';
  };

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isPending) return;
    const sendText = text || (attachments.length > 0 ? '请帮我整理这些会谈素材。' : '');

    const userMsg: ChatMessage = { role: 'user', content: sendText };
    const newMsgs = [...currentMessages, userMsg];
    setMessages({ ...messages, [mode]: newMsgs });
    setInput('');

    try {
      let assistantContent = '';

      if (mode === 'note') {
        const response = await noteChat.mutateAsync({
          messages: newMsgs.map((m) => ({ role: m.role, content: m.content })),
          context: {
            format: noteFormat,
            fieldDefinitions: getFieldDefs().map((f) => ({ key: f.key, label: f.label })),
            clientContext: {
              chiefComplaint,
              name: clientContext?.name,
              age: clientContext?.age,
              gender: clientContext?.gender,
              presentingIssues: clientContext?.presentingIssues,
              previousNoteSummary: lastNoteSummary,
              treatmentGoals: activePlan
                ? ((activePlan.goals as any[]) || []).map((g: any) => g.description)
                : undefined,
            },
            currentFields: {},
            attachmentTexts: attachments.length > 0 ? attachments.map((a) => a.content) : undefined,
          },
        });
        // Clear attachments after first send
        if (attachments.length > 0) setAttachments([]);

        if (response.type === 'suggestion') {
          const aMsg: ChatMessage = {
            role: 'assistant',
            content: `建议 [${response.field}]：${response.content}`,
            suggestion: response,
          };
          setMessages({ ...messages, [mode]: [...newMsgs, aMsg] });
          return;
        } else if (response.type === 'complete') {
          onNoteFieldsUpdate(response.fields, noteFormat);
          assistantContent = '全部字段已生成，请在右侧审阅和编辑。';
        } else {
          assistantContent = response.content;
        }
      } else if (mode === 'plan') {
        const response = await planSuggest.mutateAsync({
          chiefComplaint,
          sessionNotes: text,
          assessmentSummary,
          clientContext: clientContext ? {
            name: clientContext.name,
            age: clientContext.age,
            gender: clientContext.gender,
            presentingIssues: clientContext.presentingIssues,
          } : undefined,
        });
        onPlanSuggestion(response);
        assistantContent = `已生成建议方案，请在右侧查看。\n\n${response.rationale}`;
      } else if (mode === 'simulate') {
        const response = await simulateChat.mutateAsync({
          messages: newMsgs.map((m) => ({ role: m.role, content: m.content })),
          context: {
            clientProfile: {
              chiefComplaint,
              name: clientContext?.name,
              age: clientContext?.age,
              gender: clientContext?.gender,
              occupation: clientContext?.occupation,
              education: clientContext?.education,
              presentingIssues: clientContext?.presentingIssues,
              familyBackground: clientContext?.familyBackground,
            },
            sessionHistory: sessionHistorySummary,
          },
        });
        assistantContent = response.content;
      } else if (mode === 'supervise') {
        const goalData = activePlan ? {
          goals: ((activePlan.goals as any[]) || []).map((g: any) => ({ description: g.description, status: g.status })),
          approach: activePlan.approach,
        } : undefined;
        const response = await superviseChat.mutateAsync({
          messages: newMsgs.map((m) => ({ role: m.role, content: m.content })),
          context: {
            clientProfile: {
              chiefComplaint,
              name: clientContext?.name,
              age: clientContext?.age,
              gender: clientContext?.gender,
              presentingIssues: clientContext?.presentingIssues,
            },
            treatmentPlan: goalData,
            sessionHistory: sessionHistorySummary,
            assessmentSummary,
          },
        });
        assistantContent = response.content;
      }

      const finalMsgs = [...newMsgs, { role: 'assistant' as const, content: assistantContent }];
      setMessages({ ...messages, [mode]: finalMsgs });

      /*
       * BUG-009: 之前只对 simulate/supervise 归档, note/plan 漏归档:
       * 1. 4 mode 共用 chat UI 但只 2 个保留对话历史 — UX 不一致
       * 2. 督导 mode 右侧 panel 取 "最近笔记 / session history" 时, 因
       *    note 对话没存, 始终显示 "暂无会谈记录", 失去 context
       * 3. 用户无法回看 AI 推理过程 (e.g. "AI 当时为啥建议这个 SOAP 字段?")
       *
       * 改成 4 mode 全归档. 每个 mode 一条独立 ai_conversations 行,
       * 同 mode 多次发送追加到同一条 (conversationIds 内存 map 跟踪).
       */
      if (mode !== 'crisis') {
        const saveMsgs = finalMsgs.map((m) => ({ role: m.role, content: m.content }));
        const convId = conversationIds[mode];
        if (convId) {
          updateConversation.mutate({ id: convId, messages: saveMsgs });
        } else {
          const modeLabel = ({
            note: '笔记草稿',
            plan: '方案讨论',
            simulate: '模拟练习',
            supervise: '督导对话',
          } as const)[mode];
          const title = `${modeLabel} · ${new Date().toLocaleDateString('zh-CN')}`;
          createConversation.mutateAsync({ careEpisodeId: episodeId, mode, title }).then((conv) => {
            setConversationIds((prev) => ({ ...prev, [mode]: conv.id }));
            updateConversation.mutate({ id: conv.id, messages: saveMsgs });
          });
        }
      }
    } catch {
      setMessages({ ...messages, [mode]: [...newMsgs, { role: 'assistant', content: '抱歉，AI 服务暂时不可用。' }] });
    }
  };

  const handleAcceptSuggestion = (field: string, content: string) => {
    const fields: Record<string, string> = {};
    fields[field] = content;
    onNoteFieldsUpdate(fields, noteFormat);
    toast('已采纳', 'success');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Mode tabs */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b border-slate-100">
        {(Object.entries(modeConfig) as [WorkMode, typeof modeConfig.note][])
          .filter(([key]) => key !== 'crisis' || isCrisisEpisode)
          .map(([key, cfg]) => {
            const isCrisisTab = key === 'crisis';
            const activeClass = isCrisisTab
              ? 'bg-red-600 text-white'
              : 'bg-brand-600 text-white';
            return (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  mode === key ? activeClass : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {cfg.icon}
                {cfg.label}
              </button>
            );
          })}
      </div>

      {mode === 'crisis' ? (
        // Crisis mode: the chat area shows static guidance; the real action
        // happens in OutputPanel → CrisisChecklistPanel (right column).
        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <div className="text-sm font-medium text-red-700 mb-1">危机处置模式</div>
          <div className="text-xs text-slate-500 max-w-xs">
            请在右侧「危机处置清单」按步骤操作。系统不会自动联系任何人,所有对外沟通由您手动完成,系统只负责留痕。
          </div>
        </div>
      ) : (
      /* Chat messages */
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {currentMessages.length === 0 && (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">
              {mode === 'note' ? '📝' : mode === 'plan' ? '🎯' : mode === 'simulate' ? '🗣️' : '🎓'}
            </div>
            <div className="text-sm text-slate-500">
              {mode === 'note' && '描述这次会谈，AI 会帮你整理成笔记'}
              {mode === 'plan' && '和 AI 讨论治疗方向、目标和策略'}
              {mode === 'simulate' && '模拟来访者对话，练习咨询技巧'}
              {mode === 'supervise' && 'AI 督导会通过提问帮你反思个案'}
            </div>
          </div>
        )}

        {currentMessages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === 'user'
                ? 'bg-brand-600 text-white rounded-br-md'
                : 'bg-slate-100 text-slate-700 rounded-bl-md'
            }`}>
              {msg.suggestion ? (
                <div className="space-y-2">
                  <div className="text-xs font-medium bg-white/20 px-2 py-0.5 rounded inline-block">
                    {msg.suggestion.field}
                  </div>
                  <div className="whitespace-pre-wrap">{msg.suggestion.content}</div>
                  <div className="text-xs opacity-70">{msg.suggestion.rationale}</div>
                  <button
                    onClick={() => handleAcceptSuggestion(msg.suggestion!.field, msg.suggestion!.content)}
                    className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-200"
                  >
                    ✓ 采纳到右侧
                  </button>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              )}
            </div>
          </div>
        ))}

        {isPending && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-slate-500 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {mode === 'simulate' ? '来访者思考中...' : mode === 'supervise' ? '督导思考中...' : '思考中...'}
            </div>
          </div>
        )}
      </div>
      )}

      {/* Input */}
      {mode !== 'crisis' && (
      <div className="border-t border-slate-200 p-3 space-y-2">
        {/* Attachment preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((att, i) => (
              <div key={i} className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-lg text-xs">
                <Paperclip className="w-3 h-3" />
                <span className="truncate max-w-[120px]">{att.name}</span>
                <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-blue-400 hover:text-blue-600">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          {mode === 'note' && (
            <>
              <input ref={fileInputRef} type="file" accept=".txt,.md,.csv,.json,.docx" multiple className="hidden" onChange={handleFileSelect} />
              <button onClick={() => fileInputRef.current?.click()} title="上传会谈素材"
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50">
                <Paperclip className="w-4 h-4" />
              </button>
            </>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder={attachments.length > 0 ? '添加说明，或直接发送素材...' : config.placeholder}
            disabled={isPending}
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            onClick={handleSend}
            disabled={isPending || (!input.trim() && attachments.length === 0)}
            className="px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-500 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
      )}
    </div>
  );
});

