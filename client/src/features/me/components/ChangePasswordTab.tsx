import React, { useState } from 'react';
import { Lock, Loader2, Check } from 'lucide-react';
import { useChangePassword } from '../../../api/useMe';

/**
 * Phase 14f — ChangePasswordTab.
 *
 * Simple 3-field form. If hasExistingPassword=false, the current-password
 * field is skipped (for legacy accounts that were seeded without a hash).
 * We always render it safely defaulting to true; the server handles the
 * edge case too.
 */
export function ChangePasswordTab({ hasExistingPassword = true }: { hasExistingPassword?: boolean }) {
  const change = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function reset() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirm('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('新密码至少 6 位');
      return;
    }
    if (newPassword !== confirm) {
      setError('两次输入的新密码不一致');
      return;
    }

    try {
      await change.mutateAsync({
        currentPassword: hasExistingPassword ? currentPassword : undefined,
        newPassword,
      });
      reset();
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 4000);
    } catch (err: any) {
      setError(err?.message || '修改失败');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      {hasExistingPassword && (
        <div>
          <label htmlFor="cur-pw" className="block text-sm font-medium text-slate-700 mb-1">
            当前密码 <span className="text-rose-500">*</span>
          </label>
          <input
            id="cur-pw"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>
      )}

      <div>
        <label htmlFor="new-pw" className="block text-sm font-medium text-slate-700 mb-1">
          新密码 <span className="text-rose-500">*</span>
        </label>
        <input
          id="new-pw"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200"
          placeholder="至少 6 位"
        />
      </div>

      <div>
        <label htmlFor="cnf-pw" className="block text-sm font-medium text-slate-700 mb-1">
          确认新密码 <span className="text-rose-500">*</span>
        </label>
        <input
          id="cnf-pw"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
      </div>

      {error && (
        <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={change.isPending || !newPassword || !confirm || (hasExistingPassword && !currentPassword)}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {change.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
          更新密码
        </button>
        {savedAt && (
          <span className="text-sm text-emerald-600 flex items-center gap-1">
            <Check className="w-4 h-4" />
            密码已更新
          </span>
        )}
      </div>

      <p className="text-[11px] text-slate-400 pt-3 border-t border-slate-100 mt-6">
        修改后当前登录会话仍然有效。如在其它设备登录过，建议同时手动退出。
      </p>
    </form>
  );
}
