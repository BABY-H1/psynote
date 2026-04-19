import { test, expect } from '@playwright/test';
import { accounts } from '../fixtures/accounts';

test.use({ storageState: accounts.counselingCounselor.storageStatePath });

test.describe('counseling counselor smoke', () => {
  test('lands on / with DashboardHome (你好 greeting)', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/你好/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('can access delivery / people', async ({ page }) => {
    await page.goto('/delivery');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toHaveText(/Forbidden|403/i);
  });

  test('does NOT see system admin nav link', async ({ page }) => {
    await page.goto('/');
    // Non-admin should not see "系统管理" in sidebar
    const adminLinks = await page.getByRole('link', { name: /系统管理/ }).count();
    expect(adminLinks).toBe(0);
  });
});
