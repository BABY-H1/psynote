import React from 'react';

/**
 * The boxed section used for every grouped-fields card (Overview /
 * Chapter blueprint / etc). Extracted so every tab renders in a
 * consistent style without copy-pasting the classNames.
 */
export function CardSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

/**
 * Bi-modal field: a read-only paragraph when not editing, an input or
 * textarea when editing.
 *
 * Shared across Overview + ChapterDetail, which is why it lives in its
 * own primitives file rather than next to either.
 */
export function CourseField({
  label,
  value,
  editing,
  onChange,
  type = 'input',
  rows = 2,
  required = false,
  hint,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  type?: 'input' | 'textarea';
  rows?: number;
  required?: boolean;
  hint?: string;
}) {
  if (!editing && !value) {
    return (
      <div>
        <label className="text-xs text-slate-400 font-medium block mb-1">{label}</label>
        <p className="text-xs text-slate-300 italic">未填写</p>
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs text-slate-400 font-medium block mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
        {hint && <span className="text-slate-300 ml-2">{hint}</span>}
      </label>
      {editing ? (
        type === 'textarea' ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
          />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        )
      ) : (
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{value}</p>
      )}
    </div>
  );
}
