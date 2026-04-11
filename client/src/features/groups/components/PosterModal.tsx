import React, { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import { X, Download, Sparkles, Loader2 } from 'lucide-react';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';

interface PosterData {
  title: string;
  description?: string;
  schedule?: string;
  location?: string;
  startDate?: string;
  capacity?: number;
  enrollUrl: string;
}

interface Props {
  data: PosterData;
  onClose: () => void;
}

type PosterTemplate = 'clean' | 'warm' | 'professional' | 'vibrant';

const TEMPLATES: { key: PosterTemplate; label: string; bg: string; accent: string; text: string }[] = [
  { key: 'clean', label: '简约', bg: 'bg-white', accent: 'text-brand-600', text: 'text-slate-800' },
  { key: 'warm', label: '温馨', bg: 'bg-amber-50', accent: 'text-amber-700', text: 'text-amber-900' },
  { key: 'professional', label: '专业', bg: 'bg-slate-900', accent: 'text-blue-400', text: 'text-white' },
  { key: 'vibrant', label: '活力', bg: 'bg-gradient-to-br from-purple-500 to-pink-500', accent: 'text-yellow-300', text: 'text-white' },
];

export function PosterModal({ data, onClose }: Props) {
  const posterRef = useRef<HTMLDivElement>(null);
  const [template, setTemplate] = useState<PosterTemplate>('clean');
  const [aiCopy, setAiCopy] = useState<{ headline?: string; subtitle?: string; points?: string[] } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const tpl = TEMPLATES.find((t) => t.key === template)!;

  const generateAiCopy = async () => {
    setIsGenerating(true);
    try {
      const orgId = useAuthStore.getState().currentOrgId;
      const result = await api.post<{ headline: string; subtitle: string; points: string[] }>(
        `/orgs/${orgId}/ai/groups/poster-copy`,
        {
          title: data.title,
          description: data.description,
          schedule: data.schedule,
          location: data.location,
        },
      );
      setAiCopy(result);
    } catch {
      // Fallback to manual copy
      setAiCopy({
        headline: data.title,
        subtitle: data.description?.slice(0, 50) || '专业心理团体辅导',
        points: ['科学的方案设计', '专业的带领团队', '安全的团体氛围'],
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const exportPoster = async () => {
    if (!posterRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(posterRef.current, {
        scale: 2,
        backgroundColor: null,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `${data.title || '团辅海报'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // Silently fail
    } finally {
      setIsExporting(false);
    }
  };

  const headline = aiCopy?.headline || data.title;
  const subtitle = aiCopy?.subtitle || data.description || '';
  const points = aiCopy?.points || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">生成宣传海报</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Template Selection */}
          <div>
            <label className="text-xs text-slate-500 mb-2 block">选择风格</label>
            <div className="flex gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTemplate(t.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    template === t.key
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* AI Copy Generation */}
          <div className="flex gap-2">
            <button
              onClick={generateAiCopy}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-50 text-violet-700 rounded-lg text-sm font-medium hover:bg-violet-100 disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isGenerating ? 'AI 生成中...' : 'AI 生成文案'}
            </button>
          </div>

          {/* Poster Preview */}
          <div className="flex justify-center">
            <div
              ref={posterRef}
              className={`w-[400px] rounded-2xl overflow-hidden shadow-lg ${tpl.bg}`}
              style={{ minHeight: '560px' }}
            >
              <div className="p-8 flex flex-col h-full">
                {/* Header decoration */}
                <div className="mb-6">
                  <div className={`text-xs font-medium ${tpl.accent} uppercase tracking-widest mb-2`}>
                    团体辅导
                  </div>
                  <h2 className={`text-2xl font-bold ${tpl.text} leading-tight`}>
                    {headline}
                  </h2>
                  {subtitle && (
                    <p className={`mt-2 text-sm ${tpl.text} opacity-75 line-clamp-3`}>
                      {subtitle}
                    </p>
                  )}
                </div>

                {/* Key points */}
                {points.length > 0 && (
                  <div className="space-y-2 mb-6">
                    {points.map((point, i) => (
                      <div key={i} className={`flex items-center gap-2 text-sm ${tpl.text} opacity-80`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${tpl.key === 'professional' ? 'bg-blue-400' : tpl.key === 'vibrant' ? 'bg-yellow-300' : 'bg-brand-500'}`} />
                        {point}
                      </div>
                    ))}
                  </div>
                )}

                {/* Details */}
                <div className={`space-y-1.5 text-xs ${tpl.text} opacity-70 mb-6`}>
                  {data.schedule && <div>时间：{data.schedule}</div>}
                  {data.location && <div>地点：{data.location}</div>}
                  {data.startDate && <div>开始日期：{data.startDate}</div>}
                  {data.capacity && <div>名额：{data.capacity} 人</div>}
                </div>

                {/* QR Code */}
                <div className="mt-auto flex items-end justify-between">
                  <div className={`text-xs ${tpl.text} opacity-50`}>
                    扫码报名
                  </div>
                  <div className="bg-white p-2 rounded-lg">
                    <QRCodeSVG value={data.enrollUrl} size={80} level="M" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end px-6 py-4 border-t border-slate-200">
          <button onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            关闭
          </button>
          <button
            onClick={exportPoster}
            disabled={isExporting}
            className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> {isExporting ? '导出中...' : '下载海报'}
          </button>
        </div>
      </div>
    </div>
  );
}
