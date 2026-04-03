import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateEpisode, useOrgMembers } from '../../../api/useCounseling';
import { useClientProfile, useUpsertClientProfile } from '../../../api/useClientProfile';
import { useConsentTemplates, useSendConsent } from '../../../api/useConsent';
import { useInviteMember } from '../../../api/useOrg';
import { PageLoading, useToast } from '../../../shared/components';
import { ArrowLeft, ArrowRight, Check, UserPlus, FileText } from 'lucide-react';

export function CreateEpisodeWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [complaint, setComplaint] = useState('');
  const [risk, setRisk] = useState('level_1');
  const [intervention, setIntervention] = useState('');
  const [selectedConsents, setSelectedConsents] = useState<string[]>([]);
  const [createdEpisodeId, setCreatedEpisodeId] = useState<string | null>(null);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back */}
      <button onClick={() => navigate('/episodes')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" /> 返回个案管理
      </button>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <React.Fragment key={s}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              s < step ? 'bg-brand-600 text-white' :
              s === step ? 'bg-brand-600 text-white' :
              'bg-slate-200 text-slate-500'
            }`}>
              {s < step ? <Check className="w-4 h-4" /> : s}
            </div>
            {s < 4 && <div className={`flex-1 h-0.5 ${s < step ? 'bg-brand-600' : 'bg-slate-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Steps */}
      {step === 1 && (
        <SelectClientStep
          clientId={clientId}
          onSelect={(id, name) => { setClientId(id); setClientName(name); }}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <ProfileStep
          clientId={clientId}
          clientName={clientName}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <ComplaintStep
          complaint={complaint}
          risk={risk}
          intervention={intervention}
          onComplaintChange={setComplaint}
          onRiskChange={setRisk}
          onInterventionChange={setIntervention}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <ConsentStep
          clientId={clientId}
          clientName={clientName}
          complaint={complaint}
          risk={risk}
          intervention={intervention}
          selectedConsents={selectedConsents}
          onToggleConsent={(id) => setSelectedConsents((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])}
          onBack={() => setStep(3)}
        />
      )}
    </div>
  );
}

// ─── Step 1: Select Client ──────────────────────────────────────

function SelectClientStep({
  clientId, onSelect, onNext,
}: {
  clientId: string;
  onSelect: (id: string, name: string) => void;
  onNext: () => void;
}) {
  const { data: members, isLoading } = useOrgMembers();
  const inviteMember = useInviteMember();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');

  const clients = (members || []).filter((m) => m.role === 'client');
  const filtered = clients.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()),
  );

  const handleAddClient = async () => {
    if (!newEmail) return;
    try {
      const member = await inviteMember.mutateAsync({ email: newEmail, role: 'client', name: newName || undefined });
      onSelect(member.userId, member.name);
      toast('来访者已添加', 'success');
      setShowAdd(false);
    } catch (err: any) {
      toast(err?.message || '添加失败', 'error');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-bold text-slate-900 mb-1">选择来访者</h2>
      <p className="text-sm text-slate-500 mb-4">从已有来访者中选择，或添加新的来访者</p>

      <div className="flex items-center gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索姓名或邮箱..."
          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"
        >
          <UserPlus className="w-4 h-4" />
          添加新来访者
        </button>
      </div>

      {showAdd && (
        <div className="bg-slate-50 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">邮箱 *</label>
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@example.com"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">姓名</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="来访者姓名"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs text-slate-500">取消</button>
            <button onClick={handleAddClient} disabled={!newEmail || inviteMember.isPending}
              className="px-4 py-1.5 bg-brand-600 text-white rounded-lg text-xs hover:bg-brand-500 disabled:opacity-50">
              {inviteMember.isPending ? '添加中...' : '添加'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? <PageLoading /> : filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400">
          {clients.length === 0 ? '暂无来访者，请先添加' : '未找到匹配的来访者'}
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.userId}
              onClick={() => onSelect(c.userId, c.name)}
              className={`w-full text-left p-3 rounded-lg border transition ${
                clientId === c.userId ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-sm font-medium text-slate-900">{c.name}</div>
              <div className="text-xs text-slate-400">{c.email}</div>
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-end mt-4">
        <button
          onClick={onNext}
          disabled={!clientId}
          className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5"
        >
          下一步 <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Confirm/Edit Profile ───────────────────────────────

function ProfileStep({
  clientId, clientName, onBack, onNext,
}: {
  clientId: string; clientName: string; onBack: () => void; onNext: () => void;
}) {
  const { data: profile, isLoading } = useClientProfile(clientId);
  const upsert = useUpsertClientProfile();
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');

  React.useEffect(() => {
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

      <p className="text-xs text-slate-400 mb-4">更多档案信息可在个案详情的"档案"标签中补全。</p>

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

// ─── Step 3: Chief Complaint ────────────────────────────────────

function ComplaintStep({
  complaint, risk, intervention, onComplaintChange, onRiskChange, onInterventionChange, onBack, onNext,
}: {
  complaint: string; risk: string; intervention: string;
  onComplaintChange: (v: string) => void; onRiskChange: (v: string) => void; onInterventionChange: (v: string) => void;
  onBack: () => void; onNext: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-bold text-slate-900 mb-1">主诉与初始评估</h2>
      <p className="text-sm text-slate-500 mb-4">描述来访原因和初步评估</p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">主诉</label>
          <textarea value={complaint} onChange={(e) => onComplaintChange(e.target.value)}
            rows={3} placeholder="简要描述来访者的主要问题..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">初始风险等级</label>
            <select value={risk} onChange={(e) => onRiskChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option value="level_1">一级（一般）</option>
              <option value="level_2">二级（关注）</option>
              <option value="level_3">三级（严重）</option>
              <option value="level_4">四级（危机）</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">干预方式（可选）</label>
            <select value={intervention} onChange={(e) => onInterventionChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option value="">待定</option>
              <option value="counseling">个体咨询</option>
              <option value="group">团体辅导</option>
              <option value="course">课程</option>
              <option value="referral">转介</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-between mt-6">
        <button onClick={onBack} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> 上一步
        </button>
        <button onClick={onNext}
          className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 flex items-center gap-1.5">
          下一步 <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Consent + Create ───────────────────────────────────

function ConsentStep({
  clientId, clientName, complaint, risk, intervention, selectedConsents, onToggleConsent, onBack,
}: {
  clientId: string; clientName: string; complaint: string; risk: string; intervention: string;
  selectedConsents: string[]; onToggleConsent: (id: string) => void; onBack: () => void;
}) {
  const navigate = useNavigate();
  const createEpisode = useCreateEpisode();
  const sendConsent = useSendConsent();
  const { data: templates } = useConsentTemplates();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);

  const consentTypeLabels: Record<string, string> = {
    treatment: '咨询知情同意', data_collection: '数据采集同意', ai_processing: 'AI辅助分析同意',
    data_sharing: '数据共享同意', research: '研究用途同意',
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const episode = await createEpisode.mutateAsync({
        clientId,
        chiefComplaint: complaint || undefined,
        currentRisk: risk,
        interventionType: intervention || undefined,
      });

      // Send consent documents
      for (const templateId of selectedConsents) {
        try {
          await sendConsent.mutateAsync({ clientId, careEpisodeId: episode.id, templateId });
        } catch { /* continue with others */ }
      }

      toast('个案创建成功', 'success');
      navigate(`/episodes/${episode.id}`);
    } catch {
      toast('创建失败', 'error');
      setCreating(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-bold text-slate-900 mb-1">发送知情同意书</h2>
      <p className="text-sm text-slate-500 mb-4">选择要发送给 {clientName} 的知情同意书（可跳过）</p>

      {templates && templates.length > 0 ? (
        <div className="space-y-2 mb-4">
          {templates.map((t) => (
            <label
              key={t.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                selectedConsents.includes(t.id) ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input type="checkbox" checked={selectedConsents.includes(t.id)} onChange={() => onToggleConsent(t.id)} className="rounded text-brand-600" />
              <FileText className="w-4 h-4 text-slate-400" />
              <div>
                <div className="text-sm font-medium text-slate-900">{t.title}</div>
                <div className="text-xs text-slate-400">{consentTypeLabels[t.consentType] || t.consentType}</div>
              </div>
            </label>
          ))}
        </div>
      ) : (
        <div className="text-sm text-slate-400 mb-4 py-4 text-center">
          暂无知情同意书模板，可在创建后手动发送
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={onBack} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> 上一步
        </button>
        <button onClick={handleCreate} disabled={creating}
          className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5">
          {creating ? '创建中...' : selectedConsents.length > 0 ? '创建个案并发送' : '创建个案'}
          <Check className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
