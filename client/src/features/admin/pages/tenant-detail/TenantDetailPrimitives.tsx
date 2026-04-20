import React from 'react';
import { X } from 'lucide-react';

/** A label + right-aligned value row. Used across overview and subscription. */
export function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

/** Small centered-backdrop modal wrapper used for add-member / issue-license / modify-license. */
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

/** Bi-modal service config field — paragraph in read mode, input in edit mode. */
export function ServiceField({
  label,
  value,
  editing,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  field: string;
  editing: boolean;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      {editing ? (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
          placeholder={type === 'password' ? '输入新值或留空保持不变' : ''}
        />
      ) : (
        <div className="text-sm text-slate-900 py-1.5">
          {value || <span className="text-slate-400">未配置</span>}
        </div>
      )}
    </div>
  );
}
