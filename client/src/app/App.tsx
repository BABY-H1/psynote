import React from 'react';
import { Routes, Route, Navigate, NavLink, Outlet } from 'react-router-dom';
import { Providers } from './providers';
import { useAuthStore } from '../stores/authStore';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { ScaleLibrary } from '../features/assessment/pages/ScaleLibrary';
import { AssessmentManagement } from '../features/assessment/pages/AssessmentManagement';
import { AssessmentRunner } from '../features/assessment/pages/AssessmentRunner';
import { CaseWorkbench } from '../features/counseling/pages/CaseWorkbench';
import { EpisodeDetail } from '../features/counseling/pages/EpisodeDetail';
import { CreateEpisodeWizard } from '../features/counseling/pages/CreateEpisodeWizard';
import { MemberManagement } from '../features/settings/pages/MemberManagement';
import { ReminderSettings } from '../features/settings/pages/ReminderSettings';
import { AvailabilitySettings } from '../features/counseling/pages/AvailabilitySettings';
import { AppointmentManagement } from '../features/counseling/pages/AppointmentManagement';
import { GroupCenter } from '../features/groups/pages/GroupCenter';
import { CourseCenter } from '../features/courses/pages/CourseCenter';
import { CourseRequirementsConfig } from '../features/courses/pages/CourseRequirementsConfig';
import { CourseBlueprintEditor } from '../features/courses/pages/CourseBlueprintEditor';
import { LessonEditor } from '../features/courses/pages/LessonEditor';
import { ClientPortalLayout } from '../features/client-portal/ClientPortalLayout';
import { ClientDashboard } from '../features/client-portal/pages/ClientDashboard';
import { ServiceHall } from '../features/client-portal/pages/ServiceHall';
import { MyAppointments } from '../features/client-portal/pages/MyAppointments';
import { MyReports } from '../features/client-portal/pages/MyReports';
import { BookAppointment } from '../features/client-portal/pages/BookAppointment';
import { CourseReader } from '../features/client-portal/pages/CourseReader';
import { ConsentCenter } from '../features/client-portal/pages/ConsentCenter';
import { DashboardHome } from '../features/dashboard/pages/DashboardHome';
import { KnowledgeBase } from '../features/knowledge/pages/KnowledgeBase';
import { GoalLibrary } from '../features/knowledge/pages/GoalLibrary';
import { SchemesTab, CoursesTab, DocumentTemplatesTab } from '../features/knowledge/pages/PlaceholderTabs';
import { AgreementLibrary } from '../features/knowledge/pages/AgreementLibrary';

function AppRoutes() {
  const { user, currentOrgId, currentRole } = useAuthStore();
  const isClient = currentRole === 'client';

  return (
    <Routes>
      {/* Public routes (no auth required) */}
      <Route path="/assess/:assessmentId" element={<AssessmentRunner />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Auth required */}
      {!user ? (
        <Route path="*" element={<Navigate to="/login" replace />} />
      ) : !currentOrgId ? (
        <>
          <Route path="/select-org" element={<OrgSelector />} />
          <Route path="*" element={<Navigate to="/select-org" replace />} />
        </>
      ) : isClient ? (
        /* Client (来访者) portal */
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
      ) : (
        /* Counselor / Admin shell */
        <Route path="/" element={<AppShell />}>
          <Route index element={<DashboardHome />} />
          <Route path="knowledge" element={<KnowledgeBase />}>
            <Route path="scales" element={<ScaleLibrary />} />
            <Route path="goals" element={<GoalLibrary />} />
            <Route path="agreements" element={<AgreementLibrary />} />
            <Route path="schemes" element={<SchemesTab />} />
            <Route path="courses" element={<CoursesTab />} />
            <Route path="templates" element={<DocumentTemplatesTab />} />
          </Route>
          <Route path="scales" element={<Navigate to="/knowledge/scales" replace />} />
          <Route path="assessments" element={<AssessmentManagement />} />
          <Route path="episodes" element={<CaseWorkbench />} />
          <Route path="episodes/new" element={<CreateEpisodeWizard />} />
          <Route path="episodes/:episodeId" element={<EpisodeDetail />} />
          <Route path="settings/members" element={<MemberManagement />} />
          <Route path="settings/reminders" element={<ReminderSettings />} />
          <Route path="appointments" element={<AppointmentManagement />} />
          <Route path="availability" element={<AvailabilitySettings />} />
          <Route path="groups" element={<GroupCenter />} />
          <Route path="courses" element={<CourseCenter />} />
          <Route path="courses/new/requirements" element={<CourseRequirementsConfig />} />
          <Route path="courses/:courseId/requirements" element={<CourseRequirementsConfig />} />
          <Route path="courses/:courseId/blueprint" element={<CourseBlueprintEditor />} />
          <Route path="courses/:courseId/chapters/:chapterId/edit" element={<LessonEditor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  );
}

/** Temporary placeholder for org selection */
function OrgSelector() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">选择机构</h1>
        <p className="text-slate-500">机构选择页面开发中...</p>
      </div>
    </div>
  );
}

const navItems: { to: string; label: string; end?: boolean; disabled?: boolean }[] = [
  { to: '/', label: '首页', end: true },
  { to: '/knowledge', label: '知识库' },
  { to: '/assessments', label: '测评管理' },
  // Phase 3+
  { to: '/episodes', label: '个体咨询' },
  { to: '/groups', label: '团辅中心' },
  { to: '/courses', label: '课程中心' },
  { to: '/settings/members', label: '成员管理' },
];

function AppShell() {
  const { user, currentRole, logout } = useAuthStore();
  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-100">
          <h1 className="text-lg font-bold text-brand-600">Psynote</h1>
          <p className="text-xs text-slate-400">一站式心理服务平台</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) =>
            item.disabled ? (
              <div
                key={item.to}
                className="block px-3 py-2 rounded-lg text-sm text-slate-300 cursor-not-allowed"
              >
                {item.label}
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={'end' in item && item.end}
                className={({ isActive }) =>
                  `block px-3 py-2 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
        <div className="px-4 py-4 border-t border-slate-100">
          <div className="text-sm text-slate-700 font-medium truncate">{user?.name}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full">
              {currentRole}
            </span>
            <button
              onClick={logout}
              className="text-xs text-slate-400 hover:text-slate-600 ml-auto"
            >
              退出
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function App() {
  return (
    <Providers>
      <AppRoutes />
    </Providers>
  );
}
