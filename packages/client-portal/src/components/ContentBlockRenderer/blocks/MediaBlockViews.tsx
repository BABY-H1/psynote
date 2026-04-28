/**
 * Phase 9α — Portal renderers for media blocks (Video, Audio, PDF).
 *
 * For media blocks, "completion" = the user opened/played and we marked it
 * as seen. We auto-fire onSubmit(null) when the user reaches the end (video/audio)
 * or clicks "标记已读" (PDF/manual). Existing completion is shown via a badge.
 */
import React from 'react';
import { CheckCircle, Download, ExternalLink } from 'lucide-react';
import type { VideoPayload, AudioPayload, PdfPayload, EnrollmentBlockResponse } from '@psynote/shared';

interface BaseProps<P> {
  payload: P;
  existing: EnrollmentBlockResponse | null;
  onSubmit: (response: unknown | null) => void;
}

// ─── Video ──────────────────────────────────────────────────────────

export function VideoBlockView({ payload, existing, onSubmit }: BaseProps<VideoPayload>) {
  const [marked, setMarked] = React.useState(!!existing?.completedAt);

  function handleEnded() {
    if (!marked) {
      setMarked(true);
      onSubmit(null);
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500 font-medium">视频</span>
        {marked && <CompletedBadge />}
      </div>
      {payload.src ? (
        <video
          src={payload.src}
          controls
          poster={payload.poster}
          onEnded={handleEnded}
          className="w-full rounded-lg bg-black"
        />
      ) : (
        <EmptyMedia kind="video" />
      )}
      {payload.caption && (
        <p className="text-xs text-slate-600 mt-2 leading-relaxed">{payload.caption}</p>
      )}
      {payload.src && !marked && (
        <button
          type="button"
          onClick={() => { setMarked(true); onSubmit(null); }}
          className="mt-3 text-xs text-blue-600 hover:underline"
        >
          标记已看
        </button>
      )}
    </div>
  );
}

// ─── Audio ──────────────────────────────────────────────────────────

export function AudioBlockView({ payload, existing, onSubmit }: BaseProps<AudioPayload>) {
  const [marked, setMarked] = React.useState(!!existing?.completedAt);

  function handleEnded() {
    if (!marked) {
      setMarked(true);
      onSubmit(null);
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">音频</span>
          {payload.technique && (
            <span className="text-xs px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded">
              {techniqueLabel(payload.technique)}
            </span>
          )}
        </div>
        {marked && <CompletedBadge />}
      </div>
      {payload.src ? (
        <audio src={payload.src} controls onEnded={handleEnded} className="w-full" />
      ) : (
        <EmptyMedia kind="audio" />
      )}
      {payload.narrator && (
        <p className="text-xs text-slate-500 mt-1">朗读：{payload.narrator}</p>
      )}
      {payload.caption && (
        <p className="text-xs text-slate-600 mt-2 leading-relaxed">{payload.caption}</p>
      )}
      {payload.src && !marked && (
        <button
          type="button"
          onClick={() => { setMarked(true); onSubmit(null); }}
          className="mt-3 text-xs text-blue-600 hover:underline"
        >
          标记已听
        </button>
      )}
    </div>
  );
}

function techniqueLabel(t: string) {
  const map: Record<string, string> = {
    breathing: '呼吸练习', body_scan: '身体扫描', focused_attention: '专注觉察',
    loving_kindness: '慈心练习', pmr: '渐进式肌肉放松', visualization: '想象引导',
  };
  return map[t] ?? t;
}

// ─── PDF ────────────────────────────────────────────────────────────

export function PdfBlockView({ payload, existing, onSubmit }: BaseProps<PdfPayload>) {
  const [marked, setMarked] = React.useState(!!existing?.completedAt);
  // mode='view' (default): inline iframe preview + download button.
  // mode='download': link only (for large/printable assets).
  const inlineView = payload.mode !== 'download';

  if (!payload.src) {
    return (
      <div className="p-4">
        <span className="text-xs text-slate-500 font-medium">文档</span>
        <EmptyMedia kind="pdf" />
      </div>
    );
  }

  function handleOpened() {
    if (!marked) {
      setMarked(true);
      onSubmit(null);
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">文档</span>
          <span className="text-xs text-slate-400">{payload.fileName ?? 'PDF'}</span>
        </div>
        {marked && <CompletedBadge />}
      </div>

      {inlineView ? (
        <>
          {/* Inline preview — browsers render PDFs natively in iframe */}
          <iframe
            src={payload.src}
            title={payload.fileName ?? '文档预览'}
            className="w-full h-[560px] rounded-lg border border-slate-200 bg-slate-50"
            onLoad={handleOpened}
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <a
              href={payload.src}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" /> 新窗口打开
            </a>
            <a
              href={payload.src}
              download
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
            >
              <Download className="w-3 h-3" /> 下载
            </a>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <a
            href={payload.src}
            target="_blank"
            rel="noreferrer"
            className="flex-1 flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
            onClick={handleOpened}
          >
            <ExternalLink className="w-4 h-4 text-blue-500" />
            {payload.fileName ?? '查看文档'}
          </a>
          <a
            href={payload.src}
            download
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1"
          >
            <Download className="w-4 h-4" />
            下载
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function CompletedBadge() {
  return (
    <span className="text-xs text-emerald-600 flex items-center gap-1">
      <CheckCircle className="w-3 h-3" /> 已完成
    </span>
  );
}

function EmptyMedia({ kind }: { kind: 'video' | 'audio' | 'pdf' }) {
  const label = kind === 'video' ? '视频' : kind === 'audio' ? '音频' : '文档';
  return (
    <div className="py-6 text-center text-sm text-slate-300 italic">
      {label}尚未上传
    </div>
  );
}
