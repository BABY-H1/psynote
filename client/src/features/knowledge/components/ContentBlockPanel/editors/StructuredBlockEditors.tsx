/**
 * Phase 9α — Structured form editors: Quiz, Worksheet.
 *
 * Both edit a list of typed fields/questions with add/remove/inline edit.
 */
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  QuizPayload,
  QuizQuestion,
  QuizOption,
  WorksheetPayload,
  WorksheetField,
} from '@psynote/shared';

interface BaseProps<P> {
  payload: P;
  onChange: (payload: P) => void;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Quiz editor ────────────────────────────────────────────────────

export function QuizBlockEditor({ payload, onChange }: BaseProps<QuizPayload>) {
  const questions = payload.questions ?? [];

  function updateQuestion(idx: number, patch: Partial<QuizQuestion>) {
    const next = questions.map((q, i) => (i === idx ? { ...q, ...patch } : q));
    onChange({ ...payload, questions: next });
  }

  function addQuestion() {
    const newQ: QuizQuestion = {
      id: uid(),
      prompt: '',
      kind: 'single',
      options: [
        { id: uid(), label: '选项 A' },
        { id: uid(), label: '选项 B' },
      ],
    };
    onChange({ ...payload, questions: [...questions, newQ] });
  }

  function removeQuestion(idx: number) {
    onChange({ ...payload, questions: questions.filter((_, i) => i !== idx) });
  }

  function updateOption(qIdx: number, oIdx: number, patch: Partial<QuizOption>) {
    const q = questions[qIdx];
    const newOpts = q.options.map((o, i) => (i === oIdx ? { ...o, ...patch } : o));
    updateQuestion(qIdx, { options: newOpts });
  }

  function addOption(qIdx: number) {
    const q = questions[qIdx];
    updateQuestion(qIdx, {
      options: [...q.options, { id: uid(), label: `选项 ${String.fromCharCode(65 + q.options.length)}` }],
    });
  }

  function removeOption(qIdx: number, oIdx: number) {
    const q = questions[qIdx];
    updateQuestion(qIdx, { options: q.options.filter((_, i) => i !== oIdx) });
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!payload.scored}
          onChange={(e) => onChange({ ...payload, scored: e.target.checked })}
        />
        启用自动评分（含分数项）
      </label>

      {questions.map((q, qIdx) => (
        <div key={q.id} className="border border-gray-200 rounded p-2 space-y-2">
          <div className="flex items-start gap-2">
            <textarea
              value={q.prompt}
              onChange={(e) => updateQuestion(qIdx, { prompt: e.target.value })}
              rows={2}
              className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
              placeholder={`问题 ${qIdx + 1}`}
            />
            <select
              value={q.kind}
              onChange={(e) => updateQuestion(qIdx, { kind: e.target.value as 'single' | 'multi' })}
              className="text-xs border border-gray-300 rounded px-1 py-1"
            >
              <option value="single">单选</option>
              <option value="multi">多选</option>
            </select>
            <button
              type="button"
              onClick={() => removeQuestion(qIdx)}
              className="p-1 text-red-600 hover:bg-red-50 rounded"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1 pl-3">
            {q.options.map((o, oIdx) => (
              <div key={o.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={o.label}
                  onChange={(e) => updateOption(qIdx, oIdx, { label: e.target.value })}
                  className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
                />
                {payload.scored && (
                  <input
                    type="number"
                    value={o.score ?? 0}
                    onChange={(e) => updateOption(qIdx, oIdx, { score: parseInt(e.target.value, 10) || 0 })}
                    className="w-16 text-sm border border-gray-300 rounded px-2 py-1"
                    placeholder="分数"
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeOption(qIdx, oIdx)}
                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => addOption(qIdx)}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> 添加选项
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addQuestion}
        className="w-full py-2 text-sm border border-dashed border-gray-300 rounded text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-1"
      >
        <Plus className="w-4 h-4" /> 添加题目
      </button>
    </div>
  );
}

// ─── Worksheet editor ───────────────────────────────────────────────

export function WorksheetBlockEditor({ payload, onChange }: BaseProps<WorksheetPayload>) {
  const fields = payload.fields ?? [];

  function updateField(idx: number, patch: Partial<WorksheetField>) {
    const next = fields.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    onChange({ ...payload, fields: next });
  }

  function addField() {
    const newField: WorksheetField = {
      id: uid(),
      label: '新字段',
      kind: 'text',
    };
    onChange({ ...payload, fields: [...fields, newField] });
  }

  function removeField(idx: number) {
    onChange({ ...payload, fields: fields.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-600 mb-1">说明（可选）</label>
        <textarea
          value={payload.intro ?? ''}
          onChange={(e) => onChange({ ...payload, intro: e.target.value })}
          rows={2}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1"
          placeholder="工作表整体引导文字"
        />
      </div>

      {fields.map((f, idx) => (
        <div key={f.id} className="border border-gray-200 rounded p-2 space-y-1">
          <div className="flex items-start gap-2">
            <input
              type="text"
              value={f.label}
              onChange={(e) => updateField(idx, { label: e.target.value })}
              className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
              placeholder="字段标签"
            />
            <select
              value={f.kind}
              onChange={(e) => updateField(idx, { kind: e.target.value as WorksheetField['kind'] })}
              className="text-xs border border-gray-300 rounded px-1 py-1"
            >
              <option value="text">单行</option>
              <option value="textarea">多行</option>
              <option value="number">数字</option>
              <option value="select">下拉</option>
            </select>
            <button
              type="button"
              onClick={() => removeField(idx)}
              className="p-1 text-red-600 hover:bg-red-50 rounded"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          {f.kind === 'select' && (
            <input
              type="text"
              value={(f.options ?? []).join(',')}
              onChange={(e) => updateField(idx, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1"
              placeholder="选项用英文逗号分隔，如: 是, 否, 不确定"
            />
          )}
          <input
            type="text"
            value={f.placeholder ?? ''}
            onChange={(e) => updateField(idx, { placeholder: e.target.value })}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1"
            placeholder="占位符（可选）"
          />
        </div>
      ))}

      <button
        type="button"
        onClick={addField}
        className="w-full py-2 text-sm border border-dashed border-gray-300 rounded text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-1"
      >
        <Plus className="w-4 h-4" /> 添加字段
      </button>
    </div>
  );
}
