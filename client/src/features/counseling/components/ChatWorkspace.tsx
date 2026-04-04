import React, { useState, useRef, useEffect } from 'react';
import {
  useNoteGuidanceChat, useSuggestTreatmentPlan,
  useSimulatedClient, useSupervision,
} from '../../../api/useAI';
import { useCreateSessionNote } from '../../../api/useCounseling';
import { useToast } from '../../../shared/components';
import { Send, Loader2, FileText, Target, Users, GraduationCap, Paperclip } from 'lucide-react';
import type { TreatmentPlan } from '@psynote/shared';
import { BUILT_IN_FORMATS } from './NoteFormatSelector';

export type WorkMode = 'note' | 'plan' | 'simulate' | 'supervise';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  suggestion?: { field: string; content: string; rationale: string };
}

const modeConfig: Record<WorkMode, { icon: React.ReactNode; label: string; placeholder: string; color: string }> = {
  note: { icon: <FileText className="w-3.5 h-3.5" />, label: '写笔记', placeholder: '描述这次会谈的情况...', color: 'brand' },
  plan: { icon: <Target className="w-3.5 h-3.5" />, label: '讨论方案', placeholder: '和 AI 讨论治疗计划...', color: 'teal' },
  simulate: { icon: <Users className="w-3.5 h-3.5" />, label: '模拟来访', placeholder: '开始咨询对话（你是咨询师）...', color: 'purple' },
  supervise: { icon: <GraduationCap className="w-3.5 h-3.5" />, label: '督导', placeholder: '和 AI 督导讨论你的个案...', color: 'amber' },
};

interface Props {
  episodeId: string;
  clientId: string;
  chiefComplaint?: string;
  currentRisk?: string;
  activePlan?: TreatmentPlan;
  onNoteFieldsUpdate: (fields: Record<string, string>, format: string) => void;
  onPlanSuggestion: (data: any) => void;
  onModeChange?: (mode: WorkMode) => void;
  onNoteFormatChange?: (format: string) => void;
}

export function ChatWorkspace({
  episodeId, clientId, chiefComplaint, currentRisk, activePlan,
  onNoteFieldsUpdate, onPlanSuggestion, onModeChange, onNoteFormatChange,
}: Props) {
  const [mode, setModeInternal] = useState<WorkMode>('note');
  const setMode = (m: WorkMode) => {
    setModeInternal(m);
    onModeChange?.(m);
  };
  const [messages, setMessages] = useState<Record<WorkMode, ChatMessage[]>>({
    note: [], plan: [], simulate: [], supervise: [],
  });
  const [input, setInput] = useState('');
  const [noteFormat, setNoteFormat] = useState('soap');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

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

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isPending) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
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
            clientContext: { chiefComplaint },
            currentFields: {},
          },
        });

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
          riskLevel: currentRisk || 'level_1',
          sessionNotes: text,
        });
        onPlanSuggestion(response);
        assistantContent = `已生成建议方案，请在右侧查看。\n\n${response.rationale}`;
      } else if (mode === 'simulate') {
        const response = await simulateChat.mutateAsync({
          messages: newMsgs.map((m) => ({ role: m.role, content: m.content })),
          context: { clientProfile: { chiefComplaint, riskLevel: currentRisk } },
        });
        assistantContent = response.content;
      } else if (mode === 'supervise') {
        const goalData = activePlan ? {
          goals: ((activePlan.goals as any[]) || []).map((g: any) => ({ description: g.description, status: g.status })),
          approach: activePlan.approach,
        } : undefined;
        const response = await superviseChat.mutateAsync({
          messages: newMsgs.map((m) => ({ role: m.role, content: m.content })),
          context: { clientProfile: { chiefComplaint, riskLevel: currentRisk }, treatmentPlan: goalData },
        });
        assistantContent = response.content;
      }

      setMessages({ ...messages, [mode]: [...newMsgs, { role: 'assistant', content: assistantContent }] });
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
        {(Object.entries(modeConfig) as [WorkMode, typeof modeConfig.note][]).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              mode === key
                ? 'bg-brand-600 text-white'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {cfg.icon}
            {cfg.label}
          </button>
        ))}

        {/* Note format selector (only in note mode) */}
        {mode === 'note' && (
          <select
            value={noteFormat}
            onChange={(e) => { setNoteFormat(e.target.value); onNoteFormatChange?.(e.target.value); }}
            className="ml-auto px-2 py-1 border border-slate-200 rounded text-xs text-slate-600"
          >
            <option value="soap">SOAP</option>
            <option value="dap">DAP</option>
            <option value="birp">BIRP</option>
          </select>
        )}
      </div>

      {/* Chat messages */}
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

      {/* Input */}
      <div className="border-t border-slate-200 p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder={config.placeholder}
            disabled={isPending}
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            onClick={handleSend}
            disabled={isPending || !input.trim()}
            className="px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-500 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

