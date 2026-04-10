/**
 * Phase 9α — Portal renderers for structured blocks (Quiz, Worksheet).
 */
import React from 'react';
import { CheckCircle, Send } from 'lucide-react';
import type {
  QuizPayload, QuizQuestion, WorksheetPayload, EnrollmentBlockResponse,
} from '@psynote/shared';

interface BaseProps<P> {
  payload: P;
  existing: EnrollmentBlockResponse | null;
  onSubmit: (response: unknown | null) => void;
}

// ─── Quiz ───────────────────────────────────────────────────────────

interface QuizAnswers {
  [questionId: string]: string[];
}

export function QuizBlockView({ payload, existing, onSubmit }: BaseProps<QuizPayload>) {
  const initial: QuizAnswers = (existing?.response as { answers?: QuizAnswers })?.answers ?? {};
  const [answers, setAnswers] = React.useState<QuizAnswers>(initial);
  const [submitted, setSubmitted] = React.useState(!!existing?.completedAt);
  const [score, setScore] = React.useState<number | null>(null);

  function setAnswer(q: QuizQuestion, optionId: string) {
    setSubmitted(false);
    if (q.kind === 'single') {
      setAnswers((prev) => ({ ...prev, [q.id]: [optionId] }));
    } else {
      setAnswers((prev) => {
        const cur = prev[q.id] ?? [];
        const next = cur.includes(optionId)
          ? cur.filter((id) => id !== optionId)
          : [...cur, optionId];
        return { ...prev, [q.id]: next };
      });
    }
  }

  function calcScore(): number {
    let total = 0;
    for (const q of payload.questions ?? []) {
      const picked = answers[q.id] ?? [];
      for (const optId of picked) {
        const opt = q.options.find((o) => o.id === optId);
        total += opt?.score ?? 0;
      }
    }
    return total;
  }

  function handleSubmit() {
    const total = payload.scored ? calcScore() : null;
    onSubmit({ answers, score: total });
    setScore(total);
    setSubmitted(true);
  }

  const questions = payload.questions ?? [];

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500 font-medium">选择题</span>
        {submitted && (
          <span className="text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> 已提交
          </span>
        )}
      </div>

      <div className="space-y-4">
        {questions.map((q, qi) => (
          <div key={q.id}>
            <p className="text-sm text-slate-700 mb-2">
              <span className="text-slate-400 mr-1">{qi + 1}.</span>
              {q.prompt}
            </p>
            <div className="space-y-1.5">
              {q.options.map((o) => {
                const checked = (answers[q.id] ?? []).includes(o.id);
                return (
                  <label
                    key={o.id}
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition ${
                      checked ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type={q.kind === 'single' ? 'radio' : 'checkbox'}
                      name={q.id}
                      checked={checked}
                      onChange={() => setAnswer(q, o.id)}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-slate-700">{o.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {payload.scored && score !== null && submitted && (
        <div className="mt-3 p-3 bg-blue-50 rounded-lg">
          <div className="text-sm text-blue-800">
            得分：<span className="font-bold">{score}</span>
            {scoreBandLabel(payload, score) && (
              <span className="ml-2">— {scoreBandLabel(payload, score)}</span>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitted || questions.length === 0}
        className="mt-3 w-full py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
      >
        <Send className="w-3.5 h-3.5" />
        {submitted ? '已提交' : '提交'}
      </button>
    </div>
  );
}

function scoreBandLabel(payload: QuizPayload, score: number): string | null {
  for (const band of payload.scoreBands ?? []) {
    if (score >= band.minScore && score <= band.maxScore) return band.label;
  }
  return null;
}

// ─── Worksheet ──────────────────────────────────────────────────────

export function WorksheetBlockView({ payload, existing, onSubmit }: BaseProps<WorksheetPayload>) {
  const initial = (existing?.response as { values?: Record<string, string> })?.values ?? {};
  const [values, setValues] = React.useState<Record<string, string>>(initial);
  const [submitted, setSubmitted] = React.useState(!!existing?.completedAt);

  function setField(id: string, val: string) {
    setSubmitted(false);
    setValues((prev) => ({ ...prev, [id]: val }));
  }

  function handleSubmit() {
    onSubmit({ values });
    setSubmitted(true);
  }

  const fields = payload.fields ?? [];

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500 font-medium">工作表</span>
        {submitted && (
          <span className="text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> 已提交
          </span>
        )}
      </div>

      {payload.intro && (
        <p className="text-sm text-slate-700 mb-3 leading-relaxed">{payload.intro}</p>
      )}

      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.id}>
            <label className="block text-xs text-slate-500 mb-1">{f.label}</label>
            {f.kind === 'text' && (
              <input
                type="text"
                value={values[f.id] ?? ''}
                onChange={(e) => setField(f.id, e.target.value)}
                placeholder={f.placeholder}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
              />
            )}
            {f.kind === 'textarea' && (
              <textarea
                value={values[f.id] ?? ''}
                onChange={(e) => setField(f.id, e.target.value)}
                rows={3}
                placeholder={f.placeholder}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
              />
            )}
            {f.kind === 'number' && (
              <input
                type="number"
                value={values[f.id] ?? ''}
                onChange={(e) => setField(f.id, e.target.value)}
                placeholder={f.placeholder}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
              />
            )}
            {f.kind === 'select' && (
              <select
                value={values[f.id] ?? ''}
                onChange={(e) => setField(f.id, e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
              >
                <option value="">请选择</option>
                {(f.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitted || fields.length === 0}
        className="mt-3 w-full py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
      >
        <Send className="w-3.5 h-3.5" />
        {submitted ? '已提交' : '提交'}
      </button>
    </div>
  );
}
