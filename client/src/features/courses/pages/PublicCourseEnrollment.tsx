import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  BookOpen, Users, CheckCircle2, AlertCircle, Loader2, ArrowRight,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface CoursePublicInfo {
  id: string;
  title: string;
  description?: string;
  capacity?: number;
  enrolledCount: number;
  spotsLeft: number | null;
  error?: string;
  message?: string;
}

export function PublicCourseEnrollment() {
  const { instanceId } = useParams<{ instanceId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['publicCourse', instanceId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/public/courses/${instanceId}`);
      return res.json() as Promise<CoursePublicInfo>;
    },
    enabled: !!instanceId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 via-slate-50 to-violet-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (error || !data || data.error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 via-slate-50 to-violet-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h1 className="text-lg font-bold text-slate-900 mb-2">
            {data?.message || '无法加载课程信息'}
          </h1>
          <p className="text-sm text-slate-500">
            {data?.error === 'not_recruiting' ? '该课程暂未开放报名，请联系负责人获取更多信息。' : '请检查链接是否正确。'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-slate-50 to-violet-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900">PsyNote</span>
          </div>
          <p className="text-xs text-slate-400">课程报名</p>
        </div>

        {/* Course Info Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
          {/* Course Header */}
          <div className="px-6 pt-6 pb-4 border-b border-slate-100">
            <h1 className="text-xl font-bold text-slate-900 mb-1">{data.title}</h1>
            {data.description && (
              <p className="text-sm text-slate-500 leading-relaxed">{data.description}</p>
            )}

            {/* Capacity Info */}
            <div className="flex items-center gap-4 mt-4">
              {data.capacity != null && (
                <div className="flex items-center gap-1.5 text-sm text-slate-500">
                  <Users className="w-4 h-4 text-violet-500" />
                  <span>容量 {data.capacity} 人</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-sm text-slate-500">
                <Users className="w-4 h-4 text-blue-500" />
                <span>已报名 {data.enrolledCount} 人</span>
              </div>
              {data.spotsLeft !== null && (
                <div className={`flex items-center gap-1.5 text-sm font-medium ${data.spotsLeft <= 3 ? 'text-amber-600' : 'text-green-600'}`}>
                  {data.spotsLeft > 0 ? `剩余 ${data.spotsLeft} 个名额` : '名额已满'}
                </div>
              )}
            </div>
          </div>

          {/* Enrollment Form */}
          <div className="px-6 py-5">
            <EnrollmentForm instanceId={data.id} spotsLeft={data.spotsLeft} />
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-300 mt-6">
          Powered by PsyNote
        </p>
      </div>
    </div>
  );
}

function EnrollmentForm({ instanceId, spotsLeft }: {
  instanceId: string;
  spotsLeft: number | null;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const apply = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/public/courses/${instanceId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone: phone || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || '报名失败');
      return data;
    },
    onSuccess: () => setSubmitted(true),
  });

  if (submitted) {
    return (
      <div className="text-center py-6">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">报名成功！</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          报名成功，请等待审核。审核结果将通过邮件通知您。
        </p>
      </div>
    );
  }

  if (spotsLeft !== null && spotsLeft <= 0) {
    return (
      <div className="text-center py-6">
        <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <Users className="w-8 h-8 text-amber-400" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">名额已满</h2>
        <p className="text-sm text-slate-500">
          该课程名额已满，如有退出我们会通知等候中的报名者。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); apply.mutate(); }} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">姓名 *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="请输入您的姓名"
          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">邮箱 *</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="用于接收审核通知"
          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">手机号</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="选填，用于紧急联系"
          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
        />
      </div>

      {apply.error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{(apply.error as Error).message}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={!name || !email || apply.isPending}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow"
      >
        {apply.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            提交报名
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </form>
  );
}
