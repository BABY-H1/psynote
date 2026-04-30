import { test, expect } from '@playwright/test';
import { accounts } from '../fixtures/accounts';

test.use({ storageState: accounts.counselingOrgAdmin.storageStatePath });

test.describe('counseling org_admin smoke', () => {
  test('lands on / and home renders (你好 greeting)', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/你好/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('delivery center is accessible', async ({ page }) => {
    await page.goto('/delivery');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toHaveText(/Forbidden|403/i);
  });

  test('sees "机构运营概览" — distinguishes OrgAdminDashboard from counselor DashboardHome', async ({ page }) => {
    // Dashboard 重设计 (commit 046a7f6) 后,OrgAdminDashboard 的 admin-only 标识从
    // "待办事项 / 快捷入口" 改为 "机构运营概览" 副标题 + 5 KPI 卡 (本月新增来访者 etc).
    // counselor 的 DashboardHome 副标题是 "今日工作看板", 不会撞.
    await page.goto('/');
    await expect(page.getByText(/机构运营概览/).first()).toBeVisible({ timeout: 10_000 });
  });
});
