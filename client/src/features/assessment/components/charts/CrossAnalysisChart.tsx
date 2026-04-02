import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const RISK_COLORS: Record<string, string> = {
  level_1: '#22c55e', level_2: '#eab308', level_3: '#f97316', level_4: '#ef4444',
};
const RISK_LABELS: Record<string, string> = {
  level_1: '一级', level_2: '二级', level_3: '三级', level_4: '四级',
};

interface Props {
  data: Record<string, Record<string, number>>;
  groupLabel: string;
}

/** Cross-analysis: e.g. risk distribution by grade */
export function CrossAnalysisChart({ data, groupLabel }: Props) {
  const riskLevels = new Set<string>();
  Object.values(data).forEach((dist) => Object.keys(dist).forEach((k) => riskLevels.add(k)));

  const chartData = Object.entries(data).map(([group, dist]) => ({
    group,
    ...dist,
  }));

  if (chartData.length === 0) return <p className="text-sm text-slate-400">暂无交叉分析数据</p>;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="group" tick={{ fontSize: 12 }} label={{ value: groupLabel, position: 'insideBottom', offset: -5, fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        {[...riskLevels].sort().map((level) => (
          <Bar key={level} dataKey={level} name={RISK_LABELS[level] || level} fill={RISK_COLORS[level] || '#94a3b8'} stackId="risk" />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
