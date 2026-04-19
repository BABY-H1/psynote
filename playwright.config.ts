import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for psynote E2E smoke tests.
 *
 * How to run:
 *   1. Start dev server in another terminal:  `npm run dev`
 *   2. In this terminal:                       `npm run test:e2e`
 *
 * By design `reuseExistingServer: true` and no `webServer.command` — Playwright
 * will NOT auto-start the dev server. This avoids port conflicts and keeps the
 * seed / migration state fully in your control.
 *
 * If you later want CI-style auto-start, uncomment the `webServer.command`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // smoke depends on login setup; serial is safer
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:5173',
  //   reuseExistingServer: true,
  //   timeout: 120_000,
  // },

  projects: [
    // --- 1. Setup project: logs each role in via UI, saves storageState ---
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    // --- 2. Smoke project: per-role tests reusing saved storageState ---
    {
      name: 'smoke',
      dependencies: ['setup'],
      testMatch: /smoke\/.*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
