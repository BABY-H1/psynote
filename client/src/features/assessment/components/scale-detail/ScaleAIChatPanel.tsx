import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { useCreateScaleChat } from '../../../../api/useAI';
import type { EditState } from './types';

type ChatMsg = { role: 'user' | 'assistant'; content: string };

/**
 * Right-sidebar AI assistant for scale editing.
 *
 * Contract: the host component flips the whole panel into a disabled
 * state when `editing=false` (we render a semi-transparent overlay);
 * on send, we dump the current scale JSON as the first "context" user
 * message so the model has the full state. When the model returns a
 * `{type:'scale'}` payload, we call `onApply` with a partial EditState;
 * plain `{type:'message'}` replies just echo into the bubble stream.
 */
export function ScaleAIChatPanel({
  editing,
  currentState,
  onApply,
}: {
  editing: boolean;
  currentState: EditState;
  onApply: (newState: Partial<EditState>) => void;
}) {
  const chatMutation = useCreateScaleChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content:
        '我可以帮你修改和完善量表。\n\n比如你可以说：\n• "增加一个关于焦虑症状的维度"\n• "把第 3 题改为反向计分"\n• "添加一条 15-20 分对应中度的解读规则"',
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

    const contextMsg = {
      role: 'user' as const,
      content: `当前量表的完整结构如下，请基于这个结构进行修改：\n\n${JSON.stringify(
        {
          title: currentState.title,
          description: currentState.description,
          instructions: currentState.instructions,
          scoringMode: currentState.scoringMode,
          dimensions: currentState.dimensions.map((d) => ({
            name: d.name,
            description: d.description,
            calculationMethod: d.calculationMethod,
            rules: d.rules,
          })),
          items: currentState.items.map((it) => ({
            text: it.text,
            dimensionIndex: it.dimensionIndex,
            isReverseScored: it.isReverseScored,
          })),
          options: currentState.options,
        },
        null,
        2,
      )}`,
    };

    const apiMessages = [contextMsg, ...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    chatMutation.mutate(
      { messages: apiMessages },
      {
        onSuccess: (data) => {
          if (data.type === 'scale') {
            const s = data.scale;
            onApply({
              title: s.title || currentState.title,
              description: s.description || currentState.description,
              instructions: s.instructions || currentState.instructions,
              scoringMode: s.scoringMode || currentState.scoringMode,
              options: s.options.map((o) => ({ label: o.label, value: o.value })),
              dimensions: s.dimensions.map((d) => ({
                name: d.name,
                description: d.description || '',
                calculationMethod: d.calculationMethod || 'sum',
                rules: (d.rules || []).map((r) => ({
                  minScore: Number(r.minScore) || 0,
                  maxScore: Number(r.maxScore) || 0,
                  label: r.label,
                  description: r.description || '',
                  advice: r.advice || '',
                  riskLevel: r.riskLevel || '',
                })),
              })),
              items: s.items.map((it) => ({
                text: it.text,
                dimensionIndex: it.dimensionIndex ?? 0,
                isReverseScored: it.isReverseScored,
              })),
            });
            setMessages((p) => [
              ...p,
              { role: 'assistant', content: data.summary || '已根据你的描述更新量表，左侧已刷新。' },
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
              点击右上角「编辑」按钮，进入编辑态后即可与 AI 对话修改量表
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-200 bg-white">
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())
            }
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
