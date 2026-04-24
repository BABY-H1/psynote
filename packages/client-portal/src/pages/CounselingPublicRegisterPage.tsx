import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@client/api/client';
import { useAuthStore } from '@client/stores/authStore';

/**
 * 咨询中心来访者自助注册页 —— 无需 auth。
 *
 * URL: /register/counseling/:orgSlug
 *
 * 流程:
 *   1. 挂载时拉 /api/public/counseling/:orgSlug/info 获取机构名 / logo /主题色
 *   2. 用户填姓名 / 邮箱 / 密码 / 手机
 *   3. 提交 → POST /api/public/counseling/:orgSlug/register
 *   4. 后端返回 JWT bundle → 写入 authStore → 跳 /portal
 *
 * ⚠️ 本页无审核流程(alpha 阶段接受)。production 需加 CAPTCHA + 邮箱验证,
 * 或改为"请求注册 → admin 审核"模式。
 */

interface OrgInfo {
  name: string;
  slug: string;
  logoUrl: string | null;
  themeColor: string | null;
}

export function CounselingPublicRegisterPage() {
  const { orgSlug = '' } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const { setAuth, setOrg } = useAuthStore();

  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [orgNotFound, setOrgNotFound] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    api.get<OrgInfo>(`/public/counseling/${orgSlug}/info`)
      .then((info) => {
        if (!cancelled) setOrgInfo(info);
      })
      .catch(() => {
        if (!cancelled) setOrgNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingInfo(false);
      });
    return () => { cancelled = true; };
  }, [orgSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!agreed) {
      setError('请先阅读并同意用户协议和隐私政策');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{
        status: 'registered' | 'already_registered';
        orgId: string;
        accessToken: string;
        refreshToken: string;
      }>(`/public/counseling/${orgSlug}/register`, { name, email, password, phone });

      api.setToken(res.accessToken);
      setAuth(
        { id: 'from-token', email, name, createdAt: '' },
        res.accessToken,
        res.refreshToken,
        false,
      );
      // client 角色默认 starter tier + counseling orgType
      const { planToTier } = await import('@psynote/shared');
      setOrg(res.orgId, 'client' as any, planToTier('free'), null, 'counseling' as any);

      navigate('/portal', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败,请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-400">加载中...</p>
      </div>
    );
  }
  if (orgNotFound || !orgInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-900 mb-2">机构未找到</h1>
          <p className="text-sm text-slate-500">请核对注册链接是否正确,或联系机构前台。</p>
        </div>
      </div>
    );
  }

  const accent = orgInfo.themeColor || '#0f766e';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8">
          {/* 机构头 */}
          <div className="flex items-center gap-3 mb-6">
            {orgInfo.logoUrl ? (
              <img src={orgInfo.logoUrl} alt="" className="w-12 h-12 rounded-xl object-cover" />
            ) : (
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: accent }}
              >
                {orgInfo.name.charAt(0)}
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold text-slate-900">{orgInfo.name}</h1>
              <p className="text-xs text-slate-400">来访者注册</p>
            </div>
          </div>

          <p className="text-sm text-slate-500 mb-6">
            创建账户后,您可以预约咨询、查看测评报告和服务记录。
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="姓名" required>
              <input
                type="text"
                placeholder="您的姓名"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="input"
              />
            </Field>

            <Field label="邮箱" required>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input"
              />
            </Field>

            <Field label="密码" required>
              <input
                type="password"
                placeholder="至少 6 位"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="input"
              />
            </Field>

            <Field label="手机号（可选）">
              <input
                type="tel"
                placeholder="13800138000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input"
              />
            </Field>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300"
                style={{ accentColor: accent }}
              />
              <span className="text-xs text-slate-500 leading-relaxed">
                我已阅读并同意
                <a href="/legal/terms" target="_blank" className="underline mx-1" style={{ color: accent }}>《用户协议》</a>
                和
                <a href="/legal/privacy" target="_blank" className="underline mx-1" style={{ color: accent }}>《隐私政策》</a>
              </span>
            </label>

            {error && (
              <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 text-white rounded-xl font-medium text-sm transition disabled:opacity-50"
              style={{ backgroundColor: accent }}
            >
              {submitting ? '创建中...' : '创建账户'}
            </button>

            <p className="text-xs text-slate-400 text-center">
              已有账号?{' '}
              <a href="/login" className="underline" style={{ color: accent }}>
                直接登录
              </a>
            </p>
          </form>
        </div>
      </div>

      <style>{`
        .input {
          width: 100%;
          padding: 0.625rem 0.875rem;
          background: white;
          border: 1px solid rgb(226, 232, 240);
          border-radius: 0.625rem;
          color: rgb(15, 23, 42);
          font-size: 0.875rem;
        }
        .input:focus { outline: none; border-color: ${accent}; box-shadow: 0 0 0 3px ${accent}1a; }
      `}</style>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
