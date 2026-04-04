import React, { useState, useEffect } from 'react';
import { useClientProfile, useUpsertClientProfile } from '../../../../api/useClientProfile';
import { PageLoading } from '../../../../shared/components';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface Props {
  clientId: string;
  clientName: string;
  onBack: () => void;
  onNext: () => void;
}

export function ProfileStep({ clientId, clientName, onBack, onNext }: Props) {
  const { data: profile, isLoading } = useClientProfile(clientId);
  const upsert = useUpsertClientProfile();
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');

  useEffect(() => {
    if (profile) {
      setPhone(profile.phone || '');
      setGender(profile.gender || '');
      setDateOfBirth(profile.dateOfBirth || '');
    }
  }, [profile]);

  const hasProfile = profile && (profile.phone || profile.gender || profile.dateOfBirth);

  const handleSave = async () => {
    if (phone || gender || dateOfBirth) {
      try {
        await upsert.mutateAsync({
          userId: clientId,
          phone: phone || undefined,
          gender: (gender || undefined) as any,
          dateOfBirth: dateOfBirth || undefined,
        });
      } catch { /* ignore, proceed anyway */ }
    }
    onNext();
  };

  if (isLoading) return <PageLoading />;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-bold text-slate-900 mb-1">确认来访者档案</h2>
      <p className="text-sm text-slate-500 mb-4">
        {hasProfile ? `${clientName} 已有基本档案，可直接继续` : `补全 ${clientName} 的基本信息（可跳过）`}
      </p>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">电话</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="手机号"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">性别</label>
          <select value={gender} onChange={(e) => setGender(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
            <option value="">未选择</option>
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="other">其他</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">出生日期</label>
          <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
      </div>

      <p className="text-xs text-slate-400 mb-4">更多档案信息可在个案详情的"档案"标签中���全。</p>

      <div className="flex justify-between">
        <button onClick={onBack} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> 上一步
        </button>
        <button onClick={handleSave} disabled={upsert.isPending}
          className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5">
          {upsert.isPending ? '保存中...' : '下一步'} <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
