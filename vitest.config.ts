import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Monorepo-wide Vitest config using projects.
 * - packages/shared and server run in Node env.
 * - client runs in jsdom (set up in Phase 3; currently excluded).
 *
 * Run from root:
 *   npm test          # run all projects once
 *   npm run test:watch
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'shared',
          root: './packages/shared',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          root: './server',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          // Inject env vars before any src import chain loads config/env.ts
          // (env.ts would process.exit(1) without DATABASE_URL).
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'client',
          root: './client',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./src/test/setup.ts'],
          globals: false,
        },
      },
    ],
  },
});
