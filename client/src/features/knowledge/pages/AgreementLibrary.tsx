import React, { useState } from 'react';
import {
  useConsentTemplates, useCreateConsentTemplate,
  useUpdateConsentTemplate, useDeleteConsentTemplate,
} from '../../../api/useConsent';
import { PageLoading, useToast } from '../../../shared/components';
import { Plus, Edit3, Trash2, FileCheck, Eye, EyeOff } from 'lucide-react';

const consentTypeLabels: Record<string, string> = {
  treatment: '咨询知情同意',
  data_collection: '数据采集同意',
  ai_processing: 'AI辅助分析同意',
  data_sharing: '数据共享同意',
  research: '研究用途同意',
};

export function AgreementLibrary() {
  const { data: templates, isLoading } = useConsentTemplates();
  const deleteTemplate = useDeleteConsentTemplate();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          管理机构的协议模板，在个案工作台中可直接选用发送给来访者
        </div>
        <button
          onClick={() => { setShowCreate(true); setEditingId(null); }}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> 新建协议模板
        </button>
      </div>

      {(showCreate || editingId) && (
        <AgreementForm
          editingTemplate={editingId ? templates?.find((t) => t.id === editingId) : undefined}
          onDone={() => { setShowCreate(false); setEditingId(null); }}
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
                    onClick={() => { setEditingId(t.id); setShowCreate(false); }}
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
