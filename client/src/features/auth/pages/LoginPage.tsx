import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../stores/authStore';
import { api } from '../../../api/client';
import { Shield, Zap, BarChart3 } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const { user, setAuth } = useAuthStore();
  const navigate = useNavigate();

  // Already logged in → redirect
  if (user) {
    return <Navigate to="/select-org" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!agreed) {
      setError('请先阅读并同意用户协议和隐私政策');
      return;
    }
    setLoading(true);

    try {
      const data = await api.post<{
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; name: string; isSystemAdmin?: boolean };
      }>('/auth/login', { email, password });

      // Set token first so subsequent API calls are authenticated
      api.setToken(data.accessToken);

      // Fetch user's orgs to get role
      const orgs = await api.get<{ id: string; myRole: string }[]>('/orgs');

      // Set auth + org in one go
      setAuth(
        { id: data.user.id, email: data.user.email, name: data.user.name, createdAt: '' },
        data.accessToken,
        data.refreshToken,
        data.user.isSystemAdmin ?? false,
      );

      if (orgs.length > 0) {
        const { setOrg } = useAuthStore.getState();
        setOrg(orgs[0].id, orgs[0].myRole as any);
      }

      // Navigate based on role
      const role = orgs[0]?.myRole;
      navigate(role === 'client' ? '/portal' : '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请检查账号密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-brand-50/80 via-white to-brand-50/40">
      {/* Left - Marketing */}
      <div className="hidden lg:flex flex-1 flex-col justify-between px-12 xl:px-16 py-10">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4" />
              <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-brand-600">Psynote</h1>
            <p className="text-xs text-slate-400">一站式心理服务平台</p>
          </div>
        </div>

        {/* Hero */}
        <div className="flex-1 flex flex-col justify-center max-w-lg">
          <h2 className="text-3xl xl:text-4xl font-bold text-slate-900 mb-2">
            专业心理服务
          </h2>
          <p className="text-xl xl:text-2xl font-bold text-brand-500 mb-4">
            安全合规 · 高效智能 · 数据驱动
          </p>
          <p className="text-sm text-slate-500 mb-10 leading-relaxed">
            为心理服务机构提供全流程数字化解决方案，让专业服务更加高效和规范
          </p>

          {/* Feature cards */}
          <div className="space-y-4">
            <FeatureCard
              icon={<Shield className="w-5 h-5 text-brand-500" />}
              title="安全合规"
              desc="用标准化协议、脱敏与审计链，守住执业过程中法律与伦理底线"
            />
            <FeatureCard
              icon={<Zap className="w-5 h-5 text-brand-500" />}
              title="流程提效"
              desc="从测评筛查、咨询记录、AI 逐字稿到个案归档一站式覆盖，将每次服务的行政与整理时间由 30-60 分钟压缩至 5-10 分钟"
            />
            <FeatureCard
              icon={<BarChart3 className="w-5 h-5 text-brand-500" />}
              title="数据智能"
              desc="来访者动态分析、多维画像、咨询进展追踪，叠加经营数据看板与成本收益分析，提供可视化运营决策支持"
            />
          </div>
        </div>

        {/* Footer badge */}
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-brand-400" fill="currentColor">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
          已为 1000+ 心理服务机构提供专业合规服务
        </div>
      </div>

      {/* Right - Login form */}
      <div className="w-full lg:w-[480px] xl:w-[520px] flex items-center justify-center px-6 lg:px-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12l2 2 4-4" />
                <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-brand-600">Psynote</h1>
              <p className="text-xs text-slate-400">一站式心理服务平台</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 text-center mb-1">登录账户</h2>
          <p className="text-sm text-slate-400 text-center mb-8">
            欢迎回来，开始您的专业服务之旅
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">邮箱地址</label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                </div>
                <input
                  type="email"
                  placeholder="请输入邮箱地址"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">密码</label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg viewBox="0 0 20 20" className="w-5 h-5" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <input
                  type="password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition"
                />
              </div>
            </div>

            {/* Agreement checkbox */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500/30"
              />
              <span className="text-xs text-slate-500 leading-relaxed">
                我已阅读并同意
                <span className="text-brand-600 hover:underline cursor-pointer">《用户协议》</span>
                和
                <span className="text-brand-600 hover:underline cursor-pointer">《隐私政策》</span>
              </span>
            </label>

            {error && (
              <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-brand-500 to-brand-400 hover:from-brand-600 hover:to-brand-500 text-white rounded-xl font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-brand-500/25"
            >
              {loading ? (
                '登录中...'
              ) : (
                <>
                  立即登录
                  <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </>
              )}
            </button>
          </form>

          <p className="text-xs text-slate-400 text-center mt-8">
            如需开通账号，请联系系统管理员。
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-4 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-100 p-4 shadow-sm">
      <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-0.5">{title}</h3>
        <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
