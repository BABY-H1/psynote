import React, { useState } from 'react';
import {
  useMyAvailability,
  useCreateAvailabilitySlot,
  useDeleteAvailabilitySlot,
  useUpdateAvailabilitySlot,
} from '../../../api/useAvailability';
import { PageLoading, EmptyState, useToast } from '../../../shared/components';
import type { CounselorAvailability } from '@psynote/shared';

const DAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun display order

const SESSION_TYPE_LABELS: Record<string, string> = {
  online: '线上',
  offline: '线下',
  phone: '电话',
};

/** Generate time options in 30-min increments: "08:00", "08:30", ... "21:00" */
function timeOptions() {
  const opts: string[] = [];
  for (let h = 8; h <= 21; h++) {
    opts.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 21) opts.push(`${String(h).padStart(2, '0')}:30`);
  }
  return opts;
}

const TIMES = timeOptions();

export function AvailabilitySettings() {
  const { data: slots, isLoading } = useMyAvailability();

  if (isLoading) return <PageLoading />;

  // Group slots by dayOfWeek
  const byDay = new Map<number, CounselorAvailability[]>();
  for (const day of DAY_ORDER) byDay.set(day, []);
  for (const slot of slots || []) {
    const arr = byDay.get(slot.dayOfWeek) || [];
    arr.push(slot);
    byDay.set(slot.dayOfWeek, arr);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">排班设置</h2>
          <p className="text-sm text-slate-500 mt-1">设置每周可预约的时间段，来访者将在这些时段内选择预约</p>
        </div>
      </div>

      <div className="space-y-3">
        {DAY_ORDER.map((day) => (
          <DayRow key={day} dayOfWeek={day} slots={byDay.get(day) || []} />
        ))}
      </div>
    </div>
  );
}

function DayRow({ dayOfWeek, slots }: { dayOfWeek: number; slots: CounselorAvailability[] }) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-slate-900">{DAY_LABELS[dayOfWeek]}</h3>
        <button
          onClick={() => setShowAdd(true)}
          className="text-xs text-brand-600 hover:underline"
        >
          + 添加时段
        </button>
      </div>

      {slots.length === 0 && !showAdd && (
        <p className="text-xs text-slate-400">未设置可用时段</p>
      )}

      <div className="space-y-2">
        {slots
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .map((slot) => (
            <SlotItem key={slot.id} slot={slot} />
          ))}
      </div>

      {showAdd && (
        <AddSlotForm
          dayOfWeek={dayOfWeek}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

function SlotItem({ slot }: { slot: CounselorAvailability }) {
  const deleteSlot = useDeleteAvailabilitySlot();
  const updateSlot = useUpdateAvailabilitySlot();
  const { toast } = useToast();

  return (
    <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
      <span className="text-sm font-medium text-slate-700">
        {slot.startTime} - {slot.endTime}
      </span>
      {slot.sessionType && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">
          {SESSION_TYPE_LABELS[slot.sessionType] || slot.sessionType}
        </span>
      )}
      {!slot.sessionType && (
        <span className="text-xs text-slate-400">不限类型</span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={async () => {
            await updateSlot.mutateAsync({
              slotId: slot.id,
              isActive: !slot.isActive,
            });
            toast(slot.isActive ? '已暂停' : '已启用', 'success');
          }}
          className={`text-xs px-2 py-0.5 rounded ${
            slot.isActive
              ? 'text-green-700 bg-green-50'
              : 'text-slate-400 bg-slate-100'
          }`}
        >
          {slot.isActive ? '启用中' : '已暂停'}
        </button>
        <button
          onClick={async () => {
            if (confirm('确定删除此时段？')) {
              await deleteSlot.mutateAsync(slot.id);
              toast('已删除', 'success');
            }
          }}
          className="text-xs text-red-500 hover:text-red-700"
        >
          删除
        </button>
      </div>
    </div>
  );
}

function AddSlotForm({
  dayOfWeek,
  onClose,
}: {
  dayOfWeek: number;
  onClose: () => void;
}) {
  const createSlot = useCreateAvailabilitySlot();
  const { toast } = useToast();
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [sessionType, setSessionType] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSlot.mutateAsync({
        dayOfWeek,
        startTime,
        endTime,
        sessionType: sessionType || undefined,
      });
      toast('时段已添加', 'success');
      onClose();
    } catch (err: any) {
      toast(err?.message || '添加失败', 'error');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 p-3 bg-slate-50 rounded-lg flex items-end gap-3">
      <div>
        <label className="block text-xs text-slate-500 mb-1">开始</label>
        <select
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {TIMES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">结束</label>
        <select
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {TIMES.filter((t) => t > startTime).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">类型</label>
        <select
          value={sessionType}
          onChange={(e) => setSessionType(e.target.value)}
          className="px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">不限</option>
          <option value="online">线上</option>
          <option value="offline">线下</option>
          <option value="phone">电话</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={createSlot.isPending}
        className="px-4 py-1.5 bg-brand-600 text-white rounded text-sm hover:bg-brand-500 disabled:opacity-50"
      >
        {createSlot.isPending ? '添加中...' : '添加'}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="text-xs text-slate-400 hover:text-slate-600"
      >
        取消
      </button>
    </form>
  );
}
