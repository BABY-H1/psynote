import React from 'react';
import type { NoteTemplate, NoteFieldDefinition } from '@psynote/shared';

export const BUILT_IN_FORMATS: { id: string; title: string; format: string; fieldDefinitions: NoteFieldDefinition[] }[] = [
  {
    id: '__soap__', title: 'SOAP 笔记', format: 'soap',
    fieldDefinitions: [
      { key: 'subjective', label: 'S - 主观资料', placeholder: '来访者自述的感受、想法、问题...', required: true, order: 1 },
      { key: 'objective', label: 'O - 客观资料', placeholder: '咨询师观察到的行为、表情、非语言信息...', required: true, order: 2 },
      { key: 'assessment', label: 'A - 评估分析', placeholder: '临床评估、诊断印象、问题分析...', required: true, order: 3 },
      { key: 'plan', label: 'P - 计划', placeholder: '下一步治疗计划、作业、随访安排...', required: true, order: 4 },
    ],
  },
  {
    id: '__dap__', title: 'DAP 笔记', format: 'dap',
    fieldDefinitions: [
      { key: 'data', label: 'D - 资料', placeholder: '主客观信息合并...', required: true, order: 1 },
      { key: 'assessment', label: 'A - 评估', placeholder: '临床评估与分析...', required: true, order: 2 },
      { key: 'plan', label: 'P - 计划', placeholder: '治疗计划与安排...', required: true, order: 3 },
    ],
  },
  {
    id: '__birp__', title: 'BIRP 笔记', format: 'birp',
    fieldDefinitions: [
      { key: 'behavior', label: 'B - 行为', placeholder: '来访者在会谈中的行为表现...', required: true, order: 1 },
      { key: 'intervention', label: 'I - 干预', placeholder: '咨询师使用的干预技术和方法...', required: true, order: 2 },
      { key: 'response', label: 'R - 反应', placeholder: '来访者对干预的反应和回应...', required: true, order: 3 },
      { key: 'plan', label: 'P - 计划', placeholder: '后续计划和安排...', required: true, order: 4 },
    ],
  },
];

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
