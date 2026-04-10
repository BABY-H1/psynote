/**
 * Phase 9α — Media-based block editors: Video, Audio, PDF.
 *
 * All three share the same shape: a file upload + metadata fields.
 * We extract the upload UI into a small inline component to keep them DRY.
 */
import React, { useRef, useState } from 'react';
import { Upload, Loader2, X } from 'lucide-react';
import type { VideoPayload, AudioPayload, PdfPayload } from '@psynote/shared';
import { useMediaUpload } from '../useMediaUpload';

interface BaseProps<P> {
  payload: P;
  onChange: (payload: P) => void;
}

// ─── Video editor ───────────────────────────────────────────────────

export function VideoBlockEditor({ payload, onChange }: BaseProps<VideoPayload>) {
  return (
    <div className="space-y-3">
      <MediaUploadField
        currentSrc={payload.src}
        accept="video/*"
        labelEmpty="选择视频文件"
        labelChange="替换视频"
        onUploaded={(url) => onChange({ ...payload, src: url })}
        onClear={() => onChange({ ...payload, src: '' })}
      />
      {payload.src && (
        <video src={payload.src} controls className="w-full max-h-64 bg-black rounded" />
      )}
      <div>
        <label className="block text-xs text-gray-600 mb-1">说明 / 字幕</label>
        <textarea
          value={payload.caption ?? ''}
          onChange={(e) => onChange({ ...payload, caption: e.target.value })}
          rows={2}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1"
          placeholder="可选：视频简介或字幕"
        />
      </div>
    </div>
  );
}

// ─── Audio editor ───────────────────────────────────────────────────

export function AudioBlockEditor({ payload, onChange }: BaseProps<AudioPayload>) {
  return (
    <div className="space-y-3">
      <MediaUploadField
        currentSrc={payload.src}
        accept="audio/*"
        labelEmpty="选择音频文件"
        labelChange="替换音频"
        onUploaded={(url) => onChange({ ...payload, src: url })}
        onClear={() => onChange({ ...payload, src: '' })}
      />
      {payload.src && (
        <audio src={payload.src} controls className="w-full" />
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-600 mb-1">朗读人</label>
          <input
            type="text"
            value={payload.narrator ?? ''}
            onChange={(e) => onChange({ ...payload, narrator: e.target.value })}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1"
            placeholder="可选"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">练习类型</label>
          <select
            value={payload.technique ?? ''}
            onChange={(e) => onChange({ ...payload, technique: e.target.value })}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="">不指定</option>
            <option value="breathing">呼吸练习</option>
            <option value="body_scan">身体扫描</option>
            <option value="focused_attention">专注觉察</option>
            <option value="loving_kindness">慈心练习</option>
            <option value="pmr">渐进式肌肉放松</option>
            <option value="visualization">想象引导</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">说明</label>
        <textarea
          value={payload.caption ?? ''}
          onChange={(e) => onChange({ ...payload, caption: e.target.value })}
          rows={2}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1"
          placeholder="可选：练习简介"
        />
      </div>
    </div>
  );
}

// ─── PDF editor ─────────────────────────────────────────────────────

export function PdfBlockEditor({ payload, onChange }: BaseProps<PdfPayload>) {
  return (
    <div className="space-y-3">
      <MediaUploadField
        currentSrc={payload.src}
        accept=".pdf,application/pdf"
        labelEmpty="选择 PDF 文件"
        labelChange="替换 PDF"
        onUploaded={(url, fileName, fileSize) => onChange({ ...payload, src: url, fileName, fileSize })}
        onClear={() => onChange({ ...payload, src: '' })}
      />
      {payload.src && (
        <div className="text-xs text-gray-600">
          {payload.fileName} {payload.fileSize ? `(${formatSize(payload.fileSize)})` : ''}
        </div>
      )}
      <div>
        <label className="block text-xs text-gray-600 mb-1">显示模式</label>
        <select
          value={payload.mode ?? 'view'}
          onChange={(e) => onChange({ ...payload, mode: e.target.value as 'view' | 'download' })}
          className="text-sm border border-gray-300 rounded px-2 py-1"
        >
          <option value="view">在线查看</option>
          <option value="download">仅下载</option>
        </select>
      </div>
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Shared upload field ────────────────────────────────────────────

interface UploadFieldProps {
  currentSrc?: string;
  accept: string;
  labelEmpty: string;
  labelChange: string;
  onUploaded: (url: string, fileName: string, fileSize: number) => void;
  onClear: () => void;
}

function MediaUploadField({
  currentSrc, accept, labelEmpty, labelChange, onUploaded, onClear,
}: UploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useMediaUpload();
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const result = await upload.mutateAsync(file);
      onUploaded(result.url, result.fileName, result.fileSize);
    } catch (err: any) {
      setError(err?.message ?? '上传失败');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFile}
        className="hidden"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="text-sm px-3 py-1.5 border border-gray-300 rounded bg-white hover:bg-gray-50 flex items-center gap-2"
        >
          {upload.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {currentSrc ? labelChange : labelEmpty}
        </button>
        {currentSrc && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded flex items-center gap-1"
          >
            <X className="w-3 h-3" /> 清除
          </button>
        )}
      </div>
      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
    </div>
  );
}
