import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateEpisode, useCreateAppointment, useOrgMembers } from '../../../api/useCounseling';
import { useClientProfile, useUpsertClientProfile } from '../../../api/useClientProfile';
import { useConsentTemplates, useSendConsent } from '../../../api/useConsent';
import { useAvailableSlots } from '../../../api/useAvailability';
import { useInviteMember } from '../../../api/useOrg';
import { useAuthStore } from '../../../stores/authStore';
import { PageLoading, useToast } from '../../../shared/components';
import { ArrowLeft, ArrowRight, Check, UserPlus, FileText, Calendar, Clock } from 'lucide-react';

export function CreateEpisodeWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [complaint, setComplaint] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentStart, setAppointmentStart] = useState('');
  const [appointmentEnd, setAppointmentEnd] = useState('');
  const [appointmentType, setAppointmentType] = useState('offline');
  const [selectedConsents, setSelectedConsents] = useState<string[]>([]);

  const TOTAL_STEPS = 5;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back */}
      <button onClick={() => navigate('/episodes')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" /> 返回个案管理
      </button>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
          <React.Fragment key={s}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              s < step ? 'bg-brand-600 text-white' :
              s === step ? 'bg-brand-600 text-white' :
              'bg-slate-200 text-slate-500'
            }`}>
              {s < step ? <Check className="w-4 h-4" /> : s}
            </div>
            {s < TOTAL_STEPS && <div className={`flex-1 h-0.5 ${s < step ? 'bg-brand-600' : 'bg-slate-200'}`} />}
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
          onComplaintChange={setComplaint}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <AppointmentStep
          date={appointmentDate}
          startTime={appointmentStart}
          endTime={appointmentEnd}
          type={appointmentType}
          onDateChange={setAppointmentDate}
          onStartChange={setAppointmentStart}
          onEndChange={setAppointmentEnd}
          onTypeChange={setAppointmentType}
          onBack={() => setStep(3)}
          onNext={() => setStep(5)}
        />
      )}
      {step === 5 && (
        <ConsentStep
          clientId={clientId}
          clientName={clientName}
          complaint={complaint}
          appointmentDate={appointmentDate}
          appointmentStart={appointmentStart}
          appointmentEnd={appointmentEnd}
          appointmentType={appointmentType}
          selectedConsents={selectedConsents}
          onToggleConsent={(id) => setSelectedConsents((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])}
          onBack={() => setStep(4)}
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
  complaint, onComplaintChange, onBack, onNext,
}: {
  complaint: string;
  onComplaintChange: (v: string) => void;
  onBack: () => void; onNext: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-bold text-slate-900 mb-1">来访原因</h2>
      <p className="text-sm text-slate-500 mb-4">简要描述来访者的主要问题（可跳过，后续补充）</p>

      <div>
        <label className="block text-xs text-slate-500 mb-1">主诉</label>
        <textarea value={complaint} onChange={(e) => onComplaintChange(e.target.value)}
          rows={4} placeholder="简要描述来访者的主要问题..."
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
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

// ─── Step 4: Schedule First Appointment ────────────────────────

function AppointmentStep({
  date, startTime, endTime, type,
  onDateChange, onStartChange, onEndChange, onTypeChange,
  onBack, onNext,
}: {
  date: string; startTime: string; endTime: string; type: string;
  onDateChange: (v: string) => void; onStartChange: (v: string) => void;
  onEndChange: (v: string) => void; onTypeChange: (v: string) => void;
  onBack: () => void; onNext: () => void;
}) {
  const userId = useAuthStore((s) => s.user?.id);
  const { data: slots } = useAvailableSlots(userId, date || undefined);

  // Generate next 14 days
  const dateOptions: { value: string; label: string }[] = [];
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  for (let i = 1; i <= 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const val = d.toISOString().slice(0, 10);
    const label = `${d.getMonth() + 1}/${d.getDate()} ${weekdays[d.getDay()]}`;
    dateOptions.push({ value: val, label });
  }

  // Auto-set end time when start time changes
  const handleStartChange = (v: string) => {
    onStartChange(v);
    // Default 50-minute session
    const [h, m] = v.split(':').map(Number);
    const endMin = h * 60 + m + 50;
    const eh = Math.floor(endMin / 60);
    const em = endMin % 60;
    if (eh < 24) {
      onEndChange(`${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-bold text-slate-900 mb-1">安排首次会谈</h2>
      <p className="text-sm text-slate-500 mb-4">为来访者安排第一次咨询时间（可跳过，后续安排）</p>

      <div className="space-y-4">
        {/* Date selection */}
        <div>
          <label className="block text-xs text-slate-500 mb-2">选择日期</label>
          <div className="flex flex-wrap gap-2">
            {dateOptions.map((d) => (
              <button
                key={d.value}
                onClick={() => onDateChange(d.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  date === d.value
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Time slots */}
        {date && (
          <div>
            <label className="block text-xs text-slate-500 mb-2">
              <Clock className="w-3 h-3 inline mr-1" />
              {slots && slots.length > 0 ? '可用时段（点击选择）' : '手动输入时间'}
            </label>
            {slots && slots.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-3">
                {slots.map((s, i) => {
                  const st = s.start;
                  const et = s.end;
                  const isSelected = startTime === st;
                  return (
                    <button
                      key={i}
                      onClick={() => { onStartChange(st); onEndChange(et); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {st} - {et}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 mb-3">
                {date ? '该日期暂无已设置的可用时段，请手动输入' : ''}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">开始时间</label>
                <input type="time" value={startTime} onChange={(e) => handleStartChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">结束时间</label>
                <input type="time" value={endTime} onChange={(e) => onEndChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </div>
            </div>
          </div>
        )}

        {/* Session type */}
        {date && startTime && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">咨询方式</label>
            <div className="flex gap-2">
              {[
                { value: 'offline', label: '线下' },
                { value: 'online', label: '线上' },
                { value: 'phone', label: '电话' },
              ].map((t) => (
                <button
                  key={t.value}
                  onClick={() => onTypeChange(t.value)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition ${
                    type === t.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between mt-6">
        <button onClick={onBack} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> 上一步
        </button>
        <div className="flex gap-2">
          {!date && (
            <button onClick={onNext}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">
              跳过
            </button>
          )}
          <button onClick={onNext} disabled={!!date && (!startTime || !endTime)}
            className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5">
            下一步 <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 5: Consent + Create ───────────────────────────────────

function ConsentStep({
  clientId, clientName, complaint,
  appointmentDate, appointmentStart, appointmentEnd, appointmentType,
  selectedConsents, onToggleConsent, onBack,
}: {
  clientId: string; clientName: string; complaint: string;
  appointmentDate: string; appointmentStart: string; appointmentEnd: string; appointmentType: string;
  selectedConsents: string[]; onToggleConsent: (id: string) => void; onBack: () => void;
}) {
  const navigate = useNavigate();
  const createEpisode = useCreateEpisode();
  const createAppointment = useCreateAppointment();
  const sendConsent = useSendConsent();
  const { data: templates } = useConsentTemplates();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);

  const hasAppointment = appointmentDate && appointmentStart && appointmentEnd;

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
      });

      // Create first appointment if scheduled
      if (hasAppointment) {
        try {
          await createAppointment.mutateAsync({
            careEpisodeId: episode.id,
            clientId,
            startTime: `${appointmentDate}T${appointmentStart}:00`,
            endTime: `${appointmentDate}T${appointmentEnd}:00`,
            type: appointmentType,
          });
        } catch { /* appointment creation is optional */ }
      }

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
      <h2 className="text-lg font-bold text-slate-900 mb-1">确认并创建</h2>
      <p className="text-sm text-slate-500 mb-4">选择要发送给 {clientName} 的知情同意书（可跳过）</p>

      {/* Appointment summary */}
      {hasAppointment && (
        <div className="flex items-center gap-2 px-3 py-2 bg-brand-50 rounded-lg text-sm text-brand-700 mb-4">
          <Calendar className="w-4 h-4" />
          <span>首次会谈：{appointmentDate} {appointmentStart}-{appointmentEnd}</span>
          <span className="text-xs px-1.5 py-0.5 bg-brand-100 rounded">
            {{ offline: '线下', online: '线上', phone: '电话' }[appointmentType] || appointmentType}
          </span>
        </div>
      )}

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
          {creating ? '创建中...' : selectedConsents.length > 0 ? '创建个案并发送' : hasAppointment ? '创建个案并预约' : '创建个案'}
          <Check className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
