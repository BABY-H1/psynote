import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Loader2 } from 'lucide-react';

/**
 * AIChatPanel — 通用 AI 对话面板。
 *
 * 把目前散落在 SchemeDetail / ChatWorkspace 的 AI 对话面板提取为
 * 受控组件。父组件负责实际的发送动作（mutate），本组件只管：
 *  - 消息列表渲染
 *  - 输入框 + 发送按钮
 *  - "请先进入编辑态"的禁用蒙层
 *  - 上下文提示行（可选）
 *
 * 当前用法（Phase 4 之后）：
 *  - SchemeDetail 的 AI 对话（替换内联 AIChatPanel）
 *  - GroupInstanceDetail 内的 AI 对话（4a，新增）
 *  - CourseInstanceDetail 内的 AI 对话（4b，新增）
 *  - counseling ChatWorkspace 的对话部分（4d，可选）
 *
 * 设计要点：
 * 1. **完全受控**：messages / input / isPending 全部由父组件传入
 * 2. **flex-row-reverse 友好**：本身不假定挂在哪一侧，只是一个 column flex
 * 3. **disabled overlay**：当 `editing=false` 时显示半透明蒙层 + 提示文案
 * 4. **不直接调用 mutate**：通过 `onSend(text)` 回调把发送动作交给父组件
 */

export type AIChatRole = 'user' | 'assistant';

export interface AIChatMessage {
  role: AIChatRole;
  content: string;
  /** 标记 AI 回复是否已"应用"到右侧表单 */
  applied?: boolean;
}

interface Props {
  /** 标题，默认 "AI 助手" */
  title?: string;
  /** 标题旁边的图标，默认 Sparkles */
  icon?: React.ReactNode;
  /** 消息列表 */
  messages: AIChatMessage[];
  /** 是否处于"编辑态"，false 时禁用输入并显示蒙层 */
  editing: boolean;
  /** 是否正在发送（loading 气泡） */
  isPending?: boolean;
  /** 输入提交回调 */
  onSend: (text: string) => void;
  /** 输入框上方的上下文提示文字（可选） */
  contextHint?: string;
  /** 蒙层中的提示文字 */
  disabledHint?: string;
  /** 输入框 placeholder */
  placeholder?: string;
  /** 强制 textarea 高度（默认单行 input） */
  multiline?: boolean;
  className?: string;
}

export function AIChatPanel({
  title = 'AI 助手',
  icon,
  messages,
  editing,
  isPending = false,
  onSend,
  contextHint,
  disabledHint = '点击右上角「编辑」按钮，进入编辑态后即可与 AI 对话',
  placeholder,
  multiline = false,
  className = '',
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isPending]);

  const submit = () => {
    const text = input.trim();
    if (!text || !editing || isPending) return;
    setInput('');
    onSend(text);
  };

  return (
    <div className={`flex flex-col h-full ${className}`.trim()}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        {icon ?? <Sparkles className="w-4 h-4 text-amber-500" />}
        <span className="text-sm font-semibold text-slate-900">{title}</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 relative bg-slate-50">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[92%] rounded-2xl px-3.5 py-2 text-xs ${
                msg.role === 'user'
                  ? 'bg-brand-600 text-white rounded-br-md'
                  : 'bg-white text-slate-700 rounded-bl-md border border-slate-200'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.applied && (
                <div className="text-[10px] mt-1 opacity-70">已应用</div>
              )}
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
              {disabledHint}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-200 bg-white flex-shrink-0">
        {contextHint && <p className="text-xs text-slate-400 mb-1.5">{contextHint}</p>}
        <div className="flex gap-1.5">
          {multiline ? (
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={placeholder ?? (editing ? '输入修改意见...' : '请先点击编辑')}
              disabled={!editing || isPending}
              rows={2}
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:cursor-not-allowed resize-none"
            />
          ) : (
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={placeholder ?? (editing ? '输入修改意见...' : '请先点击编辑')}
              disabled={!editing || isPending}
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
            />
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!editing || isPending || !input.trim()}
            className="px-3 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            aria-label="发送"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
