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

  test('sees "待办事项" or "快捷入口" — OrgAdminDashboard-specific panels', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/待办事项|快捷入口/).first()).toBeVisible({ timeout: 10_000 });
  });
});
