import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client';

/**
 * 忘记密码页 —— 输入邮箱,后端发重置链接邮件。
 *
 * UI 说明:无论邮箱是否注册,都显示"已发送"(后端也返回 200),防止
 * 通过此页面枚举哪些邮箱注册过。
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败,请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50/80 via-white to-brand-50/40 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">找回密码</h1>

          {submitted ? (
            <div>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                如果 <strong>{email}</strong> 是有效的注册邮箱,我们已向它发送了一封重置链接邮件。
              </p>
              <p className="text-xs text-slate-500 mb-6">
                链接 15 分钟内有效,一次性使用。如未收到,请检查垃圾邮件,或 10 分钟后重试。
              </p>
              <Link
                to="/login"
                className="block text-center w-full py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-medium text-sm transition"
              >
                返回登录
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-6">
                输入您的注册邮箱,我们将发送一封包含重置链接的邮件。
              </p>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    邮箱地址
                  </label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition"
                  />
                </div>

                {error && (
                  <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-medium text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? '发送中...' : '发送重置邮件'}
                </button>

                <Link
                  to="/login"
                  className="block text-center text-sm text-brand-600 hover:underline"
                >
                  返回登录
                </Link>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
