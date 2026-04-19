import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GraduationCap, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@client/stores/authStore';
import { api } from '@client/api/client';
import { useInvitationPreview, useAcceptParentInvitation } from '../api/useFamily';
import { useViewingContext } from '../stores/viewingContext';
import type { ParentRelation } from '@psynote/shared';
import { PARENT_RELATION_LABELS } from '@psynote/shared';

/**
 * Phase 14 — Parent self-bind landing page (no auth required).
 *
 * URL: /invite/:token (mounted in PortalApp.tsx outside the `!user` gate)
 *
 * Flow:
 *   1. Load preview via /api/public/parent-bind/:token
 *      → Show school + class name. If invalid/expired, show friendly error.
 *   2. Parent fills 4 fields:
 *        - 孩子姓名 (studentName)
 *        - 学号 (studentNumber)
 *        - 我的手机后4位 (phoneLast4)
 *        - 与孩子关系 (relation)
 *      + 自己的姓名 (myName) + 设置密码 (password)
 *   3. POST /api/public/parent-bind/:token
 *      → Server validates the 3 student-id fields against the class's
 *        school_student_profiles. ALL THREE must match (anti-impersonation).
 *      → On success: creates guardian user + binding + JWT bundle.
 *   4. Write JWT to authStore, set viewingContext to the child, jump to /portal.
 */
export function ParentBindPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, setAuth, setOrg } = useAuthStore();
  const setViewingAs = useViewingContext((s) => s.setViewingAs);

  const { data: preview, isLoading, error } = useInvitationPreview(token);
  const acceptMutation = useAcceptParentInvitation();

  const [studentName, setStudentName] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [relation, setRelation] = useState<ParentRelation>('mother');
  const [myName, setMyName] = useState('');
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [bound, setBound] = useState(false);

  // Effect-based redirect (must come after all hooks; doing this as an
  // early `<Navigate />` return would violate the rules of hooks once the
  // bind succeeds and we re-render with `user` set).
  useEffect(() => {
    if (user && bound) {
      navigate('/portal', { replace: true });
    }
  }, [user, bound, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm w-full bg-white rounded-2xl p-6 text-center border border-rose-100">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-slate-900 mb-1">邀请链接无效</h2>
          <p className="text-sm text-slate-500">链接可能已过期或被撤销，请联系老师重新发送。</p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');

    if (!studentName.trim() || !studentNumber.trim() || phoneLast4.length !== 4 || !myName.trim() || password.length < 6) {
      setSubmitError('请完整填写所有字段，密码至少 6 位');
      return;
    }
    if (!/^\d{4}$/.test(phoneLast4)) {
      setSubmitError('手机号后 4 位必须是 4 个数字');
      return;
    }

    try {
      const data = await acceptMutation.mutateAsync({
        token: token!,
        studentName: studentName.trim(),
        studentNumber: studentNumber.trim(),
        phoneLast4,
        relation,
        myName: myName.trim(),
        password,
      });

      // Apply auth state
      api.setToken(data.accessToken);
      setAuth(
        { id: data.user.id, email: data.user.email, name: data.user.name, createdAt: '' } as any,
        data.accessToken,
        data.refreshToken,
        data.user.isSystemAdmin ?? false,
      );
      const { planToTier } = await import('@psynote/shared');
      // Parent binding: student's org type is 'school' by definition
      // (parent binding only exists for school orgs).
      setOrg(data.orgId, 'client', planToTier('starter'), null, 'school');

      // Switch viewing context to the child immediately so HomeTab shows
      // the right thing on first paint.
      setViewingAs(data.child.id, data.child.name);

      // Trigger the post-mount redirect via effect (avoids hook-count
      // mismatch from doing setAuth + sync return in the same render).
      setBound(true);
    } catch (err: any) {
      setSubmitError(err?.message || '绑定失败，请重试');
    }
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-brand-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-500">{preview.orgName}</div>
            <div className="text-base font-semibold text-slate-900 truncate">
              {preview.classGrade} {preview.className} 家长绑定
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500 mb-5 leading-relaxed">
          为了核对您的身份，请准确填写孩子的姓名、学号，以及您手机号的后 4 位。
          这些信息需与老师录入系统的资料**完全一致**。
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Student identity (anti-impersonation: 3 fields all required) */}
          <Field label="孩子姓名" required>
            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="如：张小明"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200"
              autoComplete="off"
            />
          </Field>

          <Field label="学号" required>
            <input
              type="text"
              value={studentNumber}
              onChange={(e) => setStudentNumber(e.target.value)}
              placeholder="如：20240301"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200"
              autoComplete="off"
            />
          </Field>

          <Field label="您的手机号后 4 位" required hint="老师录入孩子资料时填写的家长手机后 4 位">
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={phoneLast4}
              onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4 位数字"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200 font-mono tracking-wider"
              autoComplete="off"
            />
          </Field>

          <Field label="您与孩子的关系" required>
            <div className="grid grid-cols-4 gap-2">
              {(['father', 'mother', 'guardian', 'other'] as ParentRelation[]).map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRelation(r)}
                  className={`px-2 py-2 text-xs rounded-lg border transition ${
                    relation === r
                      ? 'border-brand-400 bg-brand-50 text-brand-700 font-semibold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {PARENT_RELATION_LABELS[r]}
                </button>
              ))}
            </div>
          </Field>

          <div className="border-t border-slate-100 pt-3 mt-4">
            <Field label="您的姓名（用于登录展示）" required>
              <input
                type="text"
                value={myName}
                onChange={(e) => setMyName(e.target.value)}
                placeholder="如：王女士"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200"
                autoComplete="off"
              />
            </Field>

            <Field label="设置登录密码" required hint="至少 6 位">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200"
                autoComplete="new-password"
              />
            </Field>
          </div>

          {submitError && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={acceptMutation.isPending}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold py-3 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {acceptMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                正在绑定...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                绑定并登录
              </>
            )}
          </button>
        </form>

        <p className="text-[10px] text-slate-400 text-center mt-5 leading-relaxed">
          绑定后您将能查看孩子的预约和待签同意书，
          <br />
          但不会看到测评结果、咨询笔记等隐私内容。
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <div className="text-[10px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}
