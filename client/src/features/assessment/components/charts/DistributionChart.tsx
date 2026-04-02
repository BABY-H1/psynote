import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  data: { label: string; count: number }[];
  title?: string;
}

/** Simple distribution bar chart for survey option frequencies */
export function DistributionChart({ data, title }: Props) {
  if (data.length === 0) return <p className="text-sm text-slate-400">暂无数据</p>;

  return (
    <div>
      {title && <span className="text-xs font-medium text-slate-500 mb-2 block">{title}</span>}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" name="人数" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
