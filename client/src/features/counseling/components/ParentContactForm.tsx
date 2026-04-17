/**
 * 家长联系留痕表单 (Phase 13 危机处置工作流中使用).
 *
 * 本组件 **只做记录**,不发送任何消息.系统边界: 老师用电话/微信/
 * 面谈等站外方式沟通,填完这张表就把沟通事实落到 careTimeline + 危机清单.
 */
import React, { useState } from 'react';
import type {
  ParentContactMethod,
  ParentContactStep,
} from '@psynote/shared';
import { PARENT_CONTACT_METHOD_LABELS } from '@psynote/shared';
import { Save } from 'lucide-react';

interface Props {
  initial?: ParentContactStep;
  onSubmit: (data: ParentContactStep) => Promise<void> | void;
  submitting?: boolean;
}

export function ParentContactForm({ initial, onSubmit, submitting }: Props) {
  const [method, setMethod] = useState<ParentContactMethod>(initial?.method || 'phone');
  const [contactName, setContactName] = useState(initial?.contactName || '');
  const [contactedAt, setContactedAt] = useState(() => {
    if (initial?.contactedAt) return initial.contactedAt.slice(0, 16);
    // Default to "now" in local-datetime input format
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [summary, setSummary] = useState(initial?.summary || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim()) {
      alert('请填写联系对象(父/母/监护人姓名)');
      return;
    }
    if (!summary.trim()) {
      alert('请填写沟通要点摘要');
      return;
    }
    await onSubmit({
      done: true,
      method,
      contactName: contactName.trim(),
      contactedAt: new Date(contactedAt).toISOString(),
      summary: summary.trim(),
      completedAt: new Date().toISOString(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">沟通方式 *</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as ParentContactMethod)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            {(Object.entries(PARENT_CONTACT_METHOD_LABELS) as [ParentContactMethod, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">沟通时间 *</label>
          <input
            type="datetime-local"
            value={contactedAt}
            onChange={(e) => setContactedAt(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">联系对象 *</label>
        <input
          type="text"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="例如: 母亲 王某 / 监护人 李某"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">沟通要点摘要 *</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="已告知的风险情况、家长反应、达成的下一步安排..."
          rows={3}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          {submitting ? '保存中...' : (initial?.done ? '更新记录' : '保存联系记录')}
        </button>
      </div>
    </form>
  );
}
