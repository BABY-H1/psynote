import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

/**
 * Characterization test for SchemeDetail.tsx — pins public behavior
 * across the Tier B split. Written against the pre-refactor 884-line
 * monolith; must stay green after the split.
 *
 * Pins:
 *   1. "总" tab + N numbered session tabs; read-mode shows + 编辑 按钮
 *      and the visibility chip.
 *   2. Read mode does NOT show 保存/取消.
 *   3. Clicking 编辑 swaps action buttons to 保存 + 取消.
 *   4. initialEditing=true + 保存 click → useUpdateGroupScheme fires
 *      with { schemeId, sessions: [...] }.
 *   5. Sidebar shows the scheme title in its header.
 */

const updateSchemeMutate = vi.fn().mockResolvedValue({});
const deleteSchemeMutate = vi.fn().mockResolvedValue(undefined);
const refineSchemeMutate = vi.fn().mockResolvedValue({});
const refineSessionMutate = vi.fn().mockResolvedValue({});
const toastMock = vi.fn();

const fakeScheme = {
  id: 'scheme-1',
  title: '校园欺凌应对 6 次团辅',
  description: '面向中学生的 6 次团辅方案',
  theory: '认知行为 + 系统家庭',
  overallGoal: '提升识别与回应能力',
  specificGoals: [{ title: '识别欺凌行为' }],
  targetAudience: '初中生',
  ageRange: '12-15',
  sessions: [
    { id: 's1', title: '第一次：破冰', goal: '熟悉小组', phases: [] },
    { id: 's2', title: '第二次：识别', goal: '', phases: [] },
  ],
  visibility: 'organization',
};

vi.mock('../../../api/useGroups', () => ({
  useGroupScheme: () => ({ data: fakeScheme, isLoading: false }),
  useUpdateGroupScheme: () => ({ mutateAsync: updateSchemeMutate, isPending: false }),
  useDeleteGroupScheme: () => ({ mutateAsync: deleteSchemeMutate, isPending: false }),
}));

vi.mock('../../../api/useAssessments', () => ({
  useAssessments: () => ({ data: [] }),
}));

vi.mock('../../../api/useAI', () => ({
  useRefineSchemeOverall: () => ({ mutate: refineSchemeMutate, isPending: false }),
  useRefineSessionDetail: () => ({ mutate: refineSessionMutate, isPending: false }),
  useGenerateSessionDetail: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../../../shared/components', () => ({
  PageLoading: ({ text }: { text?: string }) => <div data-testid="page-loading">{text}</div>,
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('./ContentBlockPanel', () => ({
  ContentBlockPanel: () => <div data-testid="content-block-panel" />,
}));

const { SchemeDetail } = await import('./SchemeDetail');

function renderIt(overrides?: Partial<{ initialEditing: boolean }>) {
  return render(
    <SchemeDetail
      schemeId="scheme-1"
      onBack={vi.fn()}
      initialEditing={overrides?.initialEditing ?? false}
    />,
  );
}

beforeEach(() => {
  cleanup();
  updateSchemeMutate.mockClear();
  deleteSchemeMutate.mockClear();
  toastMock.mockClear();
});

describe('SchemeDetail — pre-split characterization', () => {
  it('renders "总" tab plus one numbered tab per session', () => {
    renderIt();
    expect(screen.getByRole('button', { name: '总' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '3' })).not.toBeInTheDocument();
  });

  it('read mode shows 编辑 + 删除 + visibility chip; NOT 保存/取消', () => {
    renderIt();
    expect(screen.getByRole('button', { name: /编辑/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /删除/ })).toBeInTheDocument();
    expect(screen.getByText('本机构')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^保存/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^取消/ })).not.toBeInTheDocument();
  });

  it('clicking 编辑 swaps to 保存 + 取消', () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    expect(screen.getByRole('button', { name: /^保存/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^取消/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^编辑/ })).not.toBeInTheDocument();
  });

  it('clicking 保存 in edit mode fires useUpdateGroupScheme with sessions', async () => {
    renderIt({ initialEditing: true });
    const saveBtn = await screen.findByRole('button', { name: /^保存/ });
    fireEvent.click(saveBtn);
    await vi.waitFor(() => expect(updateSchemeMutate).toHaveBeenCalledTimes(1));
    const payload = updateSchemeMutate.mock.calls[0][0];
    expect(payload.schemeId).toBe('scheme-1');
    expect(Array.isArray(payload.sessions)).toBe(true);
    expect(payload.sessions.length).toBe(2);
  });

  it('AI chat sidebar carries scheme title in its header', () => {
    renderIt();
    expect(screen.getAllByText(/校园欺凌应对 6 次团辅/).length).toBeGreaterThan(0);
  });
});
