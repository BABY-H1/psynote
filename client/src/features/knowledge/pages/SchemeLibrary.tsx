import React, { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGroupSchemes, useCreateGroupScheme, useDeleteGroupScheme,
} from '../../../api/useGroups';
import { useExtractScheme, useCreateSchemeChat } from '../../../api/useAI';
import { PageLoading, useToast } from '../../../shared/components';
import { DistributionControl } from '../../../shared/components/DistributionControl';
import { useIsSystemLibraryScope } from '../../../shared/api/libraryScope';
import {
  BookOpen, Upload, Sparkles, Loader2, Send, ArrowLeft, Eye, Edit3, Trash2,
} from 'lucide-react';
import { SchemeDetail } from '../components/SchemeDetail';

type ViewMode = 'list' | 'detail' | 'import' | 'ai';

export function SchemeLibrary() {
  const { data: schemes, isLoading } = useGroupSchemes();
  const deleteScheme = useDeleteGroupScheme();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isSystemScope = useIsSystemLibraryScope();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);
  const [detailEditing, setDetailEditing] = useState(false);

  if (viewMode === 'detail' && selectedSchemeId) {
    return (
      <SchemeDetail
        schemeId={selectedSchemeId}
        initialEditing={detailEditing}
        onBack={() => { setViewMode('list'); setSelectedSchemeId(null); setDetailEditing(false); }}
      />
    );
  }

  const goToDetail = (schemeId: string, editing = false) => {
    setSelectedSchemeId(schemeId);
    setDetailEditing(editing);
    setViewMode('detail');
  };

  if (viewMode === 'import') {
    return <SchemeImporter onClose={() => setViewMode('list')} onCreated={(id) => goToDetail(id, true)} />;
  }
  if (viewMode === 'ai') {
    return <SchemeAICreator onClose={() => setViewMode('list')} onCreated={(id) => goToDetail(id, true)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          管理团体辅导方案模板，在发布团辅活动时可直接选用
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

      {isLoading ? <PageLoading /> : !schemes || schemes.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">
          暂无团辅方案，点击上方按钮创建
        </div>
      ) : (
        <div className="grid gap-3">
          {schemes.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <BookOpen className="w-4 h-4 text-violet-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-slate-900">{s.title}</span>
                    {s.targetAudience && (
                      <span className="text-xs px-2 py-0.5 bg-violet-50 text-violet-600 rounded-full">
                        {s.targetAudience}
                      </span>
                    )}
                    <DistributionControl
                      resource="schemes"
                      item={s}
                      onSaved={() => qc.invalidateQueries({ queryKey: ['groupSchemes'] })}
                    />
                    {s.sessions && s.sessions.length > 0 && (
                      <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">
                        {s.sessions.length} 次活动
                      </span>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{s.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-3">
                  <button
                    onClick={() => goToDetail(s.id, false)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
                    title="查看"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (!s.orgId && !isSystemScope) {
                        toast('无权修改：平台级内容仅系统管理员可管理', 'error');
                        return;
                      }
                      goToDetail(s.id, true);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded"
                    title="编辑"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      if (!s.orgId && !isSystemScope) {
                        toast('无权删除：平台级内容仅系统管理员可管理', 'error');
                        return;
                      }
                      if (confirm(`确定删除"${s.title}"？`)) {
                        try { await deleteScheme.mutateAsync(s.id); toast('已删除', 'success'); }
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Scheme Importer (Text Import + AI Extract) ─────────────

function SchemeImporter({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const extractScheme = useExtractScheme();
  const createScheme = useCreateGroupScheme();
  const [text, setText] = useState('');
  const [result, setResult] = useState<any>(null);

  const handleExtract = () => {
    if (!text.trim()) return;
    extractScheme.mutate({ content: text }, {
      onSuccess: (data) => setResult(data),
      onError: () => toast('识别失败，请检查文本内容后重试', 'error'),
    });
  };

  const handleSave = () => {
    if (!result) return;
    createScheme.mutate({
      title: result.title,
      description: result.description,
      theory: result.theory,
      targetAudience: result.targetAudience,
      overallGoal: result.overallGoal,
      specificGoals: result.specificGoals,
      visibility: 'personal',
      sessions: result.sessions.map((s: any, i: number) => ({ ...s, sortOrder: i })),
    }, {
      onSuccess: (scheme: any) => { toast('方案导入成功', 'success'); onCreated(scheme.id); },
      onError: () => toast('保存失败', 'error'),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><ArrowLeft className="w-5 h-5" /></button>
        <Sparkles className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-bold text-slate-900">文本导入方案</h3>
      </div>

      {!result ? (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">粘贴团辅方案文本，AI 会自动识别结构</p>
            <p className="text-amber-600">支持：团体辅导方案、工作坊计划、心理健康教育活动方案等</p>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            rows={12} placeholder="在此粘贴方案文本..."
            className="w-full border border-slate-200 rounded-xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <div className="flex justify-end">
            <button onClick={handleExtract} disabled={!text.trim() || extractScheme.isPending}
              className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5">
              {extractScheme.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> AI 识别中...</> : <><Sparkles className="w-4 h-4" /> 开始识别</>}
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
              <div><span className="text-xs text-slate-400">目标人群</span><p className="text-sm text-slate-700">{result.targetAudience || '未指定'}</p></div>
              {result.theory && <div><span className="text-xs text-slate-400">理论基础</span><p className="text-sm text-slate-700">{result.theory}</p></div>}
              <div><span className="text-xs text-slate-400">活动单元</span><p className="text-sm text-slate-700">{result.sessions.length} 次</p></div>
            </div>
            {result.sessions.length > 0 && (
              <div>
                <span className="text-xs text-slate-400 mb-2 block">单元预览</span>
                <div className="space-y-1.5">
                  {result.sessions.map((s: any, i: number) => (
                    <div key={i} className="flex gap-2 items-start text-sm text-slate-600">
                      <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div>
                        <span className="font-medium">{s.title}</span>
                        {s.goal && <span className="text-xs text-slate-400 ml-2">{s.goal}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setResult(null)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">重新识别</button>
            <button onClick={handleSave} disabled={createScheme.isPending}
              className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50">
              {createScheme.isPending ? '保存中...' : '确认导入'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scheme AI Creator (Chat-based) ─────────────────────────

function SchemeAICreator({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const chatMutation = useCreateSchemeChat();
  const createScheme = useCreateGroupScheme();
  const scrollRef = useRef<HTMLDivElement>(null);

  type ChatMsg = {
    role: 'user' | 'assistant';
    content: string;
    scheme?: any;
  };
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', content: '你好！我可以帮你设计专业的团体辅导方案。\n\n请先告诉我：\n1. 这个方案面向什么人群？（如大学生、中学生、职场人士等）\n2. 希望达成什么目标？（如减压、提升人际交往能力、自我认知等）' },
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
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && !m.scheme))
      .map((m) => ({ role: m.role, content: m.content }));

    chatMutation.mutate({ messages: apiMessages }, {
      onSuccess: (data) => {
        if (data.type === 'scheme') {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.summary, scheme: data.scheme }]);
        } else {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]);
        }
      },
      onError: () => setMessages((prev) => [...prev, { role: 'assistant', content: '抱歉，AI 服务暂时不可用。' }]),
    });
  };

  const handleSaveScheme = (scheme: ChatMsg['scheme']) => {
    if (!scheme) return;
    createScheme.mutate({
      title: scheme.title,
      description: scheme.description,
      theory: scheme.theory,
      targetAudience: scheme.targetAudience,
      overallGoal: scheme.overallGoal,
      specificGoals: scheme.specificGoals,
      visibility: 'personal',
      sessions: scheme.sessions.map((s: any, i: number) => ({ ...s, sortOrder: i })),
    }, {
      onSuccess: (scheme: any) => { toast('方案已保存', 'success'); onCreated(scheme.id); },
      onError: () => toast('保存失败', 'error'),
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)]">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><ArrowLeft className="w-5 h-5" /></button>
        <Sparkles className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-bold text-slate-900">AI 生成方案</h3>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 mb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === 'user' ? 'bg-brand-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-700 rounded-bl-md'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.scheme && (
                <div className="mt-3 bg-white rounded-lg border border-green-200 p-3 space-y-2">
                  <div className="text-xs font-semibold text-green-700">生成的团辅方案</div>
                  <div className="text-sm font-medium text-slate-900">{msg.scheme.title}</div>
                  <div className="text-xs text-slate-500">
                    {msg.scheme.targetAudience || '团体辅导'} | {msg.scheme.sessions.length} 次活动
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {msg.scheme.sessions.map((s: any, j: number) => (
                      <div key={j} className="text-xs text-slate-500 flex gap-1.5">
                        <span className="text-violet-600 font-bold">{j + 1}.</span>
                        <span>{s.title}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => handleSaveScheme(msg.scheme)}
                    disabled={createScheme.isPending}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-500 disabled:opacity-50">
                    {createScheme.isPending ? '保存中...' : '保存此方案'}
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
          placeholder="描述你需要的团辅方案..." disabled={chatMutation.isPending}
          className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        <button onClick={handleSend} disabled={chatMutation.isPending || !input.trim()}
          className="px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-500 disabled:opacity-50">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
