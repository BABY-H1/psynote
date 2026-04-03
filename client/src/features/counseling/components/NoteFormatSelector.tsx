import React from 'react';
import type { NoteTemplate } from '@psynote/shared';

interface Props {
  value: string;
  onChange: (format: string, template?: NoteTemplate) => void;
  templates: NoteTemplate[];
}

const formatLabels: Record<string, string> = {
  soap: 'SOAP', dap: 'DAP', birp: 'BIRP', custom: '自定义',
};

export function NoteFormatSelector({ value, onChange, templates }: Props) {
  const builtIn = templates.filter((t) => t.id.startsWith('__'));
  const custom = templates.filter((t) => !t.id.startsWith('__'));

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">笔记格式：</span>
      <div className="flex gap-1">
        {builtIn.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.format, t)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
              value === t.format
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {formatLabels[t.format] || t.format.toUpperCase()}
          </button>
        ))}
        {custom.length > 0 && (
          <select
            value={!builtIn.some((b) => b.format === value) ? value : ''}
            onChange={(e) => {
              const t = custom.find((c) => c.id === e.target.value);
              if (t) onChange(t.format, t);
            }}
            className="px-2 py-1 border border-slate-200 rounded-lg text-xs"
          >
            <option value="" disabled>自定义模板...</option>
            {custom.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
