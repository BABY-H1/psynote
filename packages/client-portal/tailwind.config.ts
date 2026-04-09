import type { Config } from 'tailwindcss';

/**
 * Phase 8b — Portal-specific Tailwind config.
 *
 * The content globs MUST include BOTH the portal src AND the client src,
 * because Phase 8a portal files use `@client/*` imports to pull in shared
 * UI components and hooks from client/src. If we didn't scan client/src,
 * Tailwind would purge classes used inside those imported files and the
 * portal build would render unstyled.
 *
 * Design tokens mirror `client/tailwind.config.ts` one-to-one so the portal
 * and main client render identical colors. Promoting these to a shared
 * `@psynote/tailwind-preset` is a Phase 8c candidate.
 */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../client/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
