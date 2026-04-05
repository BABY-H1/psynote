import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  CheckCircle2, AlertCircle, Loader2, Users, Calendar, Hash,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface CheckinInfo {
  instanceTitle: string;
  sessionTitle: string;
  sessionNumber: number;
  sessionDate?: string;
  sessionStatus: string;
  members: {
    enrollmentId: string;
    name: string;
    checkedIn: string | null;
  }[];
  error?: string;
  message?: string;
}

export function PublicCheckin() {
  const { instanceId, sessionId } = useParams<{ instanceId: string; sessionId: string }>();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['publicCheckin', instanceId, sessionId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/public/groups/${instanceId}/checkin/${sessionId}`);
      return res.json() as Promise<CheckinInfo>;
    },
    enabled: !!instanceId && !!sessionId,
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
          <h1 className="text-lg font-bold text-slate-900 mb-2">{data?.message || '无法加载签到页'}</h1>
          <p className="text-sm text-slate-500">请检��链接是否正确</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-md mx-auto px-4 py-5">
          <h1 className="text-xl font-bold text-slate-900">{data.instanceTitle}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-slate-500">
            <span className="flex items-center gap-1">
              <Hash className="w-3.5 h-3.5" /> 第 {data.sessionNumber} 次
            </span>
            <span>{data.sessionTitle}</span>
            {data.sessionDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> {data.sessionDate}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">
        {/* Stats */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-600">签到进度</span>
            </div>
            <span className="text-sm font-semibold text-slate-900">
              {data.members.filter((m) => m.checkedIn).length} / {data.members.length}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 mt-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{
                width: data.members.length > 0
                  ? `${(data.members.filter((m) => m.checkedIn).length / data.members.length) * 100}%`
                  : '0%',
              }}
            />
          </div>
        </div>

        {/* Member list */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">请选择您的姓名签到</h2>
          {data.members.map((member) => (
            <MemberCheckinCard
              key={member.enrollmentId}
              member={member}
              instanceId={instanceId!}
              sessionId={sessionId!}
              onCheckedIn={() => refetch()}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MemberCheckinCard({ member, instanceId, sessionId, onCheckedIn }: {
  member: { enrollmentId: string; name: string; checkedIn: string | null };
  instanceId: string;
  sessionId: string;
  onCheckedIn: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const checkin = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/public/groups/${instanceId}/checkin/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId: member.enrollmentId }),
      });
      return res.json();
    },
    onSuccess: () => {
      setConfirming(false);
      onCheckedIn();
    },
  });

  if (member.checkedIn) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
        <span className="text-sm font-medium text-green-800">{member.name}</span>
        <span className="text-xs text-green-600 ml-auto">已签到</span>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
        <p className="text-sm text-slate-700 mb-3">
          确认以 <strong>{member.name}</strong> 的身份签到？
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => checkin.mutate()}
            disabled={checkin.isPending}
            className="flex-1 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
          >
            {checkin.isPending ? '签到中...' : '确认签到'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="w-full bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:bg-slate-50 hover:border-slate-300 transition text-left"
    >
      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
        <span className="text-sm font-semibold text-slate-600">
          {member.name.charAt(0)}
        </span>
      </div>
      <span className="text-sm font-medium text-slate-900">{member.name}</span>
      <span className="text-xs text-slate-400 ml-auto">点击签到</span>
    </button>
  );
}
