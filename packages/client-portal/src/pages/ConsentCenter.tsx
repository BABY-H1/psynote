import React, { useState } from 'react';
import { useMyDocuments, useSignDocument } from '@client/api/useConsent';
import { PageLoading, useToast } from '@client/shared/components';
import { FileText, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { useViewingContext } from '../stores/viewingContext';

const consentTypeLabels: Record<string, string> = {
  treatment: '咨询知情同意',
  data_collection: '数据采集同意',
  ai_processing: 'AI辅助分析同意',
  data_sharing: '数据共享同意',
  research: '研究用途同意',
};

export function ConsentCenter() {
  // Phase 14 — guardian impersonation
  const viewingAs = useViewingContext((s) => s.viewingAs);
  const viewingAsName = useViewingContext((s) => s.viewingAsName);
  const { data: docs, isLoading } = useMyDocuments({ as: viewingAs ?? undefined });
  const [signingDocId, setSigningDocId] = useState<string | null>(null);

  const pending = (docs || []).filter((d) => d.status === 'pending');
  const signed = (docs || []).filter((d) => d.status === 'signed');

  if (isLoading) return <PageLoading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">用户协议</h1>
        <p className="text-sm text-slate-500 mt-1">
          {viewingAs
            ? `正在查看孩子「${viewingAsName || ''}」的协议（您的签署将作为家长代签留痕）`
            : '查看和签署您的服务协议'}
        </p>
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-900">待签署 ({pending.length})</h2>
          </div>
          <div className="space-y-3">
            {pending.map((doc) => (
              <div key={doc.id} className="bg-white rounded-xl border-2 border-amber-200 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{doc.title}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                          待签署
                        </span>
                        <span className="text-xs text-slate-400">
                          {consentTypeLabels[doc.consentType || ''] || doc.consentType}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSigningDocId(doc.id)}
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500"
                  >
                    查看并签署
                  </button>
                </div>

                {signingDocId === doc.id && (
                  <SigningPanel
                    doc={doc}
                    viewingAs={viewingAs}
                    onDone={() => setSigningDocId(null)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signed */}
      {signed.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-slate-900">已签署 ({signed.length})</h2>
          </div>
          <div className="space-y-2">
            {signed.map((doc) => (
              <div key={doc.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900">{doc.title}</div>
                  <div className="text-xs text-slate-400">
                    {consentTypeLabels[doc.consentType || ''] || doc.consentType}
                    {doc.signedAt && ` · 签署于 ${new Date(doc.signedAt).toLocaleDateString('zh-CN')}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && signed.length === 0 && (
        <div className="text-center py-12 text-sm text-slate-400">
          暂无知情同意书
        </div>
      )}
    </div>
  );
}

function SigningPanel({ doc, viewingAs, onDone }: { doc: any; viewingAs: string | null; onDone: () => void }) {
  const signDocument = useSignDocument({ as: viewingAs ?? undefined });
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [signed, setSigned] = useState(false);

  const handleSign = async () => {
    if (!name.trim() || !agreed) return;
    try {
      await signDocument.mutateAsync({ docId: doc.id, name: name.trim() });
      setSigned(true);
      toast('签署成功', 'success');
    } catch {
      toast('签署失败，请重试', 'error');
    }
  };

  if (signed) {
    return (
      <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
        <div className="text-sm font-medium text-emerald-700">签署成功</div>
        <div className="text-xs text-emerald-600 mt-1">
          签署人：{name} · 签署时间：{new Date().toLocaleString('zh-CN')}
        </div>
        <button onClick={onDone} className="mt-3 text-xs text-emerald-700 hover:underline">
          关闭
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      {/* Document content */}
      <div className="bg-slate-50 rounded-lg p-4 max-h-80 overflow-y-auto mb-4">
        <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
          {doc.content || '（文档内容为空）'}
        </div>
      </div>

      {/* Signing area */}
      <div className="bg-slate-50 rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">请输入您的姓名以确认签署</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="请输入您的真实姓名"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 rounded text-brand-600"
          />
          <span className="text-xs text-slate-600">
            我已仔细阅读并理解以上知情同意书的全部内容，自愿同意并签署。
          </span>
        </label>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onDone}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={handleSign}
            disabled={!name.trim() || !agreed || signDocument.isPending}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
          >
            {signDocument.isPending ? '签署中...' : '确认签署'}
          </button>
        </div>
      </div>
    </div>
  );
}
