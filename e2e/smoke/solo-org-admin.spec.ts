import { test, expect } from '@playwright/test';
import { accounts } from '../fixtures/accounts';

test.use({ storageState: accounts.soloOrgAdmin.storageStatePath });

/**
 * Solo mode — independent practitioner, DashboardHome (not OrgAdminDashboard).
 */

test.describe('solo org_admin smoke', () => {
  test('lands on / with DashboardHome (solo branch)', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/你好/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('does NOT see multi-member management ("邀请成员" etc.)', async ({ page }) => {
    await page.goto('/');
    // Solo mode should hide org-member UIs (invite, roster management)
    const orgOnlyLinks = await page.getByText(/邀请成员|成员管理/).count();
    expect(orgOnlyLinks).toBe(0);
  });

  test('can access my-clients', async ({ page }) => {
    await page.goto('/my-clients');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toHaveText(/Forbidden|403/i);
  });
});
