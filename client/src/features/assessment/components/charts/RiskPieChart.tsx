import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const RISK_COLORS: Record<string, string> = {
  level_1: '#22c55e', level_2: '#eab308', level_3: '#f97316', level_4: '#ef4444', none: '#94a3b8',
};
const RISK_LABELS: Record<string, string> = {
  level_1: '一级（一般）', level_2: '二级（关注）', level_3: '三级（严重）', level_4: '四级（危机）', none: '无风险',
};

interface Props {
  distribution: Record<string, number>;
}

export function RiskPieChart({ distribution }: Props) {
  const data = Object.entries(distribution).map(([level, count]) => ({
    name: RISK_LABELS[level] || level,
    value: count,
    color: RISK_COLORS[level] || '#94a3b8',
  }));

  if (data.length === 0) return <p className="text-sm text-slate-400">暂无数据</p>;

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
