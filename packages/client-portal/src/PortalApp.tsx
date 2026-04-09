import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@client/stores/authStore';
import { LoginPage } from '@client/features/auth/pages/LoginPage';
import { ClientPortalLayout } from './ClientPortalLayout';
import { ClientDashboard } from './pages/ClientDashboard';
import { ServiceHall } from './pages/ServiceHall';
import { MyAppointments } from './pages/MyAppointments';
import { MyReports } from './pages/MyReports';
import { BookAppointment } from './pages/BookAppointment';
import { CourseReader } from './pages/CourseReader';
import { ConsentCenter } from './pages/ConsentCenter';

/**
 * Phase 8b — Portal-only React Router tree.
 *
 * The main psynote client has a much larger `AppRoutes` tree with counselor,
 * org_admin, and system-admin branches. The portal intentionally renders a
 * much smaller subset:
 *
 *   /login         — shared LoginPage (imported from the client via @client/*)
 *   /portal/*      — the 5 portal tabs under ClientPortalLayout
 *   *              — everything else redirects to /portal (or /login if signed out)
 *
 * This deliberately mirrors what the main client exposes for the `client`
 * role, but without the dispatch logic that would also send non-client roles
 * off to the counselor shell. A counselor/admin user who somehow lands on
 * the portal will just be bounced to /portal — they can still use the portal
 * pages (they're read-only reports of their own account, which is fine).
 */
export function PortalApp() {
  const { user, _hydrated } = useAuthStore();

  // Wait for Zustand to rehydrate before making routing decisions
  if (!_hydrated) {
    return null;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Public share routes (Phase 7 of main client may still link to these);
          the portal hosts none of them — redirect to the main app. */}

      {!user ? (
        <Route path="*" element={<Navigate to="/login" replace />} />
      ) : (
        <>
          <Route path="/portal" element={<ClientPortalLayout />}>
            <Route index element={<ClientDashboard />} />
            <Route path="reports" element={<MyReports />} />
            <Route path="services" element={<ServiceHall />} />
            <Route path="appointments" element={<MyAppointments />} />
            <Route path="book" element={<BookAppointment />} />
            <Route path="consents" element={<ConsentCenter />} />
            <Route path="courses/:courseId" element={<CourseReader />} />
          </Route>
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </>
      )}
    </Routes>
  );
}
