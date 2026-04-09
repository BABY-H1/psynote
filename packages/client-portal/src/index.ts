/**
 * Phase 8a — `@psynote/client-portal` public API surface.
 * Phase 8c — Restructured from 7 flat pages into a 4-tab mobile-first shell.
 *
 * This workspace package bundles the C-side portal into its own package so
 * it can be independently built (Phase 8b: `npm run build --workspace=@psynote/client-portal`)
 * or re-used by the main psynote client via `@psynote/client-portal` imports.
 *
 * Exports below are split into two groups:
 *
 *   1. New (Phase 8c) — the 4-tab shell + tab pages + drill-down pages.
 *      These are what the main psynote client imports to mount `/portal/*`,
 *      and what PortalApp.tsx renders in the standalone build.
 *
 *   2. Leaf pages — still valid endpoints reached via drill-down from the
 *      new tabs. Re-exported so main-client `AppRoutes` can mount them
 *      directly inside the same route tree as the shell.
 */

// Phase 8c — new mobile-first shell + tab pages
export { PortalAppShell } from './PortalAppShell';
export { HomeTab } from './pages/HomeTab';
export { MyServicesTab } from './pages/MyServicesTab';
export { ArchiveTab } from './pages/ArchiveTab';
export { AccountTab } from './pages/AccountTab';
export { ProfileSettings } from './pages/ProfileSettings';
export { ServiceDetail } from './pages/ServiceDetail';

// Leaf / drill-down pages — still used by the new shell
export { BookAppointment } from './pages/BookAppointment';
export { CourseReader } from './pages/CourseReader';
export { ConsentCenter } from './pages/ConsentCenter';
