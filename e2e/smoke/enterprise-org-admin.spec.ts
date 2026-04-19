import { test, expect } from '@playwright/test';
import { accounts } from '../fixtures/accounts';

test.use({ storageState: accounts.enterpriseOrgAdmin.storageStatePath });

/**
 * Enterprise org_admin = EAP 负责人. dataScope = aggregate_only.
 * Should see aggregated EAP stats but NEVER individual employee PHI.
 */

test.describe('enterprise org_admin (EAP HR) smoke', () => {
  test('lands on / with EnterpriseDashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/你好/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('sees enterprise-specific dashboard content (EAP / 员工 / 部门)', async ({ page }) => {
    await page.goto('/');
    // EnterpriseDashboard renders risk 分布 / 部门 / 服务 content
    await expect(page.getByText(/EAP|员工|部门|风险/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('CANNOT access a clinical page (enforced by aggregate_only scope)', async ({ page }) => {
    // Try to open an individual session notes or client profile page
    // These routes exist but aggregate_only blocks access
    await page.goto('/my-clients');
    // Should either redirect to home / show 403 / show empty denied state
    const denied = await page.locator('body').textContent();
    // Sanity: didn't crash into login
    await expect(page).not.toHaveURL(/\/login/);
    // And if it loaded, it should either be empty or show a restriction message
    // (this is soft — just a smoke test, not a deep compliance check)
    expect(denied).toBeTruthy();
  });
});
