import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const RISK_COLORS: Record<string, string> = {
  level_1: '#22c55e', level_2: '#eab308', level_3: '#f97316', level_4: '#ef4444', none: '#94a3b8',
};
const RISK_LABELS: Record<string, string> = {
  level_1: '一级（一般）', level_2: '二级（关注）', level_3: '三级（严重）', level_4: '四级（危机）', none: '无风险',
};

const ALL_LEVELS = ['level_1', 'level_2', 'level_3', 'level_4'];

interface Props {
  distribution: Record<string, number>;
}

export function RiskPieChart({ distribution }: Props) {
  // Always show all 4 levels, even if count is 0
  const data = ALL_LEVELS.map((level) => ({
    name: RISK_LABELS[level] || level,
    value: distribution[level] || 0,
    color: RISK_COLORS[level] || '#94a3b8',
  }));

  // Also include 'none' if present
  if (distribution.none) {
    data.push({
      name: RISK_LABELS.none,
      value: distribution.none,
      color: RISK_COLORS.none,
    });
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`} labelLine={false}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
