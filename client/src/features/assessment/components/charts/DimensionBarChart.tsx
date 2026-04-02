import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  dimensions: { name: string; mean: number; min: number; max: number }[];
}

export function DimensionBarChart({ dimensions }: Props) {
  if (dimensions.length === 0) return <p className="text-sm text-slate-400">暂无维度数据</p>;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={dimensions} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={80} />
        <Tooltip />
        <Bar dataKey="mean" name="均值" fill="#6366f1" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
