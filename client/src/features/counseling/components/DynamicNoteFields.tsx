import React from 'react';
import type { NoteFieldDefinition } from '@psynote/shared';

interface Props {
  fieldDefinitions: NoteFieldDefinition[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  highlightField?: string; // field key to highlight (from AI suggestion)
}

export function DynamicNoteFields({ fieldDefinitions, values, onChange, highlightField }: Props) {
  const sorted = [...fieldDefinitions].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="space-y-3">
      {sorted.map((field) => (
        <div
          key={field.key}
          className={`transition-all ${
            highlightField === field.key ? 'ring-2 ring-brand-300 rounded-lg' : ''
          }`}
        >
          <label className="block text-xs text-slate-500 mb-1 font-medium">
            {field.label}
            {field.required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
          <textarea
            value={values[field.key] || ''}
            onChange={(e) => onChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            rows={4}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
          />
        </div>
      ))}
    </div>
  );
}
