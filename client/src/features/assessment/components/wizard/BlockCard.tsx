import React, { useState } from 'react';
import type { AssessmentBlock, DemographicField, CustomQuestion } from '@psynote/shared';
import { Plus, Trash2 } from 'lucide-react';

const DEMOGRAPHIC_PRESETS: DemographicField[] = [
  { id: 'gender', label: '性别', type: 'select', required: false, options: ['男', '女', '其他'] },
  { id: 'age', label: '年龄', type: 'number', required: false },
  { id: 'grade', label: '年级', type: 'select', required: false, options: ['大一', '大二', '大三', '大四', '研一', '研二', '研三'] },
  { id: 'class', label: '班级', type: 'text', required: false },
  { id: 'student_id', label: '学号', type: 'text', required: false },
  { id: 'department', label: '部门/院系', type: 'text', required: false },
];

export function BlockCard({ block, index, total, scales, onMove, onRemove, onUpdate }: {
  block: AssessmentBlock; index: number; total: number; scales: { id: string; title: string }[];
  onMove: (dir: -1 | 1) => void; onRemove: () => void; onUpdate: (patch: Partial<AssessmentBlock>) => void;
}) {
  const scaleName = block.scaleId ? scales.find((s) => s.id === block.scaleId)?.title : null;
  const typeLabels: Record<string, string> = { scale: '量表', demographics: '人口学信息', custom_questions: '自定义题目' };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-xs text-slate-400">{typeLabels[block.type]}</span>
          {block.type === 'scale' && scaleName && <span className="text-sm font-medium text-slate-900 truncate">{scaleName}</span>}
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => onMove(-1)} disabled={index === 0} className="p-1 text-slate-300 hover:text-slate-500 disabled:opacity-30 text-xs">上移</button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="p-1 text-slate-300 hover:text-slate-500 disabled:opacity-30 text-xs">下移</button>
          <button onClick={onRemove} className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {block.type === 'demographics' && <DemographicsConfig fields={block.fields || []} onChange={(fields) => onUpdate({ fields })} />}
      {block.type === 'custom_questions' && <CustomQuestionsConfig questions={block.questions || []} onChange={(questions) => onUpdate({ questions })} />}
    </div>
  );
}

function DemographicsConfig({ fields, onChange }: { fields: DemographicField[]; onChange: (f: DemographicField[]) => void }) {
  const [showCustom, setShowCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customType, setCustomType] = useState<'text' | 'number' | 'select' | 'date'>('text');
  const [customOptions, setCustomOptions] = useState('');

  const addCustomField = () => {
    if (!customLabel.trim()) return;
    const newField: DemographicField = {
      id: `custom_${crypto.randomUUID().slice(0, 8)}`,
      label: customLabel.trim(),
      type: customType,
      required: false,
      options: customType === 'select' ? customOptions.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : undefined,
    };
    onChange([...fields, newField]);
    setCustomLabel('');
    setCustomOptions('');
    setShowCustom(false);
  };

  const removeField = (id: string) => onChange(fields.filter((f) => f.id !== id));

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
      <div>
        <span className="text-xs text-slate-500">预设字段：</span>
        <div className="flex flex-wrap gap-2 mt-1">
          {DEMOGRAPHIC_PRESETS.map((p) => {
            const active = fields.some((f) => f.id === p.id);
            return (
              <button key={p.id} onClick={() => onChange(active ? fields.filter((f) => f.id !== p.id) : [...fields, { ...p }])}
                className={`px-2.5 py-1 rounded-full text-xs transition ${active ? 'bg-brand-100 text-brand-700 border border-brand-300' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {fields.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-slate-500">已选字段：</span>
          {fields.map((f) => (
            <div key={f.id} className="flex items-center justify-between text-xs px-2 py-1.5 bg-slate-50 rounded">
              <div className="flex items-center gap-2">
                <span className="text-slate-700 font-medium">{f.label}</span>
                <span className="text-slate-400">
                  {f.type === 'text' ? '文本' : f.type === 'number' ? '数字' : f.type === 'select' ? '下拉' : '日期'}
                </span>
                {f.type === 'select' && f.options && (
                  <span className="text-slate-400">({f.options.join('/')})</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={f.required} onChange={() => onChange(fields.map((x) => x.id === f.id ? { ...x, required: !x.required } : x))} className="rounded" />
                  必填
                </label>
                <button onClick={() => removeField(f.id)} className="text-slate-300 hover:text-red-500">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!showCustom ? (
        <button onClick={() => setShowCustom(true)} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
          <Plus className="w-3 h-3" /> 自定义字段
        </button>
      ) : (
        <div className="bg-slate-50 rounded-lg p-3 space-y-2">
          <div className="flex gap-2">
            <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="字段名称" className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <select value={customType} onChange={(e) => setCustomType(e.target.value as any)} className="px-2 py-1.5 border border-slate-200 rounded text-xs">
              <option value="text">文本</option>
              <option value="number">数字</option>
              <option value="select">下拉选择</option>
              <option value="date">日期</option>
            </select>
          </div>
          {customType === 'select' && (
            <input value={customOptions} onChange={(e) => setCustomOptions(e.target.value)} placeholder="选项（用逗号分隔，如：选项1，选项2）" className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCustom(false)} className="text-xs text-slate-400 hover:text-slate-600">取消</button>
            <button onClick={addCustomField} disabled={!customLabel.trim()} className="text-xs text-brand-600 hover:underline disabled:opacity-50">添加</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomQuestionsConfig({ questions, onChange }: { questions: CustomQuestion[]; onChange: (q: CustomQuestion[]) => void }) {
  const nextId = () => crypto.randomUUID();
  return (
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
      {questions.map((q, qi) => (
        <div key={q.id} className="bg-slate-50 rounded-lg p-3 space-y-2">
          <div className="flex gap-2 items-start">
            <span className="text-xs text-slate-400 mt-2">{qi + 1}.</span>
            <div className="flex-1 space-y-2">
              <input value={q.text} onChange={(e) => onChange(questions.map((x) => x.id === q.id ? { ...x, text: e.target.value } : x))} placeholder="题目内容" className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <div className="flex gap-2 items-center">
                <select value={q.type} onChange={(e) => onChange(questions.map((x) => x.id === q.id ? { ...x, type: e.target.value as any } : x))} className="px-2 py-1 border border-slate-200 rounded text-xs">
                  <option value="radio">单选</option><option value="checkbox">多选</option><option value="text">填空</option><option value="textarea">简答</option>
                </select>
                <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={q.required} onChange={(e) => onChange(questions.map((x) => x.id === q.id ? { ...x, required: e.target.checked } : x))} className="rounded" />必填</label>
              </div>
              {(q.type === 'radio' || q.type === 'checkbox') && (
                <div className="space-y-1">
                  {(q.options || []).map((opt, oi) => (
                    <div key={oi} className="flex gap-1 items-center">
                      <input value={opt} onChange={(e) => { const opts = [...(q.options || [])]; opts[oi] = e.target.value; onChange(questions.map((x) => x.id === q.id ? { ...x, options: opts } : x)); }} className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs" />
                      {(q.options?.length || 0) > 2 && <button onClick={() => onChange(questions.map((x) => x.id === q.id ? { ...x, options: (x.options || []).filter((_, i) => i !== oi) } : x))} className="text-xs text-red-400">x</button>}
                    </div>
                  ))}
                  <button onClick={() => onChange(questions.map((x) => x.id === q.id ? { ...x, options: [...(x.options || []), `选项${(x.options?.length || 0) + 1}`] } : x))} className="text-xs text-brand-600 hover:underline">+ 选项</button>
                </div>
              )}
            </div>
            <button onClick={() => onChange(questions.filter((x) => x.id !== q.id))} className="text-slate-300 hover:text-red-500 mt-1"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      ))}
      <button onClick={() => onChange([...questions, { id: nextId(), type: 'radio', text: '', required: false, options: ['选项1', '选项2'] }])} className="text-xs text-brand-600 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> 添加题目</button>
    </div>
  );
}
