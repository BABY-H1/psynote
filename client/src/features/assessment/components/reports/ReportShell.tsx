import React from 'react';
import { Download } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  date?: string;
  onDownload?: () => void;
  children: React.ReactNode;
}

export function ReportShell({ title, subtitle, date, onDownload, children }: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">{title}</h3>
            {subtitle && <p className="text-brand-100 text-sm mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3">
            {date && <span className="text-brand-200 text-xs">{date}</span>}
            {onDownload && (
              <button onClick={onDownload} className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition" title="下载报告">
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Body */}
      <div className="p-6 space-y-6">
        {children}
      </div>
    </div>
  );
}

/** Section component for report blocks */
export function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-900 mb-3 border-b border-slate-100 pb-2">{title}</h4>
      {children}
    </div>
  );
}

/** AI narrative block */
export function AINarrative({ content, loading }: { content?: string; loading?: boolean }) {
  if (loading) {
    return (
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-blue-100 rounded w-3/4 mb-2" />
        <div className="h-4 bg-blue-100 rounded w-1/2" />
      </div>
    );
  }
  if (!content) return null;
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-xs font-medium text-blue-700">AI 分析</span>
      </div>
      <p className="text-sm text-blue-800 leading-relaxed whitespace-pre-line">{content}</p>
    </div>
  );
}

/** Score card */
export function ScoreCard({ label, value, sublabel, color }: { label: string; value: string | number; sublabel?: string; color?: string }) {
  return (
    <div className="text-center p-3 bg-slate-50 rounded-lg">
      <div className={`text-2xl font-bold ${color || 'text-slate-900'}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      {sublabel && <div className="text-xs text-slate-400">{sublabel}</div>}
    </div>
  );
}

/** Risk badge inline */
export function RiskTag({ level }: { level: string }) {
  const labels: Record<string, string> = { level_1: '一级', level_2: '二级', level_3: '三级', level_4: '四级' };
  const colors: Record<string, string> = { level_1: 'bg-green-100 text-green-700', level_2: 'bg-yellow-100 text-yellow-700', level_3: 'bg-orange-100 text-orange-700', level_4: 'bg-red-100 text-red-700' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[level] || 'bg-slate-100 text-slate-600'}`}>{labels[level] || level}</span>;
}

/** Dimension score row */
export function DimensionRow({ name, score, maxScore, label, riskLevel, advice }: {
  name: string; score: number; maxScore?: number; label?: string; riskLevel?: string; advice?: string;
}) {
  const pct = maxScore ? Math.round((score / maxScore) * 100) : 50;
  return (
    <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-800">{name}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-slate-600">{score}{maxScore ? `/${maxScore}` : ''}</span>
          {riskLevel && <RiskTag level={riskLevel} />}
        </div>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-1.5">
        <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {label && <p className="text-sm text-slate-700">{label}</p>}
      {advice && <p className="text-xs text-brand-600 bg-brand-50 rounded px-2 py-1">建议: {advice}</p>}
    </div>
  );
}

/** Trend tag */
export function TrendTag({ trend }: { trend: 'improving' | 'worsening' | 'stable' }) {
  const config = {
    improving: { label: '改善', color: 'bg-green-100 text-green-700' },
    worsening: { label: '恶化', color: 'bg-red-100 text-red-700' },
    stable: { label: '稳定', color: 'bg-slate-100 text-slate-600' },
  };
  const c = config[trend];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.color}`}>{c.label}</span>;
}
