import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import {
  useRefineSchemeOverall,
  useRefineSessionDetail,
  useGenerateSessionDetail,
} from '../../../../api/useAI';
import { schemeToEditData } from './schemeEditState';
import type { EditData, EditSession } from './types';
import { stripSessionPrefix } from './types';

type AIChatMsg = { role: 'user' | 'assistant'; content: string };

/**
 * AI chat sidebar. Routes: overview → refineSchemeOverall (replaces
 * whole scheme); session → refineSessionDetail (patches that session).
 * Disabled overlay when editing=false.
 */
export function SchemeAIChatPanel({
  scheme,
  editData,
  editing,
  activeTab,
  onApplyScheme,
  onApplySession,
}: {
  scheme: any;
  editData: EditData | null;
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

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const isPending = refineScheme.isPending || refineSession.isPending || generateDetail.isPending;
  const currentScheme = editData || schemeToEditData(scheme);

  const contextHint =
    activeTab !== 'overview' && activeTab < currentScheme.sessions.length
      ? `当前: 第${activeTab + 1}次 — ${stripSessionPrefix(currentScheme.sessions[activeTab]?.title || '')}`
      : '当前: 总体方案';

  const handleSend = () => {
    if (!editing) return;
    const text = input.trim();
    if (!text || isPending) return;
    setInput('');
    setMessages((p) => [...p, { role: 'user', content: text }]);

    if (selectedSessionIndex !== null && selectedSessionIndex < currentScheme.sessions.length) {
      const si = selectedSessionIndex;
      const currentSession = currentScheme.sessions[si];
      refineSession.mutate(
        {
          currentSession: currentSession as any,
          overallScheme: currentScheme as any,
          sessionIndex: si,
          instruction: text,
        },
        {
          onSuccess: (r: any) => {
            onApplySession(si, r);
            setMessages((p) => [...p, { role: 'assistant', content: `已更新第${si + 1}次活动，右侧已刷新。` }]);
          },
          onError: () => setMessages((p) => [...p, { role: 'assistant', content: '修改失败，请重试。' }]),
        },
      );
    } else {
      refineScheme.mutate(
        { currentScheme: currentScheme as any, instruction: text },
        {
          onSuccess: (r: any) => {
            const newData: EditData = { ...schemeToEditData(r), visibility: editData?.visibility || 'personal' };
            onApplyScheme(newData);
            setMessages((p) => [
              ...p,
              { role: 'assistant', content: `已更新方案（${newData.sessions.length}次活动），右侧已刷新。` },
            ]);
          },
          onError: () => setMessages((p) => [...p, { role: 'assistant', content: '修改失败，请重试。' }]),
        },
      );
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
        {isPending && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-bl-md px-3.5 py-2 text-xs text-slate-500 flex items-center gap-1.5 border border-slate-200">
              <Loader2 className="w-3 h-3 animate-spin" /> AI 思考中...
            </div>
          </div>
        )}

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
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())
            }
            placeholder={editing ? '输入修改意见...' : '请先点击编辑'}
            disabled={!editing || isPending}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!editing || isPending || !input.trim()}
            className="px-3 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}
