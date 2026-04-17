import React, { useState } from 'react';
import { Plus, X, Loader2, Check } from 'lucide-react';
import { useUpdateMyMemberProfile, type MeProfile } from '../../../api/useMe';

/**
 * Phase 14f — CounselorProfileTab: edit own bio / specialties /
 * certifications on the current org_members row.
 *
 * Only counselors (and org_admins who also see clients) are shown this tab
 * — filtered upstream in MySettings.tsx. For non-counselor members without
 * a membership, the tab shows a friendly hint.
 */
export function CounselorProfileTab({ me }: { me: MeProfile }) {
  const update = useUpdateMyMemberProfile();

  const member = me.member;
  const initialBio = member?.bio ?? '';
  const initialSpecialties = (member?.specialties ?? []) as string[];
  const initialCertifications = (member?.certifications ?? []) as Array<{ name: string; issuer?: string; year?: string }>;

  const [bio, setBio] = useState(initialBio);
  const [specialties, setSpecialties] = useState<string[]>(initialSpecialties);
  const [newSpecialty, setNewSpecialty] = useState('');
  const [certifications, setCertifications] = useState(initialCertifications);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState('');

  if (!member) {
    return (
      <div className="max-w-xl">
        <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl text-sm text-slate-500">
          您尚未加入任何机构，暂时无法编辑咨询师档案。
        </div>
      </div>
    );
  }

  const dirty = bio !== initialBio
    || JSON.stringify(specialties) !== JSON.stringify(initialSpecialties)
    || JSON.stringify(certifications) !== JSON.stringify(initialCertifications);

  function addSpecialty() {
    const v = newSpecialty.trim();
    if (!v) return;
    if (specialties.includes(v)) { setNewSpecialty(''); return; }
    setSpecialties([...specialties, v]);
    setNewSpecialty('');
  }

  function removeSpecialty(idx: number) {
    setSpecialties(specialties.filter((_, i) => i !== idx));
  }

  function addCertification() {
    setCertifications([...certifications, { name: '', issuer: '', year: '' }]);
  }

  function updateCertification(idx: number, patch: Partial<{ name: string; issuer: string; year: string }>) {
    setCertifications(certifications.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }

  function removeCertification(idx: number) {
    setCertifications(certifications.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setError('');
    try {
      // Filter out empty certifications before submitting
      const cleanedCerts = certifications.filter((c) => (c.name || '').trim());
      await update.mutateAsync({
        bio: bio.trim() || null,
        specialties,
        certifications: cleanedCerts,
      });
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    } catch (err: any) {
      setError(err?.message || '保存失败');
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {member.orgName && (
        <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
          当前正在编辑在「{member.orgName}」机构下的咨询师档案
        </div>
      )}

      {/* Bio */}
      <div>
        <label htmlFor="my-bio" className="block text-sm font-medium text-slate-700 mb-1">
          个人简介
        </label>
        <textarea
          id="my-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          placeholder="简短介绍您的专业背景、咨询风格等（展示给来访者参考）"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
      </div>

      {/* Specialties */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">擅长领域</label>
        {specialties.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {specialties.map((s, i) => (
              <span key={`${s}-${i}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-50 text-brand-700 rounded-full text-xs">
                {s}
                <button type="button" onClick={() => removeSpecialty(i)} className="ml-0.5 hover:text-brand-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={newSpecialty}
            onChange={(e) => setNewSpecialty(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSpecialty(); } }}
            placeholder="如：抑郁症、焦虑、亲密关系..."
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <button
            type="button"
            onClick={addSpecialty}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            添加
          </button>
        </div>
      </div>

      {/* Certifications */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-slate-700">资质证书</label>
          <button
            type="button"
            onClick={addCertification}
            className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            新增一项
          </button>
        </div>
        {certifications.length === 0 && (
          <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-lg">
            暂无证书。点击「新增一项」添加。
          </div>
        )}
        <div className="space-y-2">
          {certifications.map((cert, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={cert.name || ''}
                onChange={(e) => updateCertification(i, { name: e.target.value })}
                placeholder="证书名称（必填）"
                className="flex-[2] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
              <input
                type="text"
                value={cert.issuer || ''}
                onChange={(e) => updateCertification(i, { issuer: e.target.value })}
                placeholder="发证机构"
                className="flex-[2] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
              <input
                type="text"
                value={cert.year || ''}
                onChange={(e) => updateCertification(i, { year: e.target.value })}
                placeholder="年份"
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
              <button
                type="button"
                onClick={() => removeCertification(i)}
                className="p-2 text-slate-400 hover:text-rose-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      {error && (
        <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>
      )}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          disabled={!dirty || update.isPending}
          onClick={handleSave}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {update.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          保存
        </button>
        {savedAt && (
          <span className="text-sm text-emerald-600 flex items-center gap-1">
            <Check className="w-4 h-4" />
            已保存
          </span>
        )}
      </div>
    </div>
  );
}
