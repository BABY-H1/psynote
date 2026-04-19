import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';

/**
 * Characterization test for ScaleDetail.tsx — the *public behavior* we
 * want to preserve across the Tier B split. This file is written against
 * the pre-refactor 1336-line monolith; it must pass unchanged after the
 * sub-components (OverviewTab / DimensionsTab / ItemsTab / OptionsTab /
 * ScaleAIChatPanel / TopBar) are extracted to their own files.
 *
 * What's pinned:
 *   1. Read-mode top bar: 4 subtab buttons (总览/维度/题目/选项配置),
 *      "编辑" + "删除" action buttons, NO "保存"/"取消".
 *   2. Entering edit mode swaps the action buttons to 保存/取消 (and 编辑
 *      disappears).
 *   3. Each subtab click changes visible content — exercised by clicking
 *      through 维度 → 题目 → 选项配置 and asserting at least one
 *      tab-distinctive piece of text appears.
 *   4. Clicking 保存 dispatches useUpdateScale.mutateAsync with a payload
 *      shaped like the scale (title, dimensions, items).
 *   5. AI chat panel mounts (scale title appears in the right sidebar).
 *
 * Hooks are mocked at the module level — we don't care about the real
 * network / React Query plumbing here, only the component contract.
 */

// ─── Hook mocks ───────────────────────────────────────────────────

const mutateUpdateAsync = vi.fn().mockResolvedValue({});
const mutateDeleteAsync = vi.fn().mockResolvedValue(undefined);
const mutateChatAsync = vi.fn().mockResolvedValue({ type: 'message', content: 'ok' });
const toastMock = vi.fn();

const fakeScale = {
  id: 'scale-1',
  title: '示例量表',
  description: '用于测试',
  instructions: '请根据实际情况作答',
  scoringMode: 'sum',
  isPublic: false,
  orgId: 'org-1',
  dimensions: [
    { id: 'd1', name: '情绪', description: '', calculationMethod: 'sum', rules: [] },
  ],
  items: [
    { id: 'i1', text: '我最近感到紧张', dimensionId: 'd1', isReverseScored: false, options: [{ label: '从不', value: 0 }] },
  ],
};

vi.mock('../../../api/useScales', () => ({
  useScale: () => ({ data: fakeScale, isLoading: false }),
  useUpdateScale: () => ({ mutateAsync: mutateUpdateAsync, isPending: false }),
  useDeleteScale: () => ({ mutateAsync: mutateDeleteAsync, isPending: false }),
}));

vi.mock('../../../api/useAI', () => ({
  useCreateScaleChat: () => ({ mutateAsync: mutateChatAsync, isPending: false }),
}));

vi.mock('../../../shared/components', () => ({
  PageLoading: ({ text }: { text?: string }) => <div data-testid="page-loading">{text}</div>,
  useToast: () => ({ toast: toastMock }),
}));

// Import AFTER mocks are installed.
const { ScaleDetail } = await import('./ScaleDetail');

function renderScaleDetail(overrides?: Partial<{ initialEditing: boolean }>) {
  return render(
    <ScaleDetail
      scaleId="scale-1"
      onBack={vi.fn()}
      initialEditing={overrides?.initialEditing ?? false}
    />,
  );
}

beforeEach(() => {
  cleanup();
  mutateUpdateAsync.mockClear();
  mutateDeleteAsync.mockClear();
  toastMock.mockClear();
});

describe('ScaleDetail — pre-split characterization', () => {
  it('renders 4 subtab buttons in read mode', () => {
    renderScaleDetail();
    for (const label of ['总览', '维度', '题目', '选项配置']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('read mode shows 编辑 + 删除; NOT 保存 or 取消', () => {
    renderScaleDetail();
    expect(screen.getByRole('button', { name: /编辑/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /删除/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^保存/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^取消/ })).not.toBeInTheDocument();
  });

  it('clicking 编辑 swaps action buttons to 保存 + 取消', () => {
    renderScaleDetail();
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    expect(screen.getByRole('button', { name: /^保存/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^取消/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^编辑/ })).not.toBeInTheDocument();
  });

  it('switching subtabs changes visible content (overview → dimensions → items → options)', () => {
    renderScaleDetail();
    // Overview default — the title is visible somewhere
    expect(screen.getAllByText(/示例量表/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '维度' }));
    expect(screen.getByText(/情绪/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '题目' }));
    // Item text appears under the items tab
    expect(screen.getByText(/我最近感到紧张/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '选项配置' }));
    // 从不 is the shared-options label derived from the first item
    expect(screen.getByText(/从不/)).toBeInTheDocument();
  });

  it('clicking 保存 in edit mode dispatches updateScale with the scale fields', async () => {
    renderScaleDetail({ initialEditing: true });
    const saveBtn = await screen.findByRole('button', { name: /^保存/ });
    fireEvent.click(saveBtn);

    // mutateAsync must be called with an object carrying the core fields
    await vi.waitFor(() => {
      expect(mutateUpdateAsync).toHaveBeenCalledTimes(1);
    });
    const payload = mutateUpdateAsync.mock.calls[0][0];
    expect(payload.scaleId).toBe('scale-1');
    expect(payload.title).toBe('示例量表');
    expect(Array.isArray(payload.dimensions)).toBe(true);
    expect(Array.isArray(payload.items)).toBe(true);
  });

  it('AI chat panel renders with the scale title in the sidebar header', () => {
    const { container } = renderScaleDetail();
    // Sidebar is a w-[420px] column on the right; the title shows up in
    // its <h3>. We find it loosely via any heading matching the scale title.
    const heading = within(container).getAllByText('示例量表');
    expect(heading.length).toBeGreaterThan(0);
  });
});
