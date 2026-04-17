import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@client/stores/authStore';
import { LoginPage } from '@client/features/auth/pages/LoginPage';
import { PortalAppShell } from './PortalAppShell';
import { HomeTab } from './pages/HomeTab';
import { MyServicesTab } from './pages/MyServicesTab';
import { ArchiveTab } from './pages/ArchiveTab';
import { AccountTab } from './pages/AccountTab';
import { ProfileSettings } from './pages/ProfileSettings';
import { ServiceDetail } from './pages/ServiceDetail';
import { BookAppointment } from './pages/BookAppointment';
import { CourseReader } from './pages/CourseReader';
import { ConsentCenter } from './pages/ConsentCenter';
// Phase 9β — assessment report detail with trajectory + AI interpretation
import { AssessmentReportDetail } from './pages/AssessmentReportDetail';
// Phase 14 — Parent self-binding pages
import { ParentBindPage } from './pages/ParentBindPage';
import { MyChildrenPage } from './pages/MyChildrenPage';

/**
 * Phase 8c — Portal route tree (mobile-first, 4-tab bottom navigation).
 *
 *   /login                                          — shared LoginPage
 *
 *   /portal                                         — PortalAppShell wrapper
 *     index                                         — HomeTab (waiting for you)
 *     services                                      — MyServicesTab (active services)
 *     services/:kind/:id                            — ServiceDetail drill-down
 *     services/course/:courseId                     — CourseReader drill-down
 *     book                                          — BookAppointment (from "下次预约" CTA)
 *     archive                                       — ArchiveTab (测评历史 + 时间线)
 *     account                                       — AccountTab (avatar + rows)
 *     account/profile                               — ProfileSettings drill-down
 *     account/consents                              — ConsentCenter drill-down
 *
 *   *                                               — fallback → /portal (or /login if signed out)
 *
 * Compared to Phase 8a/8b's route tree:
 *   - 7 top-level routes → 4 tab roots + 4 drill-down routes
 *   - services/reports/appointments/consents all REMOVED as top-level routes
 *   - ServiceHall page deleted entirely (逛商店 heuristic removed per plan)
 *   - The old `/portal/reports` / `/portal/appointments` URLs would 404 now,
 *     but since portal users navigate via the bottom tab bar (not typed URLs),
 *     this is acceptable. If we later get evidence that external systems link
 *     to these, we can add redirects.
 *
 * ServiceDetail for `kind=counseling` resolves the counselor, shows upcoming
 * + past appointments, and a "预约下一次" button that deep-links into
 * BookAppointment with `?counselorId=...` preselected. kind=group/course
 * just falls back to a "not implemented yet" message (Phase 8c ships
 * counseling detail only, since group/course need new endpoints we won't
 * touch this phase).
 */
export function PortalApp() {
  const { user, _hydrated } = useAuthStore();

  if (!_hydrated) {
    return null;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Phase 14 — Public parent-binding landing page (no auth required) */}
      <Route path="/invite/:token" element={<ParentBindPage />} />

      {!user ? (
        <Route path="*" element={<Navigate to="/login" replace />} />
      ) : (
        <>
          <Route path="/portal" element={<PortalAppShell />}>
            <Route index element={<HomeTab />} />
            <Route path="services" element={<MyServicesTab />} />
            <Route path="services/course/:courseId" element={<CourseReader />} />
            <Route path="services/:kind/:id" element={<ServiceDetail />} />
            <Route path="book" element={<BookAppointment />} />
            <Route path="archive" element={<ArchiveTab />} />
            <Route path="archive/results/:resultId" element={<AssessmentReportDetail />} />
            <Route path="account" element={<AccountTab />} />
            <Route path="account/profile" element={<ProfileSettings />} />
            <Route path="account/consents" element={<ConsentCenter />} />
            <Route path="account/children" element={<MyChildrenPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </>
      )}
    </Routes>
  );
}
