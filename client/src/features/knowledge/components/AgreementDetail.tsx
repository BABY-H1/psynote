import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Edit3, Trash2, Save, Sparkles, Send, Loader2,
} from 'lucide-react';
import type { ConsentTemplate } from '@psynote/shared';
import {
  useConsentTemplates, useUpdateConsentTemplate, useDeleteConsentTemplate,
} from '../../../api/useConsent';
import { useCreateAgreementChat } from '../../../api/useAI';
import { PageLoading, useToast } from '../../../shared/components';

const CONSENT_TYPE_LABELS: Record<string, string> = {
  treatment: '咨询知情同意',
  data_collection: '数据采集同意',
  ai_processing: 'AI 辅助分析同意',
  data_sharing: '数据共享同意',
  research: '研究用途同意',
};

interface EditState {
  title: string;
  consentType: string;
  content: string;
}

function templateToEditState(t: ConsentTemplate): EditState {
  return {
    title: t.title || '',
    consentType: t.consentType || 'treatment',
    content: t.content || '',
  };
}

interface Props {
  templateId: string;
  onBack: () => void;
  initialEditing?: boolean;
}

export function AgreementDetail({ templateId, onBack, initialEditing = false }: Props) {
  const { data: templates } = useConsentTemplates();
  const updateTemplate = useUpdateConsentTemplate();
  const deleteTemplate = useDeleteConsentTemplate();
  const { toast } = useToast();

  const template = templates?.find((t) => t.id === templateId);

  const [editing, setEditing] = useState(initialEditing);
  const [editData, setEditData] = useState<EditState | null>(null);

  useEffect(() => {
    if (initialEditing && template && !editData) {
      setEditData(templateToEditState(template));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditing, template]);

  const handleEdit = useCallback(() => {
    if (!template) return;
    setEditData(templateToEditState(template));
    setEditing(true);
  }, [template]);

  const handleCancel = () => {
    setEditing(false);
    setEditData(null);
  };

  const handleSave = async () => {
    if (!editData || !template) return;
    if (!editData.title.trim() || !editData.content.trim()) {
      toast('标题和内容不能为空', 'error');
      return;
    }
    try {
      await updateTemplate.mutateAsync({
        templateId,
        title: editData.title,
        consentType: editData.consentType,
        content: editData.content,
      });
      toast('协议已保存', 'success');
      setEditing(false);
      setEditData(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    }
  };

  const handleDelete = async () => {
    if (!template) return;
    if (!confirm(`确定删除"${template.title}"？`)) return;
    try {
      await deleteTemplate.mutateAsync(templateId);
      toast('已删除', 'success');
      onBack();
    } catch {
      toast('删除失败', 'error');
    }
  };

  // AI: apply changes from chat
  const applyAIChange = useCallback(
    (newState: Partial<EditState>) => {
      setEditData((prev) => (prev ? { ...prev, ...newState } : prev));
      toast('AI 已更新协议', 'success');
    },
    [toast],
  );

  if (!template) return <PageLoading text="加载协议..." />;

  const data: EditState = editing && editData ? editData : templateToEditState(template);

  return (
    <div className="flex -m-6" style={{ height: 'calc(100vh - 5rem)' }}>
      {/* LEFT: Content */}
      <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
          <h2 className="text-sm font-semibold text-slate-900 truncate">
            {data.title || '未命名协议'}
          </h2>

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
                  disabled={updateTemplate.isPending || !editData}
                  className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {updateTemplate.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中...
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" /> 保存
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                  {CONSENT_TYPE_LABELS[data.consentType] || data.consentType}
                </span>
                <button
                  onClick={handleEdit}
                  className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" /> 编辑
                </button>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> 删除
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-6 space-y-4">
            {/* Agreement info */}
            <CardSection title="协议信息">
              <Field label="协议标题" required>
                {editing ? (
                  <input
                    value={data.title}
                    onChange={(e) =>
                      setEditData((p) => (p ? { ...p, title: e.target.value } : p))
                    }
                    placeholder="如：心理咨询知情同意书"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                ) : (
                  <p className="text-sm text-slate-700">
                    {data.title || <span className="text-slate-300 italic">未命名</span>}
                  </p>
                )}
              </Field>

              <Field label="协议类型" required>
                {editing ? (
                  <select
                    value={data.consentType}
                    onChange={(e) =>
                      setEditData((p) => (p ? { ...p, consentType: e.target.value } : p))
                    }
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    {Object.entries(CONSENT_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-slate-700">
                    {CONSENT_TYPE_LABELS[data.consentType] || data.consentType}
                  </p>
                )}
              </Field>
            </CardSection>

            {/* Agreement body */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">协议正文</h3>
                <span className="text-xs text-slate-400">{data.content.length} 字</span>
              </div>
              <div className="p-4">
                {editing ? (
                  <textarea
                    value={data.content}
                    onChange={(e) =>
                      setEditData((p) => (p ? { ...p, content: e.target.value } : p))
                    }
                    placeholder="输入协议完整内容..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-brand-500 resize-y"
                    style={{ minHeight: '60vh' }}
                  />
                ) : data.content ? (
                  <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {data.content}
                  </div>
                ) : (
                  <p className="text-xs text-slate-300 italic">未填写</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: AI Chat panel */}
      <div className="w-[420px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-slate-900 truncate">{data.title || '协议'}</h3>
        </div>

        <AgreementAIChatPanel
          editing={editing}
          currentState={data}
          onApply={applyAIChange}
        />
      </div>
    </div>
  );
}

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

// ─── AI Chat Panel ───────────────────────────────────────────

type ChatMsg = { role: 'user' | 'assistant'; content: string };

function AgreementAIChatPanel({
  editing,
  currentState,
  onApply,
}: {
  editing: boolean;
  currentState: EditState;
  onApply: (newState: Partial<EditState>) => void;
}) {
  const chatMutation = useCreateAgreementChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content:
        '我可以帮你修改和完善这份协议。\n\n比如你可以说：\n• "在保密条款中加入录音录像相关说明"\n• "增加一个紧急联系人条款"\n• "把语气改得更正式一些"',
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
      content: `当前协议内容如下：\n\n标题：${currentState.title}\n类型：${currentState.consentType}\n\n${currentState.content}`,
    };

    const apiMessages = [contextMsg, ...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    chatMutation.mutate(
      { messages: apiMessages },
      {
        onSuccess: (data) => {
          if (data.type === 'agreement') {
            const a = data.agreement;
            onApply({
              title: a.title || currentState.title,
              consentType: a.consentType || currentState.consentType,
              content: a.content || currentState.content,
            });
            setMessages((p) => [
              ...p,
              { role: 'assistant', content: data.summary || '已根据你的描述更新协议，左侧已刷新。' },
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
              点击右上角「编辑」按钮，进入编辑态后即可与 AI 对话修改协议
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
