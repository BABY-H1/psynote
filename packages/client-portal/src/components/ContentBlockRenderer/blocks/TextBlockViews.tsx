/**
 * Phase 9α — Portal renderers for text-based blocks (RichText, Reflection, CheckIn).
 */
import React from 'react';
import { CheckCircle, Send, Smile, Frown, Meh, Heart } from 'lucide-react';
import type {
  RichTextPayload,
  ReflectionPayload,
  CheckInPayload,
  EnrollmentBlockResponse,
} from '@psynote/shared';

interface BaseProps<P> {
  payload: P;
  existing: EnrollmentBlockResponse | null;
  onSubmit: (response: unknown | null) => void;
}

// ─── Rich text ──────────────────────────────────────────────────────

export function RichTextBlockView({ payload, existing, onSubmit }: BaseProps<RichTextPayload>) {
  const marked = !!existing?.completedAt;

  React.useEffect(() => {
    // Auto-mark rich text as completed on first render — it's read-only.
    if (!marked && payload.body) {
      const t = setTimeout(() => onSubmit(null), 800);
      return () => clearTimeout(t);
    }
  }, [marked, payload.body]);

  if (!payload.body) {
    return (
      <div className="p-4">
        <span className="text-xs text-slate-500 font-medium">图文</span>
        <div className="py-6 text-center text-sm text-slate-300 italic">暂无内容</div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500 font-medium">图文</span>
        {marked && (
          <span className="text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> 已读
          </span>
        )}
      </div>
      {payload.format === 'markdown' ? (
        <div className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-700">
          {payload.body}
        </div>
      ) : (
        <div
          className="prose prose-sm max-w-none text-slate-700"
          // Trusted: counselor-authored content from a controlled scope (Phase 9α MVP)
          dangerouslySetInnerHTML={{ __html: payload.body }}
        />
      )}
    </div>
  );
}

// ─── Reflection ─────────────────────────────────────────────────────

export function ReflectionBlockView({ payload, existing, onSubmit }: BaseProps<ReflectionPayload>) {
  const initial = (existing?.response as { text: string } | null)?.text ?? '';
  const [text, setText] = React.useState(initial);
  const [submitted, setSubmitted] = React.useState(!!existing?.completedAt);

  function handleSubmit() {
    if (!text.trim()) return;
    onSubmit({ text });
    setSubmitted(true);
  }

  const min = payload.minLength ?? 0;
  const tooShort = text.length < min;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500 font-medium">反思</span>
        {submitted && (
          <span className="text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> 已提交
          </span>
        )}
      </div>
      <p className="text-sm text-slate-700 mb-3 leading-relaxed">{payload.prompt}</p>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSubmitted(false); }}
        rows={5}
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
        placeholder={payload.placeholder ?? '请在这里写下你的想法'}
      />
      <div className="flex items-center justify-between mt-2">
        <span className={`text-xs ${tooShort ? 'text-amber-600' : 'text-slate-400'}`}>
          {text.length} 字{min > 0 && (tooShort ? `（建议至少 ${min} 字）` : '')}
        </span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || submitted}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" />
          {submitted ? '已提交' : '提交'}
        </button>
      </div>
    </div>
  );
}

// ─── Check-in ───────────────────────────────────────────────────────

export function CheckInBlockView({ payload, existing, onSubmit }: BaseProps<CheckInPayload>) {
  const kind = payload.kind ?? 'mood';
  const min = payload.min ?? 1;
  const max = payload.max ?? 5;

  const initial = existing?.response as
    | { value: number }
    | { text: string }
    | null
    | undefined;
  const [value, setValue] = React.useState<number | null>(
    typeof initial === 'object' && initial && 'value' in initial ? initial.value : null,
  );
  const [text, setText] = React.useState(
    typeof initial === 'object' && initial && 'text' in initial ? initial.text : '',
  );
  const [submitted, setSubmitted] = React.useState(!!existing?.completedAt);

  function handleSubmit() {
    if (kind === 'text') {
      if (!text.trim()) return;
      onSubmit({ text });
    } else {
      if (value === null) return;
      onSubmit({ value });
    }
    setSubmitted(true);
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500 font-medium">打卡</span>
        {submitted && (
          <span className="text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> 已打卡
          </span>
        )}
      </div>
      <p className="text-sm text-slate-700 mb-3">{payload.prompt}</p>

      {kind === 'mood' && (
        <div className="flex items-center justify-between gap-2 mb-3">
          {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => { setValue(v); setSubmitted(false); }}
              className={`flex-1 py-3 rounded-xl border-2 transition ${
                value === v
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <MoodIcon value={v} max={max} />
              <div className="text-xs text-slate-500 mt-1">{v}</div>
            </button>
          ))}
        </div>
      )}

      {kind === 'scale' && (
        <div className="mb-3">
          <input
            type="range"
            min={min}
            max={max}
            value={value ?? min}
            onChange={(e) => { setValue(parseInt(e.target.value, 10)); setSubmitted(false); }}
            className="w-full"
          />
          <div className="text-center text-sm text-slate-600 mt-1">
            {value ?? '—'} / {max}
          </div>
        </div>
      )}

      {kind === 'text' && (
        <input
          type="text"
          value={text}
          onChange={(e) => { setText(e.target.value); setSubmitted(false); }}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 mb-3 focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
        />
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitted || (kind === 'text' ? !text.trim() : value === null)}
        className="w-full py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {submitted ? '已记录' : '提交'}
      </button>
    </div>
  );
}

function MoodIcon({ value, max }: { value: number; max: number }) {
  const ratio = (value - 1) / Math.max(1, max - 1);
  if (ratio < 0.34) return <Frown className="w-6 h-6 mx-auto text-amber-500" />;
  if (ratio < 0.67) return <Meh className="w-6 h-6 mx-auto text-blue-500" />;
  if (ratio < 1) return <Smile className="w-6 h-6 mx-auto text-emerald-500" />;
  return <Heart className="w-6 h-6 mx-auto text-rose-500" />;
}
