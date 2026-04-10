/**
 * Phase 9α — Text-based block editors: RichText, Reflection, CheckIn.
 *
 * These don't need media upload — just text inputs and configuration.
 */
import React from 'react';
import type { RichTextPayload, ReflectionPayload, CheckInPayload } from '@psynote/shared';

interface BaseProps<P> {
  payload: P;
  onChange: (payload: P) => void;
}

// ─── Rich text ──────────────────────────────────────────────────────

export function RichTextBlockEditor({ payload, onChange }: BaseProps<RichTextPayload>) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-600">图文内容</label>
        <select
          value={payload.format ?? 'html'}
          onChange={(e) => onChange({ ...payload, format: e.target.value as 'markdown' | 'html' })}
          className="text-xs border border-gray-300 rounded px-1 py-0.5"
        >
          <option value="html">HTML</option>
          <option value="markdown">Markdown</option>
        </select>
      </div>
      <textarea
        value={payload.body ?? ''}
        onChange={(e) => onChange({ ...payload, body: e.target.value })}
        rows={8}
        className="w-full text-sm border border-gray-300 rounded px-2 py-1 font-mono"
        placeholder="支持 HTML 或 Markdown，可粘贴富文本"
      />
      <div className="text-xs text-gray-500">
        提示：图文稿是来访者最常消费的内容形式之一。建议每节包含一段简短的导读 + 核心观点。
      </div>
    </div>
  );
}

// ─── Reflection prompt ──────────────────────────────────────────────

export function ReflectionBlockEditor({ payload, onChange }: BaseProps<ReflectionPayload>) {
  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs text-gray-600 mb-1">引导问题</label>
        <textarea
          value={payload.prompt ?? ''}
          onChange={(e) => onChange({ ...payload, prompt: e.target.value })}
          rows={3}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1"
          placeholder="例：今天让你印象最深的是什么？"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-600 mb-1">最少字数（建议）</label>
          <input
            type="number"
            min={0}
            value={payload.minLength ?? 0}
            onChange={(e) => onChange({ ...payload, minLength: parseInt(e.target.value, 10) || 0 })}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">输入框占位符</label>
          <input
            type="text"
            value={payload.placeholder ?? ''}
            onChange={(e) => onChange({ ...payload, placeholder: e.target.value })}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1"
            placeholder="可选"
          />
        </div>
      </div>
      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
        ⚠️ 反思提交会自动扫描自杀 / 自残等关键词，命中后会通知咨询师并向来访者展示危机资源。
      </div>
    </div>
  );
}

// ─── Check-in ───────────────────────────────────────────────────────

export function CheckInBlockEditor({ payload, onChange }: BaseProps<CheckInPayload>) {
  const kind = payload.kind ?? 'mood';
  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs text-gray-600 mb-1">打卡提示</label>
        <input
          type="text"
          value={payload.prompt ?? ''}
          onChange={(e) => onChange({ ...payload, prompt: e.target.value })}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1"
          placeholder="例：今天的心情如何？"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-gray-600 mb-1">类型</label>
          <select
            value={kind}
            onChange={(e) => onChange({ ...payload, kind: e.target.value as CheckInPayload['kind'] })}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="mood">心情量尺</option>
            <option value="scale">数值量尺</option>
            <option value="text">短文字</option>
          </select>
        </div>
        {(kind === 'mood' || kind === 'scale') && (
          <>
            <div>
              <label className="block text-xs text-gray-600 mb-1">最小</label>
              <input
                type="number"
                value={payload.min ?? 1}
                onChange={(e) => onChange({ ...payload, min: parseInt(e.target.value, 10) || 1 })}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">最大</label>
              <input
                type="number"
                value={payload.max ?? 5}
                onChange={(e) => onChange({ ...payload, max: parseInt(e.target.value, 10) || 5 })}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
