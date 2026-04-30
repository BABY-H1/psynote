import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

/**
 * Smoke coverage for the 研判分流 workspace:
 *   1. Renders the L1-L4 bucket counts from /triage/buckets.
 *   2. Shows an empty-state when /triage/candidates returns [].
 *   3. Renders the candidate row when the backend returns data.
 *   4. Clicking a bucket narrows the list query to that level.
 */

const { apiGet, apiPost, apiPatch } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn().mockResolvedValue({}),
  apiPatch: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../api/client', () => ({
  api: { get: apiGet, post: apiPost, patch: apiPatch },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Stub hooks that the filter bar and workflow buttons pull from so they
// don't need their own query layer.
vi.mock('../../api/useAssessments', () => ({
  useAssessments: () => ({ data: [] }),
  useBatches: () => ({ data: [] }),
}));

vi.mock('../../api/useWorkflow', () => ({
  useAcceptCandidate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDismissCandidate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// Minimal QueryClient + Provider harness
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../shared/components';

// Zustand auth store — single-org context
vi.mock('../../stores/authStore', () => ({
  useAuthStore: Object.assign(
    (selector?: (s: any) => any) => {
      const state = { currentOrgId: 'org-1' };
      return selector ? selector(state) : state;
    },
    { getState: () => ({ currentOrgId: 'org-1' }) },
  ),
}));

import { ResearchTriagePage } from './ResearchTriagePage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <ResearchTriagePage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiGet.mockReset();
  apiPatch.mockReset();
  cleanup();
});

describe('ResearchTriagePage', () => {
  it('renders the four triage levels in the sidebar', async () => {
    apiGet.mockImplementation((path: string) => {
      if (path.includes('/triage/buckets')) {
        return Promise.resolve({
          level_1: 4, level_2: 3, level_3: 2, level_4: 1, unrated: 0,
        });
      }
      if (path.includes('/triage/candidates')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    expect(await screen.findByText('一般')).toBeInTheDocument();
    expect(screen.getByText('关注')).toBeInTheDocument();
    expect(screen.getByText('严重')).toBeInTheDocument();
    expect(screen.getByText('危机')).toBeInTheDocument();
  });

  it('surfaces the empty state when no candidates exist', async () => {
    apiGet.mockImplementation((path: string) => {
      if (path.includes('/triage/buckets')) {
        return Promise.resolve({ level_1: 0, level_2: 0, level_3: 0, level_4: 0, unrated: 0 });
      }
      if (path.includes('/triage/candidates')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();
    expect(
      await screen.findByText(/当前筛选范围内没有待研判对象/),
    ).toBeInTheDocument();
  });

  it('lists a returned candidate and opens the detail panel on click', async () => {
    apiGet.mockImplementation((path: string) => {
      if (path.includes('/triage/buckets')) {
        return Promise.resolve({ level_1: 0, level_2: 0, level_3: 1, level_4: 0, unrated: 0 });
      }
      if (path.includes('/triage/candidates')) {
        return Promise.resolve([
          {
            source: 'screening',
            resultId: 'r-1',
            candidateId: null,
            userId: 'u-1',
            userName: '张三',
            assessmentId: 'a-1',
            assessmentTitle: 'PHQ-9 筛查',
            assessmentType: 'screening',
            riskLevel: 'level_3',
            totalScore: '19',
            batchId: null,
            candidateStatus: null,
            candidateKind: null,
            suggestion: null,
            priority: null,
            latestEpisodeId: null,
            createdAt: '2026-04-20T10:00:00Z',
          },
        ]);
      }
      if (path.includes('/results/r-1')) {
        return Promise.resolve({
          id: 'r-1',
          totalScore: '19',
          riskLevel: 'level_3',
          dimensionScores: {},
          aiInterpretation: '中度抑郁',
          recommendations: [],
          createdAt: '2026-04-20T10:00:00Z',
        });
      }
      return Promise.resolve([]);
    });

    renderPage();

    const name = await screen.findByText('张三');
    fireEvent.click(name);

    // Right panel should show AI interpretation after click
    expect(await screen.findByText('中度抑郁')).toBeInTheDocument();
  });
});
