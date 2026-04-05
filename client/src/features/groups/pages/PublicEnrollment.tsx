import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Users, MapPin, Calendar, Clock, Target, BookOpen,
  CheckCircle2, AlertCircle, Loader2, ArrowRight,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface GroupPublicInfo {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startDate?: string;
  schedule?: string;
  duration?: string;
  capacity?: number;
  approvedCount: number;
  pendingCount: number;
  spotsLeft: number | null;
  recruitmentAssessments: string[];
  scheme?: {
    title: string;
    description?: string;
    theory?: string;
    overallGoal?: string;
    targetAudience?: string;
    ageRange?: string;
    recommendedSize?: string;
    totalSessions?: number;
    sessionDuration?: string;
    frequency?: string;
    sessionCount: number;
  };
  error?: string;
  message?: string;
}

export function PublicEnrollment() {
  const { instanceId } = useParams<{ instanceId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['publicGroup', instanceId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/public/groups/${instanceId}`);
      return res.json() as Promise<GroupPublicInfo>;
    },
    enabled: !!instanceId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (error || !data || data.error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h1 className="text-lg font-bold text-slate-900 mb-2">
            {data?.message || '无法加载活动信息'}
          </h1>
          <p className="text-sm text-slate-500">
            {data?.error === 'not_recruiting' ? '请联系活动负责人获取更多信息。' : '请检查链接是否正确。'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-slate-900">{data.title}</h1>
          {data.description && (
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">{data.description}</p>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Key Info Cards */}
        <div className="grid grid-cols-2 gap-3">
          {data.startDate && (
            <InfoCard icon={<Calendar className="w-4 h-4 text-blue-500" />} label="开始日期" value={data.startDate} />
          )}
          {data.location && (
            <InfoCard icon={<MapPin className="w-4 h-4 text-green-500" />} label="地点" value={data.location} />
          )}
          {data.schedule && (
            <InfoCard icon={<Clock className="w-4 h-4 text-amber-500" />} label="时间安排" value={data.schedule} />
          )}
          {data.spotsLeft !== null && (
            <InfoCard
              icon={<Users className="w-4 h-4 text-violet-500" />}
              label="剩余名额"
              value={data.spotsLeft > 0 ? `${data.spotsLeft} 个` : '已满'}
              highlight={data.spotsLeft <= 3}
            />
          )}
        </div>

        {/* Scheme Details */}
        {data.scheme && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-violet-500" />
              <h2 className="text-sm font-semibold text-slate-900">活动方案</h2>
            </div>

            <div className="space-y-3">
              {data.scheme.overallGoal && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Target className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-400">目标</span>
                  </div>
                  <p className="text-sm text-slate-700">{data.scheme.overallGoal}</p>
                </div>
              )}

              {data.scheme.theory && (
                <div>
                  <span className="text-xs text-slate-400">理论基础</span>
                  <p className="text-sm text-slate-600 mt-0.5">{data.scheme.theory}</p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                {data.scheme.totalSessions && (
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-900">{data.scheme.totalSessions}</p>
                    <p className="text-xs text-slate-400">总次数</p>
                  </div>
                )}
                {data.scheme.sessionDuration && (
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-900">{data.scheme.sessionDuration}</p>
                    <p className="text-xs text-slate-400">每次时长</p>
                  </div>
                )}
                {data.scheme.frequency && (
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-900">{data.scheme.frequency}</p>
                    <p className="text-xs text-slate-400">频率</p>
                  </div>
                )}
              </div>

              {(data.scheme.targetAudience || data.scheme.ageRange) && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-400">适用对象</span>
                  <p className="text-sm text-slate-600 mt-0.5">
                    {[data.scheme.targetAudience, data.scheme.ageRange].filter(Boolean).join(' / ')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Enrollment Form */}
        <EnrollmentForm
          instanceId={data.id}
          spotsLeft={data.spotsLeft}
          hasRecruitmentAssessments={data.recruitmentAssessments.length > 0}
        />
      </div>
    </div>
  );
}

function InfoCard({ icon, label, value, highlight }: {
  icon: React.ReactNode; label: string; value: string; highlight?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${highlight ? 'border-amber-200 bg-amber-50' : 'border-slate-200'}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className={`text-sm font-medium ${highlight ? 'text-amber-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function EnrollmentForm({ instanceId, spotsLeft, hasRecruitmentAssessments }: {
  instanceId: string; spotsLeft: number | null; hasRecruitmentAssessments: boolean;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const apply = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/public/groups/${instanceId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: email || undefined, phone: phone || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || '报名失败');
      return data;
    },
    onSuccess: () => setSubmitted(true),
  });

  if (submitted) {
    return (
      <div className="bg-white rounded-xl border border-green-200 p-8 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">报名成功！</h2>
        <p className="text-sm text-slate-600 mb-4">
          您的报名申请已提交，请等待活动负责人审核。审核通过后会通过邮件通知您。
        </p>
        {hasRecruitmentAssessments && (
          <p className="text-xs text-slate-400">
            负责人可能会邀请您完成一份评估问卷，请留意邮件通知。
          </p>
        )}
      </div>
    );
  }

  if (spotsLeft !== null && spotsLeft <= 0) {
    return (
      <div className="bg-white rounded-xl border border-amber-200 p-8 text-center">
        <Users className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">名额已满</h2>
        <p className="text-sm text-slate-600">
          该活动名额已满，如有退出我们会通知等候中的报名者。
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-900 mb-4">报名信息</h2>

      <form onSubmit={(e) => { e.preventDefault(); apply.mutate(); }} className="space-y-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">姓名 *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="请输入您的姓名"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="用于接收审核通知"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">手机号</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="用于紧急联系"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {apply.error && (
          <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {(apply.error as Error).message}
          </div>
        )}

        <button
          type="submit"
          disabled={!name || apply.isPending}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 transition"
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
    </div>
  );
}
