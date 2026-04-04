import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { SelectClientStep } from './episode-wizard/SelectClientStep';
import { ProfileStep } from './episode-wizard/ProfileStep';
import { ComplaintStep } from './episode-wizard/ComplaintStep';
import { AppointmentStep } from './episode-wizard/AppointmentStep';
import { ConsentStep } from './episode-wizard/ConsentStep';

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
        <SelectClientStep clientId={clientId} onSelect={(id, name) => { setClientId(id); setClientName(name); }} onNext={() => setStep(2)} />
      )}
      {step === 2 && (
        <ProfileStep clientId={clientId} clientName={clientName} onBack={() => setStep(1)} onNext={() => setStep(3)} />
      )}
      {step === 3 && (
        <ComplaintStep complaint={complaint} onComplaintChange={setComplaint} onBack={() => setStep(2)} onNext={() => setStep(4)} />
      )}
      {step === 4 && (
        <AppointmentStep
          date={appointmentDate} startTime={appointmentStart} endTime={appointmentEnd} type={appointmentType}
          onDateChange={setAppointmentDate} onStartChange={setAppointmentStart} onEndChange={setAppointmentEnd} onTypeChange={setAppointmentType}
          onBack={() => setStep(3)} onNext={() => setStep(5)}
        />
      )}
      {step === 5 && (
        <ConsentStep
          clientId={clientId} clientName={clientName} complaint={complaint}
          appointmentDate={appointmentDate} appointmentStart={appointmentStart} appointmentEnd={appointmentEnd} appointmentType={appointmentType}
          selectedConsents={selectedConsents} onToggleConsent={(id) => setSelectedConsents((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])}
          onBack={() => setStep(4)}
        />
      )}
    </div>
  );
}
