import React, { useState, useEffect } from 'react';
import { useClientProfile, useUpsertClientProfile } from '../../../../api/useClientProfile';
import { PageLoading } from '../../../../shared/components';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, X } from 'lucide-react';

interface Props {
  clientId: string;
  clientName: string;
  onBack: () => void;
  onNext: () => void;
}

const EDUCATION_OPTIONS = [
  { value: '', label: '未选择' },
  { value: '小学', label: '小学' },
  { value: '初中', label: '初中' },
  { value: '高中', label: '高中' },
  { value: '大专', label: '大专' },
  { value: '本科', label: '本科' },
  { value: '硕士', label: '硕士' },
  { value: '博士', label: '博士' },
  { value: '其他', label: '其他' },
];

const MARITAL_OPTIONS = [
  { value: '', label: '未选择' },
  { value: 'single', label: '未婚' },
  { value: 'married', label: '已婚' },
  { value: 'divorced', label: '离异' },
  { value: 'widowed', label: '丧偶' },
  { value: 'other', label: '其他' },
];

const PRESET_ISSUES = [
  '焦虑', '抑郁', '人际关系', '学业压力', '职场压力',
  '家庭冲突', '亲密关系', '自我认同', '睡眠问题', '情绪调节',
  '创伤/PTSD', '丧失/哀伤', '适应困难', '自伤/自杀',
];

export function ProfileStep({ clientId, clientName, onBack, onNext }: Props) {
  const { data: profile, isLoading } = useClientProfile(clientId);
  const upsert = useUpsertClientProfile();

  // A — 基本信息
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [occupation, setOccupation] = useState('');
  const [education, setEducation] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');

  // B — 紧急联系人
  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  const [ecRelationship, setEcRelationship] = useState('');

  // C — 临床背景
  const [showClinical, setShowClinical] = useState(false);
  const [presentingIssues, setPresentingIssues] = useState<string[]>([]);
  const [customIssue, setCustomIssue] = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');
  const [familyBackground, setFamilyBackground] = useState('');

  useEffect(() => {
    if (profile) {
      setPhone(profile.phone || '');
      setGender(profile.gender || '');
      setDateOfBirth(profile.dateOfBirth || '');
      setOccupation(profile.occupation || '');
      setEducation(profile.education || '');
      setMaritalStatus(profile.maritalStatus || '');
      const ec = profile.emergencyContact as { name?: string; phone?: string; relationship?: string } | null;
      if (ec) {
        setEcName(ec.name || '');
        setEcPhone(ec.phone || '');
        setEcRelationship(ec.relationship || '');
      }
      setPresentingIssues(Array.isArray(profile.presentingIssues) ? profile.presentingIssues : []);
      setMedicalHistory(profile.medicalHistory || '');
      setFamilyBackground(profile.familyBackground || '');
      // Auto-expand clinical section if data exists
      if (profile.medicalHistory || profile.familyBackground || (Array.isArray(profile.presentingIssues) && profile.presentingIssues.length > 0)) {
        setShowClinical(true);
      }
    }
  }, [profile]);

  const hasProfile = profile && (profile.phone || profile.gender || profile.dateOfBirth);

  const toggleIssue = (issue: string) => {
    setPresentingIssues((prev) =>
      prev.includes(issue) ? prev.filter((i) => i !== issue) : [...prev, issue],
    );
  };

  const addCustomIssue = () => {
    const trimmed = customIssue.trim();
    if (trimmed && !presentingIssues.includes(trimmed)) {
      setPresentingIssues((prev) => [...prev, trimmed]);
      setCustomIssue('');
    }
  };

  const handleSave = async () => {
    const data: Record<string, unknown> = {};
    if (phone) data.phone = phone;
    if (gender) data.gender = gender;
    if (dateOfBirth) data.dateOfBirth = dateOfBirth;
    if (occupation) data.occupation = occupation;
    if (education) data.education = education;
    if (maritalStatus) data.maritalStatus = maritalStatus;
    if (ecName || ecPhone || ecRelationship) {
      data.emergencyContact = { name: ecName, phone: ecPhone, relationship: ecRelationship };
    }
    if (presentingIssues.length > 0) data.presentingIssues = presentingIssues;
    if (medicalHistory) data.medicalHistory = medicalHistory;
    if (familyBackground) data.familyBackground = familyBackground;

    if (Object.keys(data).length > 0) {
      try {
        await upsert.mutateAsync({ userId: clientId, ...data } as any);
      } catch { /* proceed anyway */ }
    }
    onNext();
  };

  if (isLoading) return <PageLoading />;

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
  const labelCls = 'block text-xs text-slate-500 mb-1';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-bold text-slate-900 mb-1">确认来访者档案</h2>
      <p className="text-sm text-slate-500 mb-5">
        {hasProfile ? `${clientName} 已有基本档案，可查看或补充` : `填写 ${clientName} 的基本信息（均为选填，可随时补充）`}
      </p>

      {/* ── A: 基本信息 ── */}
      <div className="mb-5">
        <h3 className="text-xs font-semibold text-slate-700 mb-3 uppercase tracking-wide">基本信息</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>电话</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="手机号" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>性别</label>
            <select value={gender} onChange={(e) => setGender(e.target.value)} className={inputCls}>
              <option value="">未选择</option>
              <option value="male">男</option>
              <option value="female">女</option>
              <option value="other">其他</option>
              <option value="prefer_not_to_say">不愿透露</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>出生日期</label>
            <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>职业</label>
            <input value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="如：学生、教师" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>学历</label>
            <select value={education} onChange={(e) => setEducation(e.target.value)} className={inputCls}>
              {EDUCATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>婚姻状况</label>
            <select value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)} className={inputCls}>
              {MARITAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── B: 紧急联系人 ── */}
      <div className="mb-5">
        <h3 className="text-xs font-semibold text-slate-700 mb-3 uppercase tracking-wide">紧急联系人</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>姓名</label>
            <input value={ecName} onChange={(e) => setEcName(e.target.value)} placeholder="联系人姓名" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>电话</label>
            <input value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} placeholder="联系人电话" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>关系</label>
            <input value={ecRelationship} onChange={(e) => setEcRelationship(e.target.value)} placeholder="如：母亲、配偶" className={inputCls} />
          </div>
        </div>
      </div>

      {/* ── C: 临床背景（可折叠） ── */}
      <div className="mb-5">
        <button
          onClick={() => setShowClinical(!showClinical)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase tracking-wide hover:text-slate-900 transition"
        >
          临床背景
          {showClinical ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showClinical && (
          <div className="mt-3 space-y-4">
            {/* 呈现问题标签 */}
            <div>
              <label className={labelCls}>呈现问题</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PRESET_ISSUES.map((issue) => (
                  <button
                    key={issue}
                    onClick={() => toggleIssue(issue)}
                    className={`px-2.5 py-1 rounded-full text-xs transition ${
                      presentingIssues.includes(issue)
                        ? 'bg-brand-100 text-brand-700 border border-brand-300'
                        : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {issue}
                  </button>
                ))}
              </div>
              {/* 自定义标签 */}
              {presentingIssues.filter((i) => !PRESET_ISSUES.includes(i)).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {presentingIssues.filter((i) => !PRESET_ISSUES.includes(i)).map((issue) => (
                    <span key={issue} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-brand-100 text-brand-700 border border-brand-300">
                      {issue}
                      <button onClick={() => toggleIssue(issue)} className="hover:text-red-500"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={customIssue}
                  onChange={(e) => setCustomIssue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomIssue())}
                  placeholder="添加自定义标签..."
                  className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                />
                <button onClick={addCustomIssue} disabled={!customIssue.trim()}
                  className="px-3 py-1.5 text-xs text-brand-600 hover:bg-brand-50 rounded-lg disabled:opacity-30">
                  添加
                </button>
              </div>
            </div>

            {/* 既往病史 */}
            <div>
              <label className={labelCls}>既往病史</label>
              <textarea value={medicalHistory} onChange={(e) => setMedicalHistory(e.target.value)}
                rows={2} placeholder="躯体疾病、精神科诊断、用药史等"
                className={inputCls} />
            </div>

            {/* 家庭背景 */}
            <div>
              <label className={labelCls}>家庭背景</label>
              <textarea value={familyBackground} onChange={(e) => setFamilyBackground(e.target.value)}
                rows={2} placeholder="家庭结构、成长环境、重要关系等"
                className={inputCls} />
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 mb-4">以上信息均为选填，可跳过后在个案详情中补全。</p>

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
