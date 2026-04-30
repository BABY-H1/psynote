import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../../api/client';

/**
 * 重置密码页 —— 从邮件链接进入(URL 带 ?token=...),
 * 用户输入新密码提交完成重置。
 */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) setError('链接无效或缺少 token,请重新申请。');
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('新密码至少 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      setDone(true);
      // 3 秒后跳登录
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置失败,链接可能已过期或使用过');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50/80 via-white to-brand-50/40 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">设置新密码</h1>

          {done ? (
            <div>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                ✅ 密码已重置成功。3 秒后自动跳转到登录页...
              </p>
              <Link
                to="/login"
                className="block text-center w-full py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-medium text-sm transition"
              >
                立即登录
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-6">
                请输入新密码。设置后您可立即用新密码登录。
              </p>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    新密码
                  </label>
                  <input
                    type="password"
                    placeholder="至少 6 位"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    确认新密码
                  </label>
                  <input
                    type="password"
                    placeholder="再输一次"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition"
                  />
                </div>

                {error && (
                  <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || !token || !newPassword}
                  className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-medium text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? '设置中...' : '设置新密码'}
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
