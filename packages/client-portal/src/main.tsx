import React from 'react';
import ReactDOM from 'react-dom/client';
import { Providers } from '@client/app/providers';
import { PortalApp } from './PortalApp';
import './index.css';

/**
 * Phase 8b — Portal entry point (independent from the main client's main.tsx).
 *
 * Reuses the main client's `Providers` (QueryClientProvider + BrowserRouter +
 * ErrorBoundary + ToastProvider) via the `@client/*` alias, which is
 * bundle-inlined by Vite at build time. This avoids re-implementing the
 * cross-cutting plumbing while still producing a portal-only SPA.
 *
 * Dev-mode convenience: auto-seed the `client` role demo user so the portal
 * dev server can be viewed without manually logging in. The main client's
 * main.tsx does the same thing but seeds `counselor`. In prod, neither code
 * path runs because `import.meta.env.DEV` is false.
 */
if (import.meta.env.DEV) {
  const { seedDemoAuth } = await import('@client/dev-seed');
  await seedDemoAuth('client');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Providers>
      <PortalApp />
    </Providers>
  </React.StrictMode>,
);
