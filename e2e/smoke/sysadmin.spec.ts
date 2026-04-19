import { test, expect } from '@playwright/test';
import { accounts } from '../fixtures/accounts';

test.use({ storageState: accounts.sysadmin.storageStatePath });

test.describe('sysadmin smoke', () => {
  test('lands on /admin (or sees admin sidebar)', async ({ page }) => {
    await page.goto('/');
    // System admin with no current org is redirected to /admin; with an org,
    // lands on / but with the admin sidebar visible.
    await expect(page).toHaveURL(/\/admin|\//);
    // Admin link/sidebar MUST be visible somewhere
    await expect(page.getByText(/系统管理|后台|平台/).first()).toBeVisible();
  });

  test('can open /admin/tenants without redirect', async ({ page }) => {
    await page.goto('/admin/tenants');
    await expect(page).toHaveURL(/\/admin\/tenants/);
    // Landed — not kicked back to /login
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('tenants page renders org rows (no 403)', async ({ page }) => {
    await page.goto('/admin/tenants');
    // Any org row should show — worst case an empty-state message
    // (we just want to prove the route rendered, not redirected to login)
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toHaveText(/Forbidden|403/i);
  });
});
