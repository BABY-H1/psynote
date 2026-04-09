import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateServiceWizard, type WizardStep } from '../../../shared/components';
import { SelectClientStep } from './episode-wizard/SelectClientStep';
import { ProfileStep } from './episode-wizard/ProfileStep';
import { ComplaintStep } from './episode-wizard/ComplaintStep';
import { AppointmentStep } from './episode-wizard/AppointmentStep';
import { ConsentStep } from './episode-wizard/ConsentStep';

/**
 * Phase 4d — CreateEpisodeWizard wrapped in `<CreateServiceWizard>` shell.
 *
 * Visual & behavioural changes from the previous version:
 *  - The hand-rolled progress dots (the row of 1..5 circles + connecting lines)
 *    are now provided by `<CreateServiceWizard>`.
 *  - The "返回个案管理" link is the wizard shell's `onBack` callback.
 *  - All 5 step bodies (`SelectClientStep`, `ProfileStep`, `ComplaintStep`,
 *    `AppointmentStep`, `ConsentStep`) are slotted into `children` based on
 *    `activeIndex`. The step components themselves are completely unchanged.
 *
 * The step indexing convention here is 0-based (matching CreateServiceWizard's
 * `activeIndex`), whereas the previous version used 1-based `step` state.
 */

const STEPS: WizardStep[] = [
  { key: 'select-client', label: '选择' },
  { key: 'profile', label: '档案' },
  { key: 'complaint', label: '主诉' },
  { key: 'appointment', label: '预约' },
  { key: 'consent', label: '协议' },
];

export function CreateEpisodeWizard() {
  const navigate = useNavigate();
  // 0-based index, in line with the new shell
  const [activeIndex, setActiveIndex] = useState(0);

  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [complaint, setComplaint] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentStart, setAppointmentStart] = useState('');
  const [appointmentEnd, setAppointmentEnd] = useState('');
  const [appointmentType, setAppointmentType] = useState('offline');
  const [selectedConsents, setSelectedConsents] = useState<string[]>([]);

  const goTo = (i: number) => setActiveIndex(i);

  return (
    <CreateServiceWizard
      steps={STEPS}
      activeIndex={activeIndex}
      onBack={() => navigate('/episodes')}
      backLabel="返回个案管理"
    >
      {activeIndex === 0 && (
        <SelectClientStep
          clientId={clientId}
          onSelect={(id, name) => { setClientId(id); setClientName(name); }}
          onNext={() => goTo(1)}
        />
      )}
      {activeIndex === 1 && (
        <ProfileStep
          clientId={clientId}
          clientName={clientName}
          onBack={() => goTo(0)}
          onNext={() => goTo(2)}
        />
      )}
      {activeIndex === 2 && (
        <ComplaintStep
          complaint={complaint}
          onComplaintChange={setComplaint}
          onBack={() => goTo(1)}
          onNext={() => goTo(3)}
        />
      )}
      {activeIndex === 3 && (
        <AppointmentStep
          date={appointmentDate}
          startTime={appointmentStart}
          endTime={appointmentEnd}
          type={appointmentType}
          onDateChange={setAppointmentDate}
          onStartChange={setAppointmentStart}
          onEndChange={setAppointmentEnd}
          onTypeChange={setAppointmentType}
          onBack={() => goTo(2)}
          onNext={() => goTo(4)}
        />
      )}
      {activeIndex === 4 && (
        <ConsentStep
          clientId={clientId}
          clientName={clientName}
          complaint={complaint}
          appointmentDate={appointmentDate}
          appointmentStart={appointmentStart}
          appointmentEnd={appointmentEnd}
          appointmentType={appointmentType}
          selectedConsents={selectedConsents}
          onToggleConsent={(id) =>
            setSelectedConsents((prev) =>
              prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
            )
          }
          onBack={() => goTo(3)}
        />
      )}
    </CreateServiceWizard>
  );
}
