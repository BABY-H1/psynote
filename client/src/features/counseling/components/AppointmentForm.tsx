import React, { useState } from 'react';
import { useCreateAppointment } from '../../../api/useCounseling';
import { useToast } from '../../../shared/components';

interface Props {
  episodeId: string;
  clientId: string;
  onDone: () => void;
}

/** Add 50 minutes to a datetime-local string */
function addMinutes(datetimeLocal: string, minutes: number): string {
  if (!datetimeLocal) return '';
  const d = new Date(datetimeLocal);
  d.setMinutes(d.getMinutes() + minutes);
  // Format back to datetime-local
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AppointmentForm({ episodeId, clientId, onDone }: Props) {
  const createAppointment = useCreateAppointment();
  const { toast } = useToast();
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [type, setType] = useState('online');
  const [notes, setNotes] = useState('');

  const handleStartChange = (value: string) => {
    setStartTime(value);
    // Auto-fill endTime to startTime + 50 minutes
    if (value) {
      setEndTime(addMinutes(value, 50));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createAppointment.mutateAsync({
        careEpisodeId: episodeId,
        clientId,
        startTime,
        endTime,
        type,
        notes: notes || undefined,
      });
      toast('预约已创建', 'success');
      onDone();
    } catch (err: any) {
      toast(err?.message || '创建失败', 'error');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="font-semibold text-slate-900 mb-4">新建预约</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">开始时间</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => handleStartChange(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束时间</label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-xs text-slate-400 mt-1">默认 50 分钟</p>
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">类型</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="online">线上</option>
            <option value="offline">线下</option>
            <option value="phone">电话</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">备注</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onDone}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={createAppointment.isPending}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
          >
            {createAppointment.isPending ? '创建中...' : '创建预约'}
          </button>
        </div>
      </form>
    </div>
  );
}
