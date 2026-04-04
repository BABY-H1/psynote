import React from 'react';
import { useAvailableSlots } from '../../../../api/useAvailability';
import { useAuthStore } from '../../../../stores/authStore';
import { ArrowLeft, ArrowRight, Clock } from 'lucide-react';

interface Props {
  date: string; startTime: string; endTime: string; type: string;
  onDateChange: (v: string) => void; onStartChange: (v: string) => void;
  onEndChange: (v: string) => void; onTypeChange: (v: string) => void;
  onBack: () => void; onNext: () => void;
}

export function AppointmentStep({ date, startTime, endTime, type, onDateChange, onStartChange, onEndChange, onTypeChange, onBack, onNext }: Props) {
  const userId = useAuthStore((s) => s.user?.id);
  const { data: slots } = useAvailableSlots(userId, date || undefined);

  const dateOptions: { value: string; label: string }[] = [];
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  for (let i = 1; i <= 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const val = d.toISOString().slice(0, 10);
    const label = `${d.getMonth() + 1}/${d.getDate()} ${weekdays[d.getDay()]}`;
    dateOptions.push({ value: val, label });
  }

  const handleStartChange = (v: string) => {
    onStartChange(v);
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
        <div>
          <label className="block text-xs text-slate-500 mb-2">选择日期</label>
          <div className="flex flex-wrap gap-2">
            {dateOptions.map((d) => (
              <button key={d.value} onClick={() => onDateChange(d.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  date === d.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}>{d.label}</button>
            ))}
          </div>
        </div>

        {date && (
          <div>
            <label className="block text-xs text-slate-500 mb-2">
              <Clock className="w-3 h-3 inline mr-1" />
              {slots && slots.length > 0 ? '可用时段（点击选择）' : '手动输入时间'}
            </label>
            {slots && slots.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-3">
                {slots.map((s, i) => (
                  <button key={i} onClick={() => { onStartChange(s.start); onEndChange(s.end); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      startTime === s.start ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}>{s.start} - {s.end}</button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 mb-3">{date ? '该日期暂无已设置的可用时段，请手动输入' : ''}</p>
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

        {date && startTime && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">咨询方式</label>
            <div className="flex gap-2">
              {[{ value: 'offline', label: '线下' }, { value: 'online', label: '线上' }, { value: 'phone', label: '电话' }].map((t) => (
                <button key={t.value} onClick={() => onTypeChange(t.value)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition ${
                    type === t.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}>{t.label}</button>
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
          {!date && <button onClick={onNext} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">跳过</button>}
          <button onClick={onNext} disabled={!!date && (!startTime || !endTime)}
            className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5">
            下一步 <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
