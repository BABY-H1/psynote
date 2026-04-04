import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateEpisode, useCreateAppointment } from '../../../../api/useCounseling';
import { useConsentTemplates, useSendConsent } from '../../../../api/useConsent';
import { useToast } from '../../../../shared/components';
import { ArrowLeft, Check, FileText, Calendar } from 'lucide-react';

interface Props {
  clientId: string; clientName: string; complaint: string;
  appointmentDate: string; appointmentStart: string; appointmentEnd: string; appointmentType: string;
  selectedConsents: string[]; onToggleConsent: (id: string) => void; onBack: () => void;
}

export function ConsentStep({ clientId, clientName, complaint, appointmentDate, appointmentStart, appointmentEnd, appointmentType, selectedConsents, onToggleConsent, onBack }: Props) {
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
      const episode = await createEpisode.mutateAsync({ clientId, chiefComplaint: complaint || undefined });

      if (hasAppointment) {
        try {
          await createAppointment.mutateAsync({
            careEpisodeId: episode.id, clientId,
            startTime: `${appointmentDate}T${appointmentStart}:00`,
            endTime: `${appointmentDate}T${appointmentEnd}:00`,
            type: appointmentType,
          });
        } catch { /* appointment creation is optional */ }
      }

      for (const templateId of selectedConsents) {
        try { await sendConsent.mutateAsync({ clientId, careEpisodeId: episode.id, templateId }); } catch { /* continue */ }
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
            <label key={t.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                selectedConsents.includes(t.id) ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
              }`}>
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
        <div className="text-sm text-slate-400 mb-4 py-4 text-center">暂无知情同意书模板，可在创建后手动发送</div>
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
