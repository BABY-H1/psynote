import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCounselors, useCreateAppointmentRequest } from '@client/api/useClientPortal';
import { useAvailableSlots } from '@client/api/useAvailability';
import { PageLoading, EmptyState, useToast } from '@client/shared/components';

type Step = 'counselor' | 'datetime' | 'details' | 'done';

const SESSION_TYPE_LABELS: Record<string, string> = {
  online: '线上',
  offline: '线下',
  phone: '电话',
};

/**
 * Phase 8c — BookAppointment 简化:
 *
 * - 入口 A(从 ServiceDetail "预约下一次" 下钻):URL 携带 `?counselorId=xxx`,
 *   跳过 CounselorStep,直接进入 datetime 步。咨询师姓名通过 useCounselors
 *   查找自动填充。"上一步"直接 navigate(-1) 返回上级页面而非回到选咨询师。
 *
 * - 入口 B(从 HomeTab 或其他未绑定咨询师的地方):传统 3 步向导,
 *   用户从 CounselorStep 自己挑一个。
 *
 * - 完成后的 2 个按钮路由在 Phase 8c 已修复 —— 原"查看我的预约"指向
 *   已删除的 /portal/appointments 路由;原"返回服务大厅"指向已删除的
 *   ServiceHall 心智。新路由分别走 ServiceDetail 和 MyServicesTab。
 */
export function BookAppointment() {
  const [searchParams] = useSearchParams();
  const presetCounselorId = searchParams.get('counselorId');

  // 当外部通过 ?counselorId=... 预选了咨询师(从 ServiceDetail 下钻进入),
  // 跳过 CounselorStep,直接进入 datetime 步。
  const [step, setStep] = useState<Step>(presetCounselorId ? 'datetime' : 'counselor');
  const [counselorId, setCounselorId] = useState(presetCounselorId ?? '');
  const [counselorName, setCounselorName] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [sessionType, setSessionType] = useState('online');
  const [notes, setNotes] = useState('');

  const navigate = useNavigate();

  // 当有 preset 时,从咨询师列表查找姓名填进 state 供 summary 展示。
  // 只在 preset 模式下触发,避免对手动挑选流程产生任何干扰。
  const { data: counselorList } = useCounselors();
  useEffect(() => {
    if (presetCounselorId && !counselorName && counselorList) {
      const found = (counselorList as any[]).find((c) => c.id === presetCounselorId);
      if (found) setCounselorName(found.name);
    }
  }, [presetCounselorId, counselorName, counselorList]);

  const progressSteps = [
    ...(presetCounselorId ? [] : [{ key: 'counselor', label: '选择咨询师' }]),
    { key: 'datetime', label: '选择时间' },
    { key: 'details', label: '填写信息' },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-900">预约咨询</h2>

      {/* Progress steps */}
      {step !== 'done' && (
        <div className="flex items-center gap-2 text-xs">
          {progressSteps.map((s, i) => (
            <React.Fragment key={s.key}>
              {i > 0 && <span className="text-slate-300">›</span>}
              <span className={step === s.key ? 'text-brand-600 font-semibold' : 'text-slate-400'}>
                {s.label}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {step === 'counselor' && (
        <CounselorStep
          onSelect={(id, name) => {
            setCounselorId(id);
            setCounselorName(name);
            setStep('datetime');
          }}
        />
      )}

      {step === 'datetime' && (
        <DateTimeStep
          counselorId={counselorId}
          counselorName={counselorName}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          selectedSlot={selectedSlot}
          onSlotSelect={setSelectedSlot}
          onBack={() => (presetCounselorId ? navigate(-1) : setStep('counselor'))}
          onNext={() => setStep('details')}
        />
      )}

      {step === 'details' && (
        <DetailsStep
          counselorId={counselorId}
          counselorName={counselorName}
          selectedDate={selectedDate}
          selectedSlot={selectedSlot!}
          sessionType={sessionType}
          onSessionTypeChange={setSessionType}
          notes={notes}
          onNotesChange={setNotes}
          onBack={() => setStep('datetime')}
          onDone={() => setStep('done')}
        />
      )}

      {step === 'done' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
          <div className="text-4xl mb-4">&#10003;</div>
          <h3 className="text-base font-bold text-slate-900 mb-2">预约请求已提交</h3>
          <p className="text-sm text-slate-500 mb-6">
            您的预约请求已发送给 {counselorName}，等待咨询师确认后会通知您。
          </p>
          <div className="flex flex-col gap-2">
            {counselorId && (
              <button
                onClick={() => navigate(`/portal/services/counseling/${counselorId}`)}
                className="w-full px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-500"
              >
                返回咨询详情
              </button>
            )}
            <button
              onClick={() => navigate('/portal/services')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50"
            >
              返回我的服务
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CounselorStep({ onSelect }: { onSelect: (id: string, name: string) => void }) {
  const { data: counselors, isLoading } = useCounselors();
  const [searchParams] = useSearchParams();
  const preferredId = searchParams.get('counselorId');

  if (isLoading) return <PageLoading />;

  if (!counselors || counselors.length === 0) {
    return <EmptyState title="暂无可预约的咨询师" />;
  }

  // Sort: preferred (from link) first, then isMyCounselor (from backend), then rest
  const sorted = [...counselors].sort((a, b) => {
    if (preferredId) {
      if (a.id === preferredId && b.id !== preferredId) return -1;
      if (a.id !== preferredId && b.id === preferredId) return 1;
    }
    const aIsMine = (a as any).isMyCounselor;
    const bIsMine = (b as any).isMyCounselor;
    if (aIsMine && !bIsMine) return -1;
    if (!aIsMine && bIsMine) return 1;
    return 0;
  });

  return (
    <div className="grid gap-3">
      {sorted.map((c) => {
        const isMine = (c as any).isMyCounselor;
        const isPreferred = c.id === preferredId;
        const specialties = (c as any).specialties as string[] | undefined;

        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id, c.name)}
            className={`bg-white rounded-2xl border p-4 text-left hover:border-brand-500 hover:bg-brand-50 transition ${
              isPreferred || isMine ? 'border-brand-300 bg-brand-50/30' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-bold">
                {c.name.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{c.name}</span>
                  {isMine && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-brand-100 text-brand-700 rounded-full">
                      您的咨询师
                    </span>
                  )}
                  {isPreferred && !isMine && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                      推荐
                    </span>
                  )}
                </div>
                {specialties && specialties.length > 0 ? (
                  <div className="text-xs text-slate-400 mt-0.5">{specialties.join(' · ')}</div>
                ) : (
                  <div className="text-xs text-slate-400">心理咨询师</div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Generate next 14 dates starting from tomorrow */
function getDateOptions() {
  const dates: { value: string; label: string }[] = [];
  const today = new Date();
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const value = d.toISOString().slice(0, 10);
    const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    const label = `${d.getMonth() + 1}/${d.getDate()} ${weekday}`;
    dates.push({ value, label });
  }
  return dates;
}

function DateTimeStep({
  counselorId,
  counselorName,
  selectedDate,
  onDateChange,
  selectedSlot,
  onSlotSelect,
  onBack,
  onNext,
}: {
  counselorId: string;
  counselorName: string;
  selectedDate: string;
  onDateChange: (d: string) => void;
  selectedSlot: { start: string; end: string } | null;
  onSlotSelect: (s: { start: string; end: string }) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { data: slots, isLoading } = useAvailableSlots(
    counselorId,
    selectedDate || undefined,
  );

  const dateOptions = getDateOptions();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-5">
      <div className="text-sm text-slate-500">
        咨询师: <span className="font-medium text-slate-900">{counselorName || '加载中...'}</span>
      </div>

      {/* Date selection */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">选择日期</label>
        <div className="flex flex-wrap gap-2">
          {dateOptions.map((d) => (
            <button
              key={d.value}
              onClick={() => { onDateChange(d.value); onSlotSelect(null as any); }}
              className={`px-3 py-1.5 rounded-lg text-xs border transition ${
                selectedDate === d.value
                  ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Time slot selection */}
      {selectedDate && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">选择时段</label>
          {isLoading ? (
            <PageLoading />
          ) : !slots || slots.length === 0 ? (
            <p className="text-sm text-slate-400">该日期无可用时段</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => {
                const isSelected = selectedSlot?.start === s.start && selectedSlot?.end === s.end;
                return (
                  <button
                    key={`${s.start}-${s.end}`}
                    onClick={() => onSlotSelect({ start: s.start, end: s.end })}
                    className={`px-4 py-2 rounded-lg text-sm border transition ${
                      isSelected
                        ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {s.start} - {s.end}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 justify-end pt-2">
        <button
          onClick={onBack}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
        >
          上一步
        </button>
        <button
          onClick={onNext}
          disabled={!selectedSlot}
          className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
        >
          下一步
        </button>
      </div>
    </div>
  );
}

function DetailsStep({
  counselorId,
  counselorName,
  selectedDate,
  selectedSlot,
  sessionType,
  onSessionTypeChange,
  notes,
  onNotesChange,
  onBack,
  onDone,
}: {
  counselorId: string;
  counselorName: string;
  selectedDate: string;
  selectedSlot: { start: string; end: string };
  sessionType: string;
  onSessionTypeChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const createRequest = useCreateAppointmentRequest();
  const { toast } = useToast();

  const handleSubmit = async () => {
    try {
      await createRequest.mutateAsync({
        counselorId,
        startTime: `${selectedDate}T${selectedSlot.start}:00`,
        endTime: `${selectedDate}T${selectedSlot.end}:00`,
        type: sessionType,
        notes: notes || undefined,
      });
      onDone();
    } catch (err: any) {
      toast(err?.message || '预约失败，请重试', 'error');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-5">
      {/* Summary */}
      <div className="p-4 bg-slate-50 rounded-lg space-y-1 text-sm">
        <div><span className="text-slate-500">咨询师:</span> <span className="text-slate-900">{counselorName}</span></div>
        <div><span className="text-slate-500">日期:</span> <span className="text-slate-900">{selectedDate}</span></div>
        <div><span className="text-slate-500">时间:</span> <span className="text-slate-900">{selectedSlot.start} - {selectedSlot.end}</span></div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">咨询方式</label>
        <div className="flex gap-2">
          {(['online', 'offline', 'phone'] as const).map((t) => (
            <button
              key={t}
              onClick={() => onSessionTypeChange(t)}
              className={`px-4 py-2 rounded-lg text-sm border transition ${
                sessionType === t
                  ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {SESSION_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">备注（可选）</label>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={3}
          placeholder="简要描述您希望咨询的问题..."
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="flex gap-3 justify-end pt-2">
        <button
          onClick={onBack}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
        >
          上一步
        </button>
        <button
          onClick={handleSubmit}
          disabled={createRequest.isPending}
          className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
        >
          {createRequest.isPending ? '提交中...' : '提交预约'}
        </button>
      </div>
    </div>
  );
}
