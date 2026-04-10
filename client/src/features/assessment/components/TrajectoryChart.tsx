/**
 * Phase 9β — Lightweight longitudinal trajectory chart.
 *
 * Renders an SVG line chart of (createdAt, totalScore) for one client × one
 * scale. Designed to be self-contained — no chart library — so it works
 * identically in the counselor app and (Phase 9γ) in the client portal.
 *
 * Risk level colors each point so the trajectory tells a clinical story at
 * a glance: red dots = level_4, amber = level_3, blue = level_2, gray = level_1.
 */
import React, { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { useTrajectory, type TrajectoryPoint } from '../../../api/useAssessments';

interface Props {
  userId: string;
  scaleId: string;
  /** Display title above the chart, e.g. "PHQ-9 抑郁纵向变化". */
  title?: string;
  /** Optional max-height in px to control footprint. */
  height?: number;
}

const RISK_COLORS: Record<string, string> = {
  level_1: '#94a3b8', // slate-400
  level_2: '#3b82f6', // blue-500
  level_3: '#f59e0b', // amber-500
  level_4: '#ef4444', // red-500
};

export function TrajectoryChart({ userId, scaleId, title, height = 220 }: Props) {
  const { data: points = [], isLoading } = useTrajectory(userId, scaleId);

  const chart = useMemo(() => buildChart(points, height), [points, height]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="text-sm text-slate-400">加载趋势数据…</div>
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">{title ?? '纵向趋势'}</h3>
        </div>
        <p className="text-xs text-slate-400">暂无历史测评数据，至少需要 1 次测评。</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-slate-700">{title ?? '纵向趋势'}</h3>
        <span className="text-xs text-slate-400 ml-auto">{points.length} 次测评</span>
      </div>

      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="w-full"
        style={{ maxHeight: height }}
      >
        {/* Y-axis grid lines */}
        {chart.yTicks.map((y) => (
          <g key={y.value}>
            <line
              x1={chart.padLeft}
              x2={chart.width - chart.padRight}
              y1={y.y}
              y2={y.y}
              stroke="#e2e8f0"
              strokeDasharray="2,2"
            />
            <text x={chart.padLeft - 8} y={y.y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
              {y.value}
            </text>
          </g>
        ))}

        {/* Connecting line */}
        {chart.linePath && (
          <path d={chart.linePath} fill="none" stroke="#3b82f6" strokeWidth="2" />
        )}

        {/* Data points */}
        {chart.dots.map((d) => (
          <g key={d.id}>
            <circle cx={d.x} cy={d.y} r="5" fill={d.color} stroke="white" strokeWidth="2" />
            <text x={d.x} y={d.y - 10} textAnchor="middle" fontSize="10" fill="#475569">
              {d.label}
            </text>
          </g>
        ))}

        {/* X-axis dates */}
        {chart.xLabels.map((x, i) => (
          <text
            key={i}
            x={x.x}
            y={chart.height - 6}
            textAnchor="middle"
            fontSize="9"
            fill="#64748b"
          >
            {x.label}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
        {Object.entries(RISK_COLORS).map(([level, color]) => (
          <div key={level} className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: color }}
            />
            {RISK_LABELS[level]}
          </div>
        ))}
      </div>
    </div>
  );
}

const RISK_LABELS: Record<string, string> = {
  level_1: '一级',
  level_2: '二级',
  level_3: '三级',
  level_4: '四级',
};

function buildChart(points: TrajectoryPoint[], height: number) {
  const width = 540;
  const padLeft = 40;
  const padRight = 16;
  const padTop = 24;
  const padBottom = 28;

  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const scores = points.map((p) => Number(p.totalScore ?? 0)).filter((s) => !Number.isNaN(s));
  const minScore = scores.length ? Math.min(...scores, 0) : 0;
  const maxScore = scores.length ? Math.max(...scores, 1) : 1;
  const span = Math.max(1, maxScore - minScore);

  function xFor(idx: number) {
    if (points.length <= 1) return padLeft + innerW / 2;
    return padLeft + (idx / (points.length - 1)) * innerW;
  }
  function yFor(score: number) {
    return padTop + (1 - (score - minScore) / span) * innerH;
  }

  const dots = points.map((p, i) => {
    const score = Number(p.totalScore ?? 0);
    return {
      id: p.id,
      x: xFor(i),
      y: yFor(score),
      color: RISK_COLORS[p.riskLevel ?? 'level_1'] ?? '#94a3b8',
      label: String(score),
    };
  });

  const linePath = dots.length >= 2
    ? dots.map((d, i) => `${i === 0 ? 'M' : 'L'} ${d.x} ${d.y}`).join(' ')
    : null;

  // Y-axis ticks (4 evenly spaced)
  const tickCount = 4;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const value = Math.round(minScore + (span * i) / tickCount);
    return { value, y: yFor(value) };
  });

  // X-axis labels — show first / last / middle to avoid clutter
  const xLabels = points
    .map((p, i) => ({
      x: xFor(i),
      label: formatDate(p.createdAt),
      idx: i,
    }))
    .filter((_, i, arr) => i === 0 || i === arr.length - 1 || (arr.length > 4 && i === Math.floor(arr.length / 2)));

  return { width, height, padLeft, padRight, dots, linePath, yTicks, xLabels };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}/${day}`;
}
