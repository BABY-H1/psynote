import React, { useState, useRef, useEffect } from 'react';
import { useCreateScaleChat } from '../../../api/useAI';
import { useCreateScale } from '../../../api/useScales';
import { Sparkles, Send, Loader2, ArrowLeft, Edit3 } from 'lucide-react';
import { useToast } from '../../../shared/components';

interface ScaleData {
  title: string;
  description: string;
  instructions: string;
  scoringMode: 'sum' | 'average';
  options: { label: string; value: number }[];
  items: { text: string; isReverseScored: boolean; dimensionIndex: number | null }[];
  dimensions: {
    name: string;
    description: string;
    calculationMethod: 'sum' | 'average';
    rules: {
      minScore: number;
      maxScore: number;
      label: string;
      description: string;
      advice: string;
      riskLevel: string;
    }[];
  }[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  scaleData?: ScaleData;
  scaleSummary?: string;
}

interface Props {
  onClose: () => void;
  onCreated: (scaleId: string) => void;
}

const WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  content:
    '你好！我是你的量表编制助手，可以帮你从零创建一份专业的心理测评量表。\n\n请告诉我你想创建什么样的量表？比如：\n- 你想测量什么心理特质或状态？\n- 目标人群是谁？\n- 在什么场景下使用？',
};

export function AIScaleCreator({ onClose, onCreated }: Props) {
  const { toast } = useToast();
  const chatMutation = useCreateScaleChat();
  const createScale = useCreateScale();

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isPending = chatMutation.isPending;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isPending) inputRef.current?.focus();
  }, [isPending]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text || isPending) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');

    const apiMessages = updated
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && !m.scaleData))
      .map((m) => ({ role: m.role, content: m.content }));

    chatMutation.mutate(
      { messages: apiMessages },
      {
        onSuccess: (data) => {
          if (data.type === 'scale') {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: data.summary,
                scaleData: data.scale,
                scaleSummary: data.summary,
              },
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: data.content },
            ]);
          }
        },
        onError: (err: unknown) => {
          // Surface server-side error message when available (e.g. "AI 调用超时
          // (320s, 上限 540s) — 请简化需求或重试") so the user knows whether to
          // retry as-is or shrink their request. Fallback to generic copy for
          // truly unknown errors (network blip, 5xx without body, etc.).
          const serverMsg =
            (err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string')
              ? (err as { message: string }).message
              : null;
          const shown = serverMsg && serverMsg.length < 200
            ? `抱歉，生成失败：${serverMsg}`
            : '抱歉，生成过程中出现了错误，请重试。';
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: shown },
          ]);
        },
      },
    );
  };

  const handleSaveAndEdit = (scaleData: ScaleData) => {
    createScale.mutate(
      {
        title: scaleData.title,
        description: scaleData.description,
        instructions: scaleData.instructions,
        scoringMode: scaleData.scoringMode,
        dimensions: scaleData.dimensions.map((d, i) => ({
          name: d.name,
          description: d.description,
          calculationMethod: d.calculationMethod,
          sortOrder: i,
          rules: d.rules.length > 0 ? d.rules : undefined,
        })),
        items: scaleData.items.map((item, i) => ({
          text: item.text,
          dimensionIndex: item.dimensionIndex ?? 0,
          isReverseScored: item.isReverseScored,
          options: scaleData.options,
          sortOrder: i,
        })),
      },
      {
        onSuccess: (created: any) => {
          toast('量表已创建', 'success');
          onCreated(created.id);
        },
        onError: () => {
          toast('保存失败，请重试', 'error');
        },
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl w-full mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h2 className="text-xl font-bold text-slate-900">AI 对话创建量表</h2>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i}>
            <div
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-brand-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>

            {/* Scale preview card */}
            {msg.scaleData && (
              <div className="mt-3 ml-0 max-w-[80%]">
                <div className="bg-white rounded-xl border-2 border-brand-200 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-brand-700">
                    <Sparkles className="w-4 h-4" />
                    <span className="text-sm font-semibold">量表已生成</span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-lg">
                    {msg.scaleData.title}
                  </h3>
                  {msg.scaleData.description && (
                    <p className="text-sm text-slate-500">{msg.scaleData.description}</p>
                  )}
                  <div className="flex flex-wrap gap-4 text-xs text-slate-500 pt-1">
                    <span>
                      维度: <strong className="text-slate-700">{msg.scaleData.dimensions.length}</strong>
                    </span>
                    <span>
                      题目: <strong className="text-slate-700">{msg.scaleData.items.length}</strong>
                    </span>
                    <span>
                      选项: <strong className="text-slate-700">{msg.scaleData.options.length}</strong>
                    </span>
                    <span>
                      计分:{' '}
                      <strong className="text-slate-700">
                        {msg.scaleData.scoringMode === 'sum' ? '求和' : '平均'}
                      </strong>
                    </span>
                  </div>
                  {msg.scaleData.dimensions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {msg.scaleData.dimensions.map((dim, di) => (
                        <span
                          key={di}
                          className="text-xs px-2.5 py-1 bg-brand-50 text-brand-700 rounded-full"
                        >
                          {dim.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleSaveAndEdit(msg.scaleData!)}
                      disabled={createScale.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition disabled:opacity-50"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      {createScale.isPending ? '创建中...' : '保存并进入编辑'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {isPending && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-400 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              AI 正在思考...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你的测评需求，或回复 AI 的问题..."
          rows={1}
          className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          disabled={isPending}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || isPending}
          className="px-4 py-3 bg-brand-600 text-white rounded-xl hover:bg-brand-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
