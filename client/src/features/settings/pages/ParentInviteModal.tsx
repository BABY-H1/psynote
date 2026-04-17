import React, { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Loader2, Trash2, Plus, AlertCircle } from 'lucide-react';
import {
  useClassInviteTokens,
  useCreateClassInviteToken,
  useRevokeClassInviteToken,
  type ClassParentInviteTokenRow,
} from '../../../api/useParentInviteToken';

/**
 * Phase 14 — "Generate this class's parent invite code" modal.
 *
 * Lets the homeroom teacher (or counselor / org_admin) create a class-shared
 * invite token. The token URL is meant to be:
 *   1. Pasted into a class WeChat group, OR
 *   2. Shown as a QR code projected on a parent meeting screen.
 *
 * Parents who scan the QR / open the URL land on `/invite/:token` in the
 * portal, where they self-bind by entering child name + student id +
 * last 4 digits of their phone (validated server-side against
 * school_student_profiles).
 *
 * The PORTAL_BASE used for the URL prefers `VITE_PORTAL_URL`; otherwise it
 * falls back to `window.location.origin` swapped to port 5174 (dev) or the
 * same origin (prod). For dev, the simplest convention is to host the
 * portal on /portal-dev or run it on the same origin via reverse proxy. We
 * just emit the path here and let the user copy it into context.
 */
function getPortalBase(): string {
  // Vite-injected env var if defined
  const fromEnv = (import.meta as any).env?.VITE_PORTAL_URL;
  if (fromEnv) return String(fromEnv).replace(/\/$/, '');

  // Dev: client runs on 5173, portal on 5174 — swap the port
  const { protocol, hostname, port } = window.location;
  if (port === '5173') return `${protocol}//${hostname}:5174`;
  // Prod / unknown: assume same origin
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
}

export function ParentInviteModal({
  schoolClass,
  onClose,
}: {
  schoolClass: { id: string; grade: string; className: string };
  onClose: () => void;
}) {
  const { data: tokens, isLoading } = useClassInviteTokens(schoolClass.id);
  const createMutation = useCreateClassInviteToken(schoolClass.id);
  const revokeMutation = useRevokeClassInviteToken(schoolClass.id);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [error, setError] = useState('');

  const portalBase = useMemo(getPortalBase, []);

  // The "active" token = newest non-revoked, non-expired one
  const activeToken: ClassParentInviteTokenRow | undefined = useMemo(() => {
    if (!tokens) return undefined;
    const now = Date.now();
    return tokens.find((t) => !t.revokedAt && new Date(t.expiresAt).getTime() > now);
  }, [tokens]);

  const inviteUrl = activeToken ? `${portalBase}/invite/${activeToken.token}` : '';

  async function handleGenerate() {
    setError('');
    try {
      await createMutation.mutateAsync({ expiresInDays });
    } catch (e: any) {
      setError(e?.message || '生成失败，请重试');
    }
  }

  async function handleRevoke(tokenId: string) {
    if (!confirm('撤销后该链接立即失效，已绑定的家长不受影响。确定撤销？')) return;
    setError('');
    try {
      await revokeMutation.mutateAsync(tokenId);
    } catch (e: any) {
      setError(e?.message || '撤销失败');
    }
  }

  function handleCopy() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(
      () => alert('链接已复制，可发到班级家长群'),
      () => alert('复制失败，请手动复制'),
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {schoolClass.grade} {schoolClass.className} · 家长邀请码
          </h2>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* How-to */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 leading-relaxed">
            <strong>如何使用：</strong>生成本班的家长邀请链接，复制到家长微信群发布（或将二维码截图发出）。
            家长扫码或点链接进入小程序后，需输入孩子姓名 + 学号 + 自己手机后 4 位完成核身。
            一个班共用一个链接，每位家长可独立绑定。
          </div>

          {isLoading ? (
            <div className="py-6 text-center"><Loader2 className="w-5 h-5 text-slate-300 animate-spin mx-auto" /></div>
          ) : activeToken ? (
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <QRCodeSVG value={inviteUrl} size={120} level="M" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-500 mb-1">邀请链接（家长使用）</div>
                  <div className="text-xs font-mono text-slate-700 break-all leading-relaxed">
                    {inviteUrl}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    过期时间：{new Date(activeToken.expiresAt).toLocaleString('zh-CN')}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex-1 px-3 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-1 transition"
                >
                  <Copy className="w-4 h-4" />
                  复制链接
                </button>
                <button
                  onClick={() => handleRevoke(activeToken.id)}
                  disabled={revokeMutation.isPending}
                  className="px-3 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 text-sm rounded-lg flex items-center gap-1 transition disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  撤销
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 space-y-3">
              <div className="text-sm text-slate-600">本班暂无可用邀请链接</div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500">有效期</label>
                <select
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Number(e.target.value))}
                  className="px-2 py-1 text-xs border border-slate-200 rounded"
                >
                  <option value={7}>7 天</option>
                  <option value={30}>30 天</option>
                  <option value={90}>90 天</option>
                  <option value={365}>1 年</option>
                </select>
                <button
                  onClick={handleGenerate}
                  disabled={createMutation.isPending}
                  className="ml-auto px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-medium rounded-lg flex items-center gap-1 disabled:opacity-50"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  生成邀请链接
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Token history */}
          {tokens && tokens.length > 1 && (
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-2">历史邀请链接</div>
              <div className="space-y-1 text-xs">
                {tokens.filter((t) => t.id !== activeToken?.id).map((t) => {
                  const expired = new Date(t.expiresAt).getTime() < Date.now();
                  return (
                    <div key={t.id} className="flex items-center gap-2 text-slate-500 px-2 py-1">
                      <span className="font-mono text-[10px]">{t.token.slice(0, 12)}...</span>
                      {t.revokedAt ? (
                        <span className="text-rose-500">已撤销</span>
                      ) : expired ? (
                        <span className="text-slate-400">已过期</span>
                      ) : (
                        <span className="text-emerald-600">有效</span>
                      )}
                      <span className="ml-auto text-[10px]">
                        {new Date(t.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
