import React, { useState, useRef, useEffect } from 'react';
import {
  useConsentTemplates, useCreateConsentTemplate,
  useUpdateConsentTemplate, useDeleteConsentTemplate,
} from '../../../api/useConsent';
import { useExtractAgreement, useCreateAgreementChat } from '../../../api/useAI';
import { PageLoading, useToast } from '../../../shared/components';
import { Edit3, Trash2, FileCheck, Eye, EyeOff, Upload, Sparkles, Loader2, Send, ArrowLeft } from 'lucide-react';

const consentTypeLabels: Record<string, string> = {
  treatment: '咨询知情同意',
  data_collection: '数据采集同意',
  ai_processing: 'AI辅助分析同意',
  data_sharing: '数据共享同意',
  research: '研究用途同意',
};

type ViewMode = 'list' | 'import' | 'ai';

export function AgreementLibrary() {
  const { data: templates, isLoading } = useConsentTemplates();
  const deleteTemplate = useDeleteConsentTemplate();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  if (viewMode === 'import') {
    return <AgreementImporter onClose={() => setViewMode('list')} />;
  }
  if (viewMode === 'ai') {
    return <AgreementAICreator onClose={() => setViewMode('list')} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          管理机构的协议模板，在个案工作台中可直接选用发送给来访者
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('import')}
            className="px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" /> 文本导入
          </button>
          <button
            onClick={() => setViewMode('ai')}
            className="px-3 py-2 border border-amber-200 text-amber-700 bg-amber-50 rounded-lg text-sm font-medium hover:bg-amber-100 flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" /> AI 生成
          </button>
        </div>
      </div>

      {editingId && (
        <AgreementForm
          editingTemplate={templates?.find((t) => t.id === editingId)}
          onDone={() => setEditingId(null)}
        />
      )}

      {isLoading ? <PageLoading /> : !templates || templates.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">
          暂无协议模板，点击上方按钮创建
        </div>
      ) : (
        <div className="grid gap-3">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-brand-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-slate-900">{t.title}</span>
                    <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                      {consentTypeLabels[t.consentType] || t.consentType}
                    </span>
                    {t.isDefault && <span className="text-xs text-brand-600">默认</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.content.slice(0, 100)}...</p>
                </div>
                <div className="flex items-center gap-1 ml-3">
                  <button
                    onClick={() => setPreviewId(previewId === t.id ? null : t.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
                    title="预览"
                  >
                    {previewId === t.id ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => setEditingId(t.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
                    title="编辑"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm(`确定删除"${t.title}"？`)) {
                        try { await deleteTemplate.mutateAsync(t.id); toast('已删除', 'success'); }
                        catch { toast('删除失败', 'error'); }
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {previewId === t.id && (
                <div className="mt-3 pt-3 border-t border-slate-100 bg-slate-50 rounded-lg p-3 max-h-60 overflow-y-auto">
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{t.content}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgreementForm({ editingTemplate, onDone }: {
  editingTemplate?: any;
  onDone: () => void;
}) {
  const createTemplate = useCreateConsentTemplate();
  const updateTemplate = useUpdateConsentTemplate();
  const { toast } = useToast();
  const [title, setTitle] = useState(editingTemplate?.title || '');
  const [consentType, setConsentType] = useState(editingTemplate?.consentType || 'treatment');
  const [content, setContent] = useState(editingTemplate?.content || '');
  const [isDefault, setIsDefault] = useState(editingTemplate?.isDefault || false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTemplate) {
        await updateTemplate.mutateAsync({
          templateId: editingTemplate.id,
          title, consentType, content, isDefault,
        });
        toast('协议模板已更新', 'success');
      } else {
        await createTemplate.mutateAsync({ title, consentType, content, isDefault });
        toast('协议模板已创建', 'success');
      }
      onDone();
    } catch {
      toast('操作失败', 'error');
    }
  };

  const isPending = createTemplate.isPending || updateTemplate.isPending;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-900 mb-4">
        {editingTemplate ? '编辑协议模板' : '新建协议模板'}
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">模板标题 *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required
              placeholder="如：咨询知情同意书"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">协议类型 *</label>
            <select value={consentType} onChange={(e) => setConsentType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              {Object.entries(consentTypeLabels).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">协议正文 *</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} required
            rows={10} placeholder="输入协议完整内容..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)}
            className="rounded text-brand-600" />
          <span className="text-xs text-slate-600">设为默认模板（开案时自动推荐）</span>
        </label>

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onDone}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">取消</button>
          <button type="submit" disabled={isPending || !title || !content}
            className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50">
            {isPending ? '保存中...' : editingTemplate ? '更新' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Agreement Importer (Text Import + AI Extract) ─────────────

function AgreementImporter({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const extractAgreement = useExtractAgreement();
  const createTemplate = useCreateConsentTemplate();
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ title: string; consentType: string; content: string; sections: { heading: string; body: string }[] } | null>(null);

  const handleExtract = () => {
    if (!text.trim()) return;
    extractAgreement.mutate({ content: text }, {
      onSuccess: (data) => setResult(data),
      onError: () => toast('识别失败，请检查文本内容后重试', 'error'),
    });
  };

  const handleSave = () => {
    if (!result) return;
    createTemplate.mutate({
      title: result.title,
      consentType: result.consentType,
      content: result.content,
      isDefault: false,
    }, {
      onSuccess: () => { toast('协议模板导入成功', 'success'); onClose(); },
      onError: () => toast('保存失败', 'error'),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><ArrowLeft className="w-5 h-5" /></button>
        <Sparkles className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-bold text-slate-900">文本导入协议</h3>
      </div>

      {!result ? (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">粘贴协议文本，AI 会自动识别结构</p>
            <p className="text-amber-600">支持：知情同意书、数据采集协议、研究参与协议等</p>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            rows={12} placeholder="在此粘贴协议文本..."
            className="w-full border border-slate-200 rounded-xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <div className="flex justify-end">
            <button onClick={handleExtract} disabled={!text.trim() || extractAgreement.isPending}
              className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5">
              {extractAgreement.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> AI 识别中...</> : <><Sparkles className="w-4 h-4" /> 开始识别</>}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-2 text-green-700">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-semibold">识别完成，请确认</span>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <div><span className="text-xs text-slate-400">标题</span><p className="text-sm font-semibold text-slate-900">{result.title}</p></div>
              <div><span className="text-xs text-slate-400">类型</span><p className="text-sm text-slate-700">{consentTypeLabels[result.consentType] || result.consentType}</p></div>
              <div><span className="text-xs text-slate-400">章节数</span><p className="text-sm text-slate-700">{result.sections.length} 个章节</p></div>
            </div>
            {result.sections.length > 0 && (
              <div>
                <span className="text-xs text-slate-400 mb-2 block">章节预览</span>
                <div className="space-y-1">
                  {result.sections.map((s, i) => (
                    <div key={i} className="text-sm text-slate-600 flex gap-2">
                      <span className="text-slate-400">{i + 1}.</span>
                      <span className="font-medium">{s.heading}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="max-h-40 overflow-y-auto bg-slate-50 rounded-lg p-3 text-xs text-slate-600 whitespace-pre-wrap">
              {result.content.slice(0, 500)}{result.content.length > 500 && '...'}
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setResult(null)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">重新识别</button>
            <button onClick={handleSave} disabled={createTemplate.isPending}
              className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50">
              {createTemplate.isPending ? '保存中...' : '确认导入'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agreement AI Creator (Chat-based) ─────────────────────────

function AgreementAICreator({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const chatMutation = useCreateAgreementChat();
  const createTemplate = useCreateConsentTemplate();
  const scrollRef = useRef<HTMLDivElement>(null);

  type ChatMsg = { role: 'user' | 'assistant'; content: string; agreement?: { title: string; consentType: string; content: string } };
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', content: '你好！我可以帮你生成专业的协议模板。\n\n请问你需要什么类型的协议？比如：\n• 咨询知情同意书\n• 数据采集同意书\n• AI辅助分析同意书\n• 研究参与同意书' },
  ]);
  const [input, setInput] = useState('');

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

    const apiMessages = updated
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && !m.agreement))
      .map((m) => ({ role: m.role, content: m.content }));

    chatMutation.mutate({ messages: apiMessages }, {
      onSuccess: (data) => {
        if (data.type === 'agreement') {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.summary, agreement: data.agreement }]);
        } else {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]);
        }
      },
      onError: () => setMessages((prev) => [...prev, { role: 'assistant', content: '抱歉，AI 服务暂时不可用。' }]),
    });
  };

  const handleSaveAgreement = (agreement: { title: string; consentType: string; content: string }) => {
    createTemplate.mutate({ ...agreement, isDefault: false }, {
      onSuccess: () => { toast('协议模板已创建', 'success'); onClose(); },
      onError: () => toast('保存失败', 'error'),
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)]">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><ArrowLeft className="w-5 h-5" /></button>
        <Sparkles className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-bold text-slate-900">AI 生成协议</h3>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 mb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === 'user' ? 'bg-brand-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-700 rounded-bl-md'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.agreement && (
                <div className="mt-3 bg-white rounded-lg border border-green-200 p-3 space-y-2">
                  <div className="text-xs font-semibold text-green-700">生成的协议模板</div>
                  <div className="text-sm font-medium text-slate-900">{msg.agreement.title}</div>
                  <div className="text-xs text-slate-500">{consentTypeLabels[msg.agreement.consentType] || msg.agreement.consentType}</div>
                  <div className="text-xs text-slate-500 max-h-20 overflow-y-auto">{msg.agreement.content.slice(0, 200)}...</div>
                  <button onClick={() => handleSaveAgreement(msg.agreement!)}
                    disabled={createTemplate.isPending}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-500 disabled:opacity-50">
                    {createTemplate.isPending ? '保存中...' : '保存此协议'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-slate-500 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> 思考中...
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
          placeholder="描述你需要的协议..." disabled={chatMutation.isPending}
          className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        <button onClick={handleSend} disabled={chatMutation.isPending || !input.trim()}
          className="px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-500 disabled:opacity-50">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
