import React, { useState, useRef, useEffect } from 'react';
import type { ConsentTemplate } from '@psynote/shared';
import {
  useConsentTemplates, useCreateConsentTemplate,
  useUpdateConsentTemplate, useDeleteConsentTemplate,
} from '../../../api/useConsent';
import { useExtractAgreement, useCreateAgreementChat } from '../../../api/useAI';
import { PageLoading, useToast } from '../../../shared/components';
import {
  Edit3, Trash2, FileCheck, Eye, EyeOff, Upload, Sparkles, Loader2, Send,
  ArrowLeft, FileText, Check,
} from 'lucide-react';

const consentTypeLabels: Record<string, string> = {
  treatment: '咨询知情同意',
  data_collection: '数据采集同意',
  ai_processing: 'AI辅助分析同意',
  data_sharing: '数据共享同意',
  research: '研究用途同意',
};

type PrefillData = { title: string; consentType: string; content: string };
type ChatMsg = { role: 'user' | 'assistant'; content: string };
type ViewMode = 'list' | 'import' | 'ai' | 'editor';

// ─── Main Component ──────────────────────────────────────────────

export function AgreementLibrary() {
  const { data: templates, isLoading } = useConsentTemplates();
  const deleteTemplate = useDeleteConsentTemplate();
  const { toast } = useToast();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingTemplate, setEditingTemplate] = useState<ConsentTemplate | null>(null);
  const [prefillData, setPrefillData] = useState<PrefillData | null>(null);

  const goToEditor = (template?: ConsentTemplate, prefill?: PrefillData) => {
    setEditingTemplate(template || null);
    setPrefillData(prefill || null);
    setViewMode('editor');
  };

  const goToList = () => {
    setViewMode('list');
    setEditingTemplate(null);
    setPrefillData(null);
  };

  if (viewMode === 'import') {
    return (
      <AgreementImporter
        onClose={goToList}
        onEditResult={(data) => {
          goToEditor(undefined, data);
        }}
      />
    );
  }
  if (viewMode === 'ai') {
    return (
      <AgreementAICreator
        onClose={goToList}
        onEditAgreement={(data) => {
          goToEditor(undefined, data);
        }}
      />
    );
  }
  if (viewMode === 'editor') {
    return (
      <AgreementEditor
        editingTemplate={editingTemplate}
        prefillData={prefillData}
        onDone={goToList}
      />
    );
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
                    onClick={() => goToEditor(t)}
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

// ─── Agreement Editor (Split Pane: AI Chat + Editable Content) ───

function AgreementEditor({ editingTemplate, prefillData, onDone }: {
  editingTemplate?: ConsentTemplate | null;
  prefillData?: PrefillData | null;
  onDone: () => void;
}) {
  const createTemplate = useCreateConsentTemplate();
  const updateTemplate = useUpdateConsentTemplate();
  const chatMutation = useCreateAgreementChat();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const initial = editingTemplate || prefillData;
  const [title, setTitle] = useState(initial?.title || '');
  const [consentType, setConsentType] = useState(initial?.consentType || 'treatment');
  const [content, setContent] = useState(initial?.content || '');
  const [showSettings, setShowSettings] = useState(false);

  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', content: editingTemplate
      ? '你好！我可以帮你修改这份协议。\n\n比如你可以说：\n• "在保密条款中加入录音录像相关说明"\n• "增加一个关于紧急联系人的条款"\n• "把语气改得更正式一些"'
      : '你好！我可以帮你完善这份协议。\n\n如需修改，直接告诉我：\n• "保密条款需要增加关于录音录像的说明"\n• "加入紧急联系人相关条款"\n• "把语气改得更正式一些"'
    },
  ]);
  const [input, setInput] = useState('');

  const isPending = createTemplate.isPending || updateTemplate.isPending;

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

    // Include current content as context for AI
    const contextMsg = { role: 'user' as const, content: `当前协议内容如下：\n\n${content}` };
    const apiMessages = [contextMsg, ...updated.map((m) => ({ role: m.role, content: m.content }))];

    chatMutation.mutate({ messages: apiMessages }, {
      onSuccess: (data) => {
        if (data.type === 'agreement') {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.summary }]);
          // Update the editable content with AI's revision
          setContent(data.agreement.content);
          if (data.agreement.title) setTitle(data.agreement.title);
          if (data.agreement.consentType) setConsentType(data.agreement.consentType);
        } else {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]);
        }
      },
      onError: () => setMessages((prev) => [...prev, { role: 'assistant', content: '抱歉，AI 服务暂时不可用。' }]),
    });
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    try {
      if (editingTemplate) {
        await updateTemplate.mutateAsync({
          templateId: editingTemplate.id,
          title, consentType, content,
        });
        toast('协议模板已更新', 'success');
      } else {
        await createTemplate.mutateAsync({ title, consentType, content });
        toast('协议模板已创建', 'success');
      }
      onDone();
    } catch {
      toast('操作失败', 'error');
    }
  };

  return (
    <div className="flex -m-6" style={{ height: 'calc(100vh - 5rem)' }}>
      {/* LEFT: AI Chat panel */}
      <div className="w-[420px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <button onClick={onDone} className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-slate-900">
            {editingTemplate ? '编辑协议' : '新建协议'}
          </h3>
        </div>

        {/* Chat messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === 'user' ? 'bg-brand-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-700 rounded-bl-md'
              }`}>
                <div className="whitespace-pre-wrap">{msg.content}</div>
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

        {/* Settings collapsible */}
        <div className="border-t border-slate-100">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full px-5 py-2.5 flex items-center justify-between text-xs text-slate-500 hover:bg-slate-50"
          >
            <span className="font-medium">模板设置</span>
            <svg className={`w-4 h-4 transition-transform ${showSettings ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showSettings && (
            <div className="px-5 pb-4 space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">模板标题 *</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)}
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
          )}
        </div>

        {/* Chat input */}
        <div className="px-4 py-3 border-t border-slate-100">
          <div className="flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder="让 AI 帮你修改协议内容..." disabled={chatMutation.isPending}
              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white" />
            <button onClick={handleSend} disabled={chatMutation.isPending || !input.trim()}
              className="px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-500 disabled:opacity-50">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: Editable content */}
      <div className="flex-1 flex flex-col bg-slate-50">
        {/* Header with save actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-brand-500" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{title || '未命名协议'}</h3>
              <span className="text-xs text-slate-400">
                {consentTypeLabels[consentType] || consentType} · {content.length} 字
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onDone}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50">
              取消
            </button>
            <button onClick={handleSave} disabled={isPending || !title.trim() || !content.trim()}
              className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5">
              {isPending
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中...</>
                : <><Check className="w-3.5 h-3.5" /> {editingTemplate ? '更新' : '保存'}</>
              }
            </button>
          </div>
        </div>

        {/* Editable document */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <textarea
                value={content} onChange={(e) => setContent(e.target.value)}
                placeholder="输入协议完整内容..."
                className="w-full px-8 py-8 text-sm text-slate-700 leading-relaxed rounded-xl focus:outline-none resize-none"
                style={{ minHeight: 'calc(100vh - 14rem)' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Agreement Importer (Text Import + AI Extract) ───────────────

function AgreementImporter({ onClose, onEditResult }: {
  onClose: () => void;
  onEditResult: (data: PrefillData) => void;
}) {
  const { toast } = useToast();
  const extractAgreement = useExtractAgreement();
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ title: string; consentType: string; content: string; sections: { heading: string; body: string }[] } | null>(null);

  const handleExtract = () => {
    if (!text.trim()) return;
    extractAgreement.mutate({ content: text }, {
      onSuccess: (data) => setResult(data),
      onError: () => toast('识别失败，请检查文本内容后重试', 'error'),
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
              <Check className="w-4 h-4" />
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
            <div className="max-h-60 overflow-y-auto bg-slate-50 rounded-lg p-3 text-xs text-slate-600 whitespace-pre-wrap">
              {result.content}
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setResult(null)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">重新识别</button>
            <button
              onClick={() => onEditResult({ title: result.title, consentType: result.consentType, content: result.content })}
              className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 flex items-center gap-1.5"
            >
              <Edit3 className="w-4 h-4" /> 编辑并保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agreement AI Creator (Split Pane: Chat + Document) ──────────

function AgreementAICreator({ onClose, onEditAgreement }: {
  onClose: () => void;
  onEditAgreement: (data: PrefillData) => void;
}) {
  const { toast } = useToast();
  const chatMutation = useCreateAgreementChat();
  const createTemplate = useCreateConsentTemplate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', content: '你好！我可以帮你生成专业的协议模板。\n\n请问你需要什么类型的协议？比如：\n• 咨询知情同意书\n• 数据采集同意书\n• AI辅助分析同意书\n• 研究参与同意书' },
  ]);
  const [input, setInput] = useState('');
  const [currentAgreement, setCurrentAgreement] = useState<PrefillData | null>(null);

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
        if (data.type === 'agreement') {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.summary }]);
          setCurrentAgreement(data.agreement);
        } else {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]);
        }
      },
      onError: () => setMessages((prev) => [...prev, { role: 'assistant', content: '抱歉，AI 服务暂时不可用。' }]),
    });
  };

  const handleSaveDirectly = () => {
    if (!currentAgreement) return;
    createTemplate.mutate({ ...currentAgreement }, {
      onSuccess: () => toast('协议模板已保存', 'success'),
      onError: () => toast('保存失败', 'error'),
    });
  };

  return (
    <div className="flex -m-6" style={{ height: 'calc(100vh - 5rem)' }}>
      {/* LEFT: Chat panel */}
      <div className="w-[420px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-slate-900">AI 生成协议</h3>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === 'user' ? 'bg-brand-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-700 rounded-bl-md'
              }`}>
                <div className="whitespace-pre-wrap">{msg.content}</div>
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

        {/* Input */}
        <div className="px-4 py-3 border-t border-slate-100">
          <div className="flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder="描述你需要的协议或修改要求..." disabled={chatMutation.isPending}
              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white" />
            <button onClick={handleSend} disabled={chatMutation.isPending || !input.trim()}
              className="px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-500 disabled:opacity-50">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: Document panel */}
      <div className="flex-1 flex flex-col bg-slate-50">
        {/* Document header */}
        {currentAgreement ? (
          <>
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-brand-500" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{currentAgreement.title}</h3>
                  <span className="text-xs text-slate-400">
                    {consentTypeLabels[currentAgreement.consentType] || currentAgreement.consentType} · AI 生成
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => onEditAgreement(currentAgreement)}
                  className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5" /> 编辑
                </button>
                <button onClick={handleSaveDirectly} disabled={createTemplate.isPending}
                  className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5">
                  {createTemplate.isPending
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中...</>
                    : <><Check className="w-3.5 h-3.5" /> 保存为模板</>
                  }
                </button>
              </div>
            </div>

            {/* Document body */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-center py-8 px-8 border-b border-slate-100">
                    <h1 className="text-xl font-bold text-slate-900">{currentAgreement.title}</h1>
                    <p className="text-xs text-slate-400 mt-2">
                      {consentTypeLabels[currentAgreement.consentType] || currentAgreement.consentType}
                    </p>
                  </div>
                  <div className="px-8 py-6 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {currentAgreement.content}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">在左侧对话中描述你需要的协议</p>
              <p className="text-xs text-slate-300 mt-1">AI 生成后，文稿将在这里展示</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
