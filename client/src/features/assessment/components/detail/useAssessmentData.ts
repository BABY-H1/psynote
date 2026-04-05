import { useMemo } from 'react';
import type { AssessmentResult } from '@psynote/shared';

/** Averaged dimension scores across all results */
export function useDimAverages(results: AssessmentResult[] | undefined, dimNameMap?: Record<string, string>) {
  return useMemo(() => {
    if (!results || results.length === 0) return [];
    const dimTotals: Record<string, { sum: number; count: number }> = {};
    for (const r of results) {
      for (const [dimId, score] of Object.entries(r.dimensionScores)) {
        if (!dimTotals[dimId]) dimTotals[dimId] = { sum: 0, count: 0 };
        dimTotals[dimId].sum += score;
        dimTotals[dimId].count += 1;
      }
    }
    return Object.entries(dimTotals).map(([id, { sum, count }]) => ({
      name: dimNameMap?.[id] || id.slice(0, 12),
      score: Math.round((sum / count) * 100) / 100,
      mean: Math.round((sum / count) * 100) / 100,
      min: 0,
      max: 0,
    }));
  }, [results, dimNameMap]);
}

/** Cross analysis by demographic group */
export function useCrossData(results: AssessmentResult[] | undefined) {
  return useMemo(() => {
    if (!results || results.length === 0) return {};
    const byGroup: Record<string, Record<string, number>> = {};
    for (const r of results) {
      const demo = r.demographicData as Record<string, string>;
      const group = demo?.grade || demo?.gender || demo?.department || 'other';
      if (!byGroup[group]) byGroup[group] = {};
      const level = r.riskLevel || 'none';
      byGroup[group][level] = (byGroup[group][level] || 0) + 1;
    }
    return byGroup;
  }, [results]);
}

/** Group results by userId for tracking assessments */
export function useUserResultMap(results: AssessmentResult[] | undefined) {
  return useMemo(() => {
    if (!results) return new Map<string, AssessmentResult[]>();
    const map = new Map<string, AssessmentResult[]>();
    for (const r of results) {
      if (!r.userId) continue;
      if (!map.has(r.userId)) map.set(r.userId, []);
      map.get(r.userId)!.push(r);
    }
    return map;
  }, [results]);
}

/** Risk distribution from results */
export function useRiskDistribution(results: AssessmentResult[] | undefined) {
  return useMemo(() => {
    return (results || []).reduce<Record<string, number>>((acc, r) => {
      acc[r.riskLevel || 'none'] = (acc[r.riskLevel || 'none'] || 0) + 1;
      return acc;
    }, {});
  }, [results]);
}
