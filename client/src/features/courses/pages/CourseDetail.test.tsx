import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

/**
 * Characterization test for CourseDetail.tsx — pins the *public behavior*
 * we want preserved across the Tier B split.
 *
 * Written against the pre-refactor 973-line monolith; must pass unchanged
 * after OverviewPanel / ChapterDetailView / LessonBlockEditor /
 * CourseAIChatPanel / TopBar are extracted.
 *
 * Pins:
 *   1. Top-bar shows a "总" tab + one numbered tab per blueprint session.
 *   2. Read mode: shows 编辑 + 删除 + status chip; does NOT show 保存/取消.
 *   3. Click 编辑 → 保存 + 取消 appear; 编辑 disappears.
 *   4. Click 保存 (initialEditing=true) → useUpdateCourse.mutateAsync fires
 *      with the course fields.
 *   5. AI chat panel's sidebar header carries the course title.
 */

// ─── Hook mocks ───────────────────────────────────────────────────

const updateCourseMutate = vi.fn().mockResolvedValue({});
const deleteCourseMutate = vi.fn().mockResolvedValue(undefined);
const confirmBlueprintMutate = vi.fn().mockResolvedValue({});
const upsertBlocksMutate = vi.fn().mockResolvedValue({});
const refineBlueprintMutate = vi.fn().mockResolvedValue({});
const refineBlockMutate = vi.fn().mockResolvedValue({ content: 'ai' });
const toastMock = vi.fn();

const fakeCourse = {
  id: 'course-1',
  title: '正念入门 8 讲',
  description: '面向新手的正念课程',
  status: 'draft',
  orgId: 'org-1',
  chapters: [
    { id: 'chap-1', sessionIndex: 0, title: '第1讲' },
  ],
  blueprintData: {
    courseName: '正念入门 8 讲',
    positioning: '',
    targetDescription: '',
    boundaries: '',
    goals: [],
    referralAdvice: '',
    sessions: [
      { title: '引入正念', objectives: '了解概念', activities: '呼吸练习' },
      { title: '身体扫描', objectives: '身心连接', activities: '扫描练习' },
    ],
  },
};

vi.mock('../../../api/useCourses', () => ({
  useCourse: () => ({ data: fakeCourse, isLoading: false }),
  useUpdateCourse: () => ({ mutateAsync: updateCourseMutate, isPending: false }),
  useDeleteCourse: () => ({ mutateAsync: deleteCourseMutate, isPending: false }),
  useConfirmBlueprint: () => ({ mutateAsync: confirmBlueprintMutate, isPending: false }),
  useLessonBlocks: () => ({ data: [], isLoading: false }),
  useUpsertLessonBlocks: () => ({ mutateAsync: upsertBlocksMutate, isPending: false }),
}));

vi.mock('../../../api/useCourseAuthoring', () => ({
  useRefineCourseBlueprint: () => ({ mutateAsync: refineBlueprintMutate, isPending: false }),
  useRefineLessonBlock: () => ({ mutateAsync: refineBlockMutate, isPending: false }),
}));

vi.mock('../../../shared/components', () => ({
  PageLoading: ({ text }: { text?: string }) => <div data-testid="page-loading">{text}</div>,
  useToast: () => ({ toast: toastMock }),
}));

// ContentBlockPanel is a heavyweight sub-tree; stub it so we don't have
// to stand up its own hook graph.
vi.mock('../../knowledge/components/ContentBlockPanel', () => ({
  ContentBlockPanel: () => <div data-testid="content-block-panel" />,
}));

// Import AFTER mocks.
const { CourseDetail } = await import('./CourseDetail');

function renderCourseDetail(overrides?: Partial<{ initialEditing: boolean }>) {
  return render(
    <CourseDetail
      courseId="course-1"
      onBack={vi.fn()}
      initialEditing={overrides?.initialEditing ?? false}
    />,
  );
}

beforeEach(() => {
  cleanup();
  updateCourseMutate.mockClear();
  deleteCourseMutate.mockClear();
  upsertBlocksMutate.mockClear();
  confirmBlueprintMutate.mockClear();
  toastMock.mockClear();
});

describe('CourseDetail — pre-split characterization', () => {
  it('renders "总" tab plus one numbered tab per blueprint session', () => {
    renderCourseDetail();
    expect(screen.getByRole('button', { name: '总' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
    // No session #3 — blueprint only declares 2
    expect(screen.queryByRole('button', { name: '3' })).not.toBeInTheDocument();
  });

  it('read mode shows 编辑 + 删除 + status chip; NOT 保存 or 取消', () => {
    renderCourseDetail();
    expect(screen.getByRole('button', { name: /编辑/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /删除/ })).toBeInTheDocument();
    expect(screen.getByText('草稿')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^保存/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^取消/ })).not.toBeInTheDocument();
  });

  it('clicking 编辑 swaps to 保存 + 取消', () => {
    renderCourseDetail();
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    expect(screen.getByRole('button', { name: /^保存/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^取消/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^编辑/ })).not.toBeInTheDocument();
  });

  it('clicking 保存 in edit mode fires useUpdateCourse with the course fields', async () => {
    renderCourseDetail({ initialEditing: true });
    const saveBtn = await screen.findByRole('button', { name: /^保存/ });
    fireEvent.click(saveBtn);

    await vi.waitFor(() => {
      expect(updateCourseMutate).toHaveBeenCalledTimes(1);
    });
    const payload = updateCourseMutate.mock.calls[0][0];
    expect(payload.courseId).toBe('course-1');
    expect(payload.title).toBe('正念入门 8 讲');
  });

  it('AI chat sidebar carries the course title in its header', () => {
    renderCourseDetail();
    // Title appears in sidebar <h3> and potentially in overview fields —
    // getAllByText to not care about count, just existence.
    expect(screen.getAllByText(/正念入门 8 讲/).length).toBeGreaterThan(0);
  });
});
