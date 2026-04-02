import React from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface Props {
  dimensions: { name: string; score: number; maxScore?: number }[];
}

export function DimensionRadar({ dimensions }: Props) {
  if (dimensions.length < 2) return <p className="text-sm text-slate-400">维度不足，无法生成雷达图</p>;

  const data = dimensions.map((d) => ({
    dimension: d.name.length > 6 ? d.name.slice(0, 6) + '...' : d.name,
    score: d.score,
    fullMark: d.maxScore || Math.max(...dimensions.map((x) => x.score)) * 1.2,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12 }} />
        <PolarRadiusAxis tick={{ fontSize: 10 }} />
        <Radar dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
        <Tooltip />
      </RadarChart>
    </ResponsiveContainer>
  );
}
