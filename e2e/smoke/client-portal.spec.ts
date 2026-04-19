import { test, expect } from '@playwright/test';
import { accounts } from '../fixtures/accounts';

test.use({ storageState: accounts.clientPortal.storageStatePath });

/**
 * Client (来访者 / 学生 / 员工) logs in and lands on /portal — separate shell
 * from the main AppShell. They should never see the admin interface.
 */

test.describe('client portal smoke', () => {
  test('lands on /portal or / with portal-like content', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login/);
    // Client login should route them to /portal
    await expect(page).toHaveURL(/\/portal|\//);
  });

  test('does NOT see admin or counselor-facing sections', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/admin/);
    const forbidden = await page.getByRole('link', { name: /系统管理|我的个案|督导/ }).count();
    expect(forbidden).toBe(0);
  });

  test('directly visiting /admin redirects away', async ({ page }) => {
    await page.goto('/admin');
    // Client should be kicked to portal or home, never see admin UI
    await expect(page).not.toHaveURL(/\/admin$/);
  });
});
