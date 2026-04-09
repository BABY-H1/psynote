import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Phase 8b — Independent Vite build for the client-portal package.
 *
 * The portal can now be built and served as a standalone SPA (separate from
 * the main psynote client) at its own domain, e.g. `portal.psynote.com`. The
 * dev server uses port 5174 so it can run alongside the main client (5173).
 *
 * Two alias rules:
 *   `@psynote/client-portal/*` — resolves to this package's own src
 *   `@client/*`                — resolves BACK to `client/src/*`. Phase 8a
 *                                intentionally keeps the portal coupled to
 *                                the main client's hooks/components/store.
 *                                The standalone build resolves this alias at
 *                                bundle time; nothing at runtime needs the
 *                                client app to exist, because Vite inlines
 *                                the imported source files into the portal's
 *                                own bundle.
 *
 * Deployment model:
 *   - The /api/* proxy forwards to the shared psynote backend in dev.
 *   - In prod, serve the built dist/ behind a reverse proxy (nginx/caddy) that
 *     forwards /api/* to the same backend as the main client. Cookies aren't
 *     used for auth — the portal ships Bearer tokens in localStorage, so
 *     cross-domain session sharing is NOT required. Users log in separately
 *     on portal.psynote.com.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@psynote/client-portal': path.resolve(__dirname, './src'),
      '@client': path.resolve(__dirname, '../../client/src'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
