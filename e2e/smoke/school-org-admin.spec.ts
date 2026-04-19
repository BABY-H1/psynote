import { test, expect } from '@playwright/test';
import { accounts } from '../fixtures/accounts';

test.use({ storageState: accounts.schoolOrgAdmin.storageStatePath });

/**
 * School org_admin — lands on SchoolDashboard with school-specific content.
 */

test.describe('school org_admin smoke', () => {
  test('lands on / with SchoolDashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/你好/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('sees school-specific content (学生 / 班级 / 学校)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/学生|班级|学校/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('can open school students list', async ({ page }) => {
    await page.goto('/school/students');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toHaveText(/Forbidden|403/i);
  });
});
