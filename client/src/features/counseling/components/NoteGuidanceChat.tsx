import React, { useState, useRef, useEffect } from 'react';
import { useNoteGuidanceChat } from '../../../api/useAI';
import { Sparkles, Send, Loader2, CheckCircle2, Edit3, X, ChevronDown, ChevronUp } from 'lucide-react';
import type { NoteFieldDefinition } from '@psynote/shared';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  suggestion?: {
    field: string;
    fieldLabel: string;
    content: string;
    rationale: string;
  };
}

interface Props {
  format: string;
  fieldDefinitions: NoteFieldDefinition[];
  currentFields: Record<string, string>;
  clientContext?: {
    chiefComplaint?: string;
    treatmentGoals?: string[];
    previousNoteSummary?: string;
  };
  attachmentTexts?: string[];
  onAcceptSuggestion: (field: string, content: string) => void;
  onAcceptAll: (fields: Record<string, string>, summary: string) => void;
}

export function NoteGuidanceChat({
  format, fieldDefinitions, currentFields, clientContext, attachmentTexts,
  onAcceptSuggestion, onAcceptAll,
}: Props) {
  const guidanceChat = useNoteGuidanceChat();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Start conversation automatically when panel opens
  useEffect(() => {
    if (messages.length === 0) {
      const hasAttachments = attachmentTexts && attachmentTexts.length > 0;
      const hasFields = Object.values(currentFields).some((v) => v?.trim());

      let greeting: string;
      if (hasAttachments) {
        greeting = '我有一些会谈素材，请帮我整理成笔记。';
      } else if (hasFields) {
        greeting = '我已经填了部分内容，请帮我补充剩余字段。';
      } else {
        greeting = '请引导我完成这次会谈的笔记。';
      }

      handleSend(greeting);
    }
  }, []); // eslint-disable-line

  const handleSend = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg) return;

    const userMsg: ChatMessage = { role: 'user', content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');

    try {
      const response = await guidanceChat.mutateAsync({
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        context: {
          format,
          fieldDefinitions: fieldDefinitions.map((f) => ({ key: f.key, label: f.label })),
          clientContext,
          currentFields,
          attachmentTexts,
        },
      });

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.type === 'message' ? response.content :
          response.type === 'suggestion' ? `建议 [${response.fieldLabel}]：${response.content}` :
          '全部字段已完成，请审阅。',
        suggestion: response.type === 'suggestion' ? response : undefined,
      };

      setMessages([...newMessages, assistantMsg]);

      if (response.type === 'complete') {
        onAcceptAll(response.fields, response.summary);
      }
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: '抱歉，AI 服务暂时不可用。' }]);
    }
  };

  return (
    <div className="rounded-lg border border-brand-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-brand-50 hover:bg-brand-100 transition"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-brand-700">
          <Sparkles className="w-4 h-4" />
          AI 协作助手
        </span>
        {expanded ? <ChevronUp className="w-4 h-4 text-brand-500" /> : <ChevronDown className="w-4 h-4 text-brand-500" />}
      </button>

      {expanded && (
        <div className="bg-white">
          {/* Chat messages */}
          <div ref={scrollRef} className="h-64 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}>
                  {msg.suggestion ? (
                    <SuggestionBubble
                      suggestion={msg.suggestion}
                      onAccept={() => onAcceptSuggestion(msg.suggestion!.field, msg.suggestion!.content)}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}
                </div>
              </div>
            ))}

            {guidanceChat.isPending && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-lg px-3 py-2 text-sm text-slate-500 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> 思考中...
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-slate-100 p-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder="输入回复..."
              disabled={guidanceChat.isPending}
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={guidanceChat.isPending || !input.trim()}
              className="px-3 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-500 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestionBubble({
  suggestion,
  onAccept,
}: {
  suggestion: { field: string; fieldLabel: string; content: string; rationale: string };
  onAccept: () => void;
}) {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-brand-700 bg-brand-50 px-2 py-0.5 rounded inline-block">
        {suggestion.fieldLabel}
      </div>
      <div className="whitespace-pre-wrap">{suggestion.content}</div>
      <div className="text-xs text-slate-400 italic">{suggestion.rationale}</div>
      {!accepted ? (
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={() => { onAccept(); setAccepted(true); }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200"
          >
            <CheckCircle2 className="w-3 h-3" /> 采纳
          </button>
        </div>
      ) : (
        <div className="text-xs text-emerald-600 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> 已采纳
        </div>
      )}
    </div>
  );
}
