import React from 'react';
import { Routes, Route, Navigate, NavLink, Outlet } from 'react-router-dom';
import { Providers } from './providers';
import { useAuthStore } from '../stores/authStore';
import { api } from '../api/client';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { ScaleLibrary } from '../features/assessment/pages/ScaleLibrary';
import { AssessmentRunner } from '../features/assessment/pages/AssessmentRunner';
import { EpisodeDetail } from '../features/counseling/pages/EpisodeDetail';
import { CreateEpisodeWizard } from '../features/counseling/pages/CreateEpisodeWizard';
import { MemberManagement } from '../features/settings/pages/MemberManagement';
import { ReminderSettings } from '../features/settings/pages/ReminderSettings';
import { AvailabilitySettings } from '../features/counseling/pages/AvailabilitySettings';
// Note: Phase 3 — CaseWorkbench / GroupCenter / CourseManagement / AssessmentManagement
// are NO LONGER imported here. They are mounted inside DeliveryCenter (features/delivery).
// Phase 8a — portal lives in its own workspace package.
// Phase 8c — portal restructured into a 4-tab mobile-first shell; the main
// client mounts the same new shell and tab pages via the workspace export.
import {
  PortalAppShell,
  HomeTab,
  MyServicesTab,
  ArchiveTab,
  AccountTab,
  ProfileSettings,
  ServiceDetail,
  BookAppointment,
  CourseReader,
  ConsentCenter,
} from '@psynote/client-portal';
import { DashboardHome } from '../features/dashboard/pages/DashboardHome';
import { KnowledgeBase } from '../features/knowledge/pages/KnowledgeBase';
import { GoalLibrary } from '../features/knowledge/pages/GoalLibrary';
import { CoursesTab } from '../features/knowledge/pages/PlaceholderTabs';
import { SchemeLibrary } from '../features/knowledge/pages/SchemeLibrary';
import { NoteTemplateLibrary } from '../features/knowledge/pages/NoteTemplateLibrary';
import { AgreementLibrary } from '../features/knowledge/pages/AgreementLibrary';
import { PublicEnrollment } from '../features/groups/pages/PublicEnrollment';
import { PublicCheckin } from '../features/groups/pages/PublicCheckin';
import { AdminDashboard } from '../features/admin/pages/AdminDashboard';
import { PublicCourseEnrollment } from '../features/courses/pages/PublicCourseEnrollment';
// Phase 2 — dev-only delivery components gallery
import { DeliveryComponentsGallery } from '../features/dev/DeliveryComponentsGallery';
// Phase 3 — unified delivery center
import { DeliveryCenter } from '../features/delivery';
// Phase 6 — person archive (cross-module per-user history)
import { PeopleList } from '../features/delivery/pages/PeopleList';
import { PersonArchive } from '../features/delivery/pages/PersonArchive';
// Phase 7b — org branding settings
import { OrgBrandingSettings } from '../features/settings/pages/OrgBrandingSettings';
import { useOrgBranding } from '../api/useOrgBranding';
import { useHasFeature } from '../shared/hooks/useFeature';

function AppRoutes() {
  const { user, currentOrgId, currentRole, isSystemAdmin, _hydrated } = useAuthStore();
  const isClient = currentRole === 'client';

  // Wait for Zustand to rehydrate from localStorage before routing decisions
  if (!_hydrated) {
    return null;
  }

  return (
    <Routes>
      {/* Public routes (no auth required) */}
      <Route path="/assess/:assessmentId" element={<AssessmentRunner />} />
      <Route path="/enroll/:instanceId" element={<PublicEnrollment />} />
      <Route path="/course-enroll/:instanceId" element={<PublicCourseEnrollment />} />
      <Route path="/checkin/:instanceId/:sessionId" element={<PublicCheckin />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Auth required */}
      {!user ? (
        <Route path="*" element={<Navigate to="/login" replace />} />
      ) : isSystemAdmin && !currentOrgId ? (
        /* System admin without org → admin dashboard */
        <>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/select-org" element={<OrgSelector />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </>
      ) : !currentOrgId ? (
        <>
          <Route path="/select-org" element={<OrgSelector />} />
          <Route path="*" element={<Navigate to="/select-org" replace />} />
        </>
      ) : isClient ? (
        /* Phase 8c — Client (来访者) portal with 4-tab mobile shell.
           See packages/client-portal/src/PortalApp.tsx for the standalone
           equivalent; this route tree mirrors it 1:1. */
        <>
          <Route path="/portal" element={<PortalAppShell />}>
            <Route index element={<HomeTab />} />
            <Route path="services" element={<MyServicesTab />} />
            <Route path="services/course/:courseId" element={<CourseReader />} />
            <Route path="services/:kind/:id" element={<ServiceDetail />} />
            <Route path="book" element={<BookAppointment />} />
            <Route path="archive" element={<ArchiveTab />} />
            <Route path="account" element={<AccountTab />} />
            <Route path="account/profile" element={<ProfileSettings />} />
            <Route path="account/consents" element={<ConsentCenter />} />
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
            <Route path="schemes" element={<SchemeLibrary />} />
            <Route path="courses" element={<CoursesTab />} />
            <Route path="templates" element={<NoteTemplateLibrary />} />
          </Route>
          <Route path="scales" element={<Navigate to="/knowledge/scales" replace />} />
          {/* Phase 3 — unified delivery center */}
          <Route path="delivery" element={<DeliveryCenter />} />
          {/* Phase 6 — person archive: list + per-user detail */}
          <Route path="delivery/people" element={<PeopleList />} />
          <Route path="delivery/people/:userId" element={<PersonArchive />} />
          {/* Phase 3 — backwards-compatible redirects from the old per-module list URLs.
              Detail / wizard routes (e.g. /episodes/new, /episodes/:id) are kept intact below. */}
          <Route path="assessments" element={<Navigate to="/delivery?type=assessment" replace />} />
          <Route path="episodes" element={<Navigate to="/delivery?type=counseling" replace />} />
          <Route path="groups" element={<Navigate to="/delivery?type=group" replace />} />
          <Route path="courses" element={<Navigate to="/delivery?type=course" replace />} />
          {/* Per-module detail and wizard routes — kept; entered from inside the delivery center */}
          <Route path="episodes/new" element={<CreateEpisodeWizard />} />
          <Route path="episodes/:episodeId" element={<EpisodeDetail />} />
          <Route path="settings/members" element={<MemberManagement />} />
          <Route path="settings/reminders" element={<ReminderSettings />} />
          {/* Phase 7b — org branding (gated by branding feature inside the page) */}
          <Route path="settings/branding" element={<OrgBrandingSettings />} />
          <Route path="availability" element={<AvailabilitySettings />} />
          {isSystemAdmin && (
            <Route path="admin" element={<AdminDashboard />} />
          )}
          {/* Phase 2 — Dev-only component gallery, available in any non-prod env */}
          {import.meta.env.DEV && (
            <Route path="dev/delivery-components" element={<DeliveryComponentsGallery />} />
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  );
}

function OrgSelector() {
  const { setOrg, logout } = useAuthStore();
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Phase 7a — org list now includes `plan` so we can seed the tier
        // into the auth store alongside the role.
        const orgs = await api.get<{ id: string; name: string; myRole: string; plan?: string }[]>('/orgs');
        if (cancelled) return;
        if (orgs.length === 0) {
          setError('您尚未加入任何机构');
          return;
        }
        const { planToTier } = await import('@psynote/shared');
        // setOrg triggers re-render → AppRoutes sees currentOrgId → routes to correct view
        setOrg(orgs[0].id, orgs[0].myRole as any, planToTier(orgs[0].plan));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载机构失败');
      }
    })();
    return () => { cancelled = true; };
  }, [setOrg]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-900 mb-2">无法进入</h1>
          <p className="text-slate-500 text-sm mb-4">{error}</p>
          <button onClick={logout} className="text-sm text-brand-600 hover:underline">退出登录</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <p className="text-slate-400 text-sm">正在加载...</p>
    </div>
  );
}

// Phase 3 — sidebar reduced from 7 items to 4 by collapsing the four delivery
// module entries (测评管理 / 个体咨询 / 团辅中心 / 课程中心) into a single
// "交付中心" entry. Type filtering happens inside DeliveryCenter via querystring.
// Phase 7b — "品牌定制" added as a feature-gated entry (only shown when the
// current org's tier includes the `branding` feature).
interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  disabled?: boolean;
  /** If set, only show when the current org tier includes this feature */
  requiresFeature?: 'branding';
}

const allNavItems: NavItem[] = [
  { to: '/', label: '首页', end: true },
  { to: '/knowledge', label: '知识库' },
  { to: '/delivery', label: '交付中心' },
  { to: '/settings/members', label: '成员管理' },
  { to: '/settings/branding', label: '品牌定制', requiresFeature: 'branding' },
];

const adminStaffPaths = new Set(['/', '/settings/members']);

function getNavItems(role: string | null, hasBranding: boolean): NavItem[] {
  let items = allNavItems;
  if (role === 'admin_staff') {
    items = items.filter((item) => adminStaffPaths.has(item.to));
  }
  // Filter feature-gated items
  return items.filter((item) => {
    if (item.requiresFeature === 'branding') return hasBranding;
    return true;
  });
}

function AppShell() {
  const { user, currentRole, currentOrgId, currentOrgTier, setOrg, isSystemAdmin, logout } = useAuthStore();
  const hasBranding = useHasFeature('branding');
  const navItems = getNavItems(currentRole, hasBranding);

  // Phase 7a bootstrap — if the persisted auth state predates Phase 7, it may
  // be missing `currentOrgTier`. On first mount after login, pull it from
  // `/subscription` and hydrate the store. Idempotent: only fires when tier
  // is null but we already have an orgId + role.
  React.useEffect(() => {
    if (currentOrgId && currentRole && !currentOrgTier) {
      api
        .get<{ tier: string }>(`/orgs/${currentOrgId}/subscription`)
        .then((res) => {
          // Dynamic import keeps the bundle split clean
          import('@psynote/shared').then(({ planToTier }) => {
            // `tier` here is already a mapped OrgTier, not a raw plan string
            const t = res.tier as any;
            setOrg(currentOrgId, currentRole, t ?? planToTier(null));
          });
        })
        .catch(() => {
          // Silent fallback: keep tier null → useFeature defaults to 'solo'
        });
    }
  }, [currentOrgId, currentRole, currentOrgTier, setOrg]);

  // Phase 7b — if the org has branding tier + a logo set, swap the "Psynote"
  // wordmark in the sidebar header for the org's custom logo. Otherwise this
  // hook returns undefined branding and the fallback h1 is rendered.
  const { data: branding } = useOrgBranding();
  const logoUrl = branding?.logoUrl;
  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-100">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="org logo"
              className="h-7 w-auto max-w-full"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <h1 className="text-lg font-bold text-brand-600">Psynote</h1>
          )}
          <p className="text-xs text-slate-400 mt-0.5">一站式心理服务平台</p>
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
          {isSystemAdmin && (
            <>
              <div className="border-t border-slate-100 my-2" />
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `block px-3 py-2 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-red-50 text-red-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                系统管理
              </NavLink>
            </>
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
