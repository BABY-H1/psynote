import React, { useState } from 'react';
import { useConsentTemplates, useSendConsent } from '../../../api/useConsent';
import { useToast } from '../../../shared/components';
import { FileText, Send } from 'lucide-react';

const consentTypeLabels: Record<string, string> = {
  treatment: '咨询知情同意',
  data_collection: '数据采集同意',
  ai_processing: 'AI辅助分析同意',
  data_sharing: '数据共享同意',
  research: '研究用途同意',
};

interface Props {
  clientId: string;
  careEpisodeId?: string;
  onDone: () => void;
}

export function SendConsentForm({ clientId, careEpisodeId, onDone }: Props) {
  const { data: templates, isLoading } = useConsentTemplates();
  const sendConsent = useSendConsent();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const toggleTemplate = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleSend = async () => {
    if (selectedIds.length === 0) return;
    try {
      for (const templateId of selectedIds) {
        await sendConsent.mutateAsync({ clientId, careEpisodeId, templateId });
      }
      toast(`已发送 ${selectedIds.length} 份知情同意书`, 'success');
      onDone();
    } catch {
      toast('发送失败', 'error');
    }
  };

  const previewTemplate = templates?.find((t) => t.id === previewId);

  if (isLoading) return <div className="text-sm text-slate-400 py-4">加载模板中...</div>;

  if (!templates || templates.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
        暂无知情同意书模板。请先在模板管理中创建模板。
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-900 mb-3">发送知情同意书</h3>
      <p className="text-xs text-slate-400 mb-4">选择要发送的知情同意书模板，来访者将在客户端门户中签署。</p>

      <div className="space-y-2 mb-4">
        {templates.map((t) => (
          <label
            key={t.id}
            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
              selectedIds.includes(t.id) ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(t.id)}
              onChange={() => toggleTemplate(t.id)}
              className="rounded text-brand-600"
            />
            <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900">{t.title}</div>
              <div className="text-xs text-slate-400">
                {consentTypeLabels[t.consentType] || t.consentType}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setPreviewId(previewId === t.id ? null : t.id); }}
              className="text-xs text-brand-600 hover:text-brand-700"
            >
              {previewId === t.id ? '收起' : '预览'}
            </button>
          </label>
        ))}
      </div>

      {previewTemplate && (
        <div className="bg-slate-50 rounded-lg p-4 mb-4 max-h-60 overflow-y-auto">
          <div className="text-xs text-slate-400 mb-2">预览：{previewTemplate.title}</div>
          <div className="text-sm text-slate-700 whitespace-pre-wrap">{previewTemplate.content}</div>
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <button onClick={onDone} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
          取消
        </button>
        <button
          onClick={handleSend}
          disabled={selectedIds.length === 0 || sendConsent.isPending}
          className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-2"
        >
          <Send className="w-3.5 h-3.5" />
          {sendConsent.isPending ? '发送中...' : `发送 (${selectedIds.length})`}
        </button>
      </div>
    </div>
  );
}
