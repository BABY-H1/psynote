/**
 * Phase 8a — `@psynote/client-portal` public API surface.
 *
 * This workspace package bundles the C-side portal (来访者 / 学员 / 受测者 UI)
 * into its own package so it can later be independently built for web,
 * independent hosting, or a small-shell adapter (Taro / uni-app for WeChat
 * Mini Program). Phase 8a ships the filesystem split only; the portal still
 * imports react-query hooks and shared UI components from `client/src/*` via
 * the `@client/*` path alias. See the tsconfig/paths setup.
 *
 * The main psynote client consumes this package exactly as it would any other
 * workspace package:
 *
 *     import { ClientPortalLayout, ClientDashboard } from '@psynote/client-portal';
 */

export { ClientPortalLayout } from './ClientPortalLayout';
export { ClientDashboard } from './pages/ClientDashboard';
export { ServiceHall } from './pages/ServiceHall';
export { MyAppointments } from './pages/MyAppointments';
export { MyReports } from './pages/MyReports';
export { BookAppointment } from './pages/BookAppointment';
export { CourseReader } from './pages/CourseReader';
export { ConsentCenter } from './pages/ConsentCenter';
