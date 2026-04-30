import { test, expect } from '@playwright/test';
import { accounts } from '../fixtures/accounts';

/**
 * Phase J e2e — research-triage dispatch happy path.
 *
 * 主链路: counselor 登录 → /research-triage → 看到候选行 → 点开详情
 * → 点 "课程" 按钮打开 inline picker → 选具体 instance → 派单成功 toast.
 *
 * 这条链路串了:
 *   - dataScopeGuard ('assigned' counselor 能看到分配给他的 client 的 result)
 *   - GET /triage/candidates  + GET /triage/buckets  (列表 + 分级桶)
 *   - GET /results/:resultId   (详情面板)
 *   - GET /course-instances    (picker 列表)
 *   - POST /triage/results/:id/candidate (lazy create candidate_pool 行)
 *   - POST /course-instances/:id/assign   (报名)
 *   - POST /workflow/candidates/:id/accept (resolvedRefType=course_enrollment)
 *
 * 任何一环断了, 这条 spec 就会红.
 *
 * 数据依赖 (由 server/src/seed-e2e.ts 第 8 块负责注入, idempotent):
 *   - 把 counselingClient (李同学) 分配给 counselingCounselor (张咨询师)
 *   - 一个已提交的 mini assessment_result, riskLevel='level_3', 关联到李同学
 *   - 一个 active 状态的 course_instance, title='E2E 演示课程'
 */

test.use({ storageState: accounts.counselingCounselor.storageStatePath });

test.describe('research-triage dispatch happy path (counselor → course)', () => {
  test('counselor dispatches a screening candidate to a course from research-triage', async ({ page }) => {
    await page.goto('/research-triage');
    await expect(page).not.toHaveURL(/\/login/);

    // 1) 进了正确的页面 — 标题渲染
    await expect(page.getByRole('heading', { name: '研判分流' })).toBeVisible({ timeout: 10_000 });

    // 2) 候选列表里能看到 seed 创建的 "李同学" 那条 (mini assessment, level_3)
    //    用 .first() 防止其他 e2e 数据偶发同名干扰.
    const candidateRow = page.getByText('李同学').first();
    await expect(candidateRow).toBeVisible({ timeout: 10_000 });
    await candidateRow.click();

    // 3) 详情面板打开 — TriageActionBar 4 按钮中的 "课程" 应该可见且可点击.
    //    candidate.userId 必须有值 (seed 保证), 否则按钮 disabled.
    const courseBtn = page.getByRole('button', { name: '课程' });
    await expect(courseBtn).toBeVisible();
    await expect(courseBtn).toBeEnabled();
    await courseBtn.click();

    // 4) InstancePicker 里渲染了 seed 的 active course_instance.
    //    InstanceRow 是 <button>, 包含 title 文本.
    const courseInstance = page.getByRole('button', { name: /E2E 演示课程/ });
    await expect(courseInstance).toBeVisible({ timeout: 10_000 });
    await courseInstance.click();

    // 5) 点完触发 lazyCreate → assign → accept 三连. 成功后 toast.
    //    Toast 的文本是 "已报名到「E2E 演示课程」", 这里只匹配前缀避免被书名号搞.
    await expect(page.getByText(/已报名到/)).toBeVisible({ timeout: 15_000 });
  });
});
