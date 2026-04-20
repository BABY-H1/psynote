import React, { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useNoteTemplates, useCreateNoteTemplate, useDeleteNoteTemplate,
} from '../../../api/useCounseling';
import { useExtractNoteTemplate, useCreateNoteTemplateChat } from '../../../api/useAI';
import { PageLoading, useToast } from '../../../shared/components';
import { NoteTemplateDetail } from '../components/NoteTemplateDetail';
import { DistributionControl } from '../../../shared/components/DistributionControl';
import { useIsSystemLibraryScope } from '../../../shared/api/libraryScope';
import {
  Edit3, Trash2, FileText, Upload, Sparkles, Loader2, Send, ArrowLeft, Eye,
} from 'lucide-react';

const formatLabels: Record<string, string> = {
  soap: 'SOAP',
  dap: 'DAP',
  birp: 'BIRP',
  custom: '自定义',
};

type ViewMode = 'list' | 'import' | 'ai' | 'detail';

export function NoteTemplateLibrary() {
  const { data: templates, isLoading } = useNoteTemplates();
  const deleteTemplate = useDeleteNoteTemplate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isSystemScope = useIsSystemLibraryScope();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [detailEditing, setDetailEditing] = useState(false);

  const goToDetail = (templateId: string, editing = false) => {
    setSelectedTemplateId(templateId);
    setDetailEditing(editing);
    setViewMode('detail');
  };

  const goToList = () => {
    setViewMode('list');
    setSelectedTemplateId(null);
    setDetailEditing(false);
  };

  if (viewMode === 'detail' && selectedTemplateId) {
    return (
      <NoteTemplateDetail
        templateId={selectedTemplateId}
        initialEditing={detailEditing}
        onBack={goToList}
      />
    );
  }
  if (viewMode === 'import') {
    return (
      <NoteTemplateImporter
        onClose={goToList}
        onCreated={(id) => goToDetail(id, true)}
      />
    );
  }
  if (viewMode === 'ai') {
    return (
      <NoteTemplateAICreator
        onClose={goToList}
        onCreated={(id) => goToDetail(id, true)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          自定义会谈记录格式（SOAP/DAP/BIRP 等），在写笔记时可选用
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
          暂无笔记模板，点击上方按钮创建
        </div>
      ) : (
        <div className="grid gap-3">
          {templates.map((t: any) => (
            <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText className="w-4 h-4 text-brand-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-slate-900">{t.title}</span>
                    <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                      {formatLabels[t.format] || t.format}
                    </span>
                    {t.isDefault && (
                      <span className="text-xs px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full">
                        默认
                      </span>
                    )}
                    <DistributionControl
                      resource="templates"
                      item={t}
                      onSaved={() => qc.invalidateQueries({ queryKey: ['noteTemplates'] })}
                    />
                  </div>
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    {(t.fieldDefinitions as any[])?.map((f: any, i: number) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-brand-50 text-brand-600 rounded">
                        {f.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-3">
                  <button
                    onClick={() => goToDetail(t.id, false)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
                    title="查看"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (!t.orgId && !isSystemScope) {
                        toast('无权修改：平台级内容仅系统管理员可管理', 'error');
                        return;
                      }
                      goToDetail(t.id, true);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
                    title="编辑"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      if (!t.orgId && !isSystemScope) {
                        toast('无权删除：平台级内容仅系统管理员可管理', 'error');
                        return;
                      }
                      if (confirm(`确定删除"${t.title}"？`)) {
                        try {
                          await deleteTemplate.mutateAsync(t.id);
                          toast('已删除', 'success');
                        } catch {
                          toast('删除失败', 'error');
                        }
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Note Template Importer ────────────────────────────────────

function NoteTemplateImporter({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const extractTemplate = useExtractNoteTemplate();
  const createTemplate = useCreateNoteTemplate();
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ title: string; format: string; fieldDefinitions: { key: string; label: string; placeholder: string; required: boolean; order: number }[] } | null>(null);

  const handleExtract = () => {
    if (!text.trim()) return;
    extractTemplate.mutate({ content: text }, {
      onSuccess: (data) => setResult(data),
      onError: () => toast('识别失败，请检查文本内容后重试', 'error'),
    });
  };

  const handleSave = () => {
    if (!result) return;
    createTemplate.mutate({
      title: result.title,
      format: result.format,
      fieldDefinitions: result.fieldDefinitions as any,
    }, {
      onSuccess: (created: any) => {
        toast('笔记模板导入成功', 'success');
        onCreated(created.id);
      },
      onError: () => toast('保存失败', 'error'),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><ArrowLeft className="w-5 h-5" /></button>
        <Sparkles className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-bold text-slate-900">文本导入笔记模板</h3>
      </div>

      {!result ? (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">粘贴笔记模板描述，AI 会自动识别字段结构</p>
            <p className="text-amber-600">支持：SOAP、DAP、BIRP 或任何自定义格式的会谈记录模板</p>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            rows={12} placeholder="在此粘贴笔记模板内容...&#10;&#10;例如：&#10;S (主观): 来访者的自我报告...&#10;O (客观): 咨询师的观察...&#10;A (评估): 临床评估...&#10;P (计划): 下一步计划..."
            className="w-full border border-slate-200 rounded-xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <div className="flex justify-end">
            <button onClick={handleExtract} disabled={!text.trim() || extractTemplate.isPending}
              className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5">
              {extractTemplate.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> AI 识别中...</> : <><Sparkles className="w-4 h-4" /> 开始识别</>}
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
              <div><span className="text-xs text-slate-400">模板名称</span><p className="text-sm font-semibold text-slate-900">{result.title}</p></div>
              <div className="flex gap-4">
                <div><span className="text-xs text-slate-400">格式</span><p className="text-sm text-slate-700">{formatLabels[result.format] || result.format}</p></div>
                <div><span className="text-xs text-slate-400">字段数</span><p className="text-sm text-slate-700">{result.fieldDefinitions.length}</p></div>
              </div>
            </div>
            <div>
              <span className="text-xs text-slate-400 mb-2 block">字段列表</span>
              <div className="space-y-1.5">
                {result.fieldDefinitions.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-slate-400 w-5 text-right">{i + 1}.</span>
                    <span className="font-medium text-slate-900">{f.label}</span>
                    <span className="text-xs text-slate-400">({f.key})</span>
                    {f.required && <span className="text-xs text-red-400">必填</span>}
                    <span className="text-xs text-slate-400 ml-auto">{f.placeholder}</span>
                  </div>
                ))}
              </div>
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

// ─── Note Template AI Creator ──────────────────────────────────

function NoteTemplateAICreator({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const chatMutation = useCreateNoteTemplateChat();
  const createTemplate = useCreateNoteTemplate();
  const scrollRef = useRef<HTMLDivElement>(null);

  type ChatMsg = { role: 'user' | 'assistant'; content: string; template?: { title: string; format: string; fieldDefinitions: any[] } };
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', content: '你好！我可以帮你创建自定义的会谈记录模板。\n\n请问你需要什么类型的记录格式？比如：\n• 基于 SOAP 的扩展模板\n• 初次评估专用模板\n• 团体咨询观察记录\n• 完全自定义的格式' },
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
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && !m.template))
      .map((m) => ({ role: m.role, content: m.content }));

    chatMutation.mutate({ messages: apiMessages }, {
      onSuccess: (data) => {
        if (data.type === 'template') {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.summary, template: data.template }]);
        } else {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]);
        }
      },
      onError: () => setMessages((prev) => [...prev, { role: 'assistant', content: '抱歉，AI 服务暂时不可用。' }]),
    });
  };

  const handleSaveTemplate = (template: { title: string; format: string; fieldDefinitions: any[] }) => {
    createTemplate.mutate({ title: template.title, format: template.format, fieldDefinitions: template.fieldDefinitions }, {
      onSuccess: (created: any) => {
        toast('笔记模板已创建', 'success');
        onCreated(created.id);
      },
      onError: () => toast('保存失败', 'error'),
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)]">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><ArrowLeft className="w-5 h-5" /></button>
        <Sparkles className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-bold text-slate-900">AI 生成笔记模板</h3>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 mb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === 'user' ? 'bg-brand-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-700 rounded-bl-md'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.template && (
                <div className="mt-3 bg-white rounded-lg border border-green-200 p-3 space-y-2">
                  <div className="text-xs font-semibold text-green-700">生成的笔记模板</div>
                  <div className="text-sm font-medium text-slate-900">{msg.template.title}</div>
                  <div className="text-xs text-slate-500">{formatLabels[msg.template.format] || msg.template.format} · {msg.template.fieldDefinitions.length} 个字段</div>
                  <div className="flex flex-wrap gap-1">
                    {msg.template.fieldDefinitions.map((f: any, j: number) => (
                      <span key={j} className="text-xs px-2 py-0.5 bg-brand-50 text-brand-600 rounded">{f.label}</span>
                    ))}
                  </div>
                  <button onClick={() => handleSaveTemplate(msg.template!)}
                    disabled={createTemplate.isPending}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-500 disabled:opacity-50">
                    {createTemplate.isPending ? '保存中...' : '保存并进入编辑'}
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
          placeholder="描述你需要的笔记模板..." disabled={chatMutation.isPending}
          className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        <button onClick={handleSend} disabled={chatMutation.isPending || !input.trim()}
          className="px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-500 disabled:opacity-50">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
