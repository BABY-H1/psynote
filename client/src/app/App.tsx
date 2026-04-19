import React from 'react';
import { Routes, Route, Navigate, NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Providers } from './providers';
import { RoleBasedHome } from './RoleBasedHome';
import { isVisible, type SceneContext, type SceneVisibility } from './scene/visibility';
import { DEFAULT_ORG_TYPE } from '../shared/constants/roles';
import { useAuthStore } from '../stores/authStore';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { ScaleLibrary } from '../features/assessment/pages/ScaleLibrary';
import { AssessmentRunner } from '../features/assessment/pages/AssessmentRunner';
import { EpisodeDetail } from '../features/counseling/pages/EpisodeDetail';
import { CreateEpisodeWizard } from '../features/counseling/pages/CreateEpisodeWizard';
// MemberManagement now embedded inside OrgSettingsPage
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
import { KnowledgeBase } from '../features/knowledge/pages/KnowledgeBase';
import { GoalLibrary } from '../features/knowledge/pages/GoalLibrary';
import { CoursesTab } from '../features/knowledge/pages/PlaceholderTabs';
import { SchemeLibrary } from '../features/knowledge/pages/SchemeLibrary';
import { NoteTemplateLibrary } from '../features/knowledge/pages/NoteTemplateLibrary';
import { AgreementLibrary } from '../features/knowledge/pages/AgreementLibrary';
import { PublicEnrollment } from '../features/groups/pages/PublicEnrollment';
import { PublicCheckin } from '../features/groups/pages/PublicCheckin';
import { AdminLayout } from '../features/admin/AdminLayout';
import { AdminHome } from '../features/admin/pages/AdminHome';
import { TenantList } from '../features/admin/pages/TenantList';
import { TenantWizard } from '../features/admin/pages/TenantWizard';
import { TenantDetail } from '../features/admin/pages/TenantDetail';
import { AdminLibrary } from '../features/admin/pages/AdminLibrary';
import { AdminLibraryScales } from '../features/admin/pages/AdminLibraryScales';
import { AdminLibraryCourses } from '../features/admin/pages/AdminLibraryCourses';
import { AdminLibrarySchemes } from '../features/admin/pages/AdminLibrarySchemes';
import { AdminLibraryTemplates } from '../features/admin/pages/AdminLibraryTemplates';
import { AdminLibraryGoals } from '../features/admin/pages/AdminLibraryGoals';
import { UserManagement } from '../features/admin/pages/UserManagement';
import { SystemConfig } from '../features/admin/pages/SystemConfig';
import { PublicCourseEnrollment } from '../features/courses/pages/PublicCourseEnrollment';
// Phase 2 — dev-only delivery components gallery
import { DeliveryComponentsGallery } from '../features/dev/DeliveryComponentsGallery';
// Phase 3 — unified delivery center
import { DeliveryCenter } from '../features/delivery';
// Phase 6 — person archive (cross-module per-user history)
import { PeopleList } from '../features/delivery/pages/PeopleList';
import { PersonArchive } from '../features/delivery/pages/PersonArchive';
// Phase 7b — org branding (now embedded inside OrgSettingsPage)
import { useOrgBranding } from '../api/useOrgBranding';
// Phase 10 — org collaboration & audit & settings
import { OrgCollaboration } from '../features/collaboration/OrgCollaboration';
import { AuditLogViewer } from '../features/collaboration/AuditLogViewer';
import { OrgSettingsPage } from '../features/settings/pages/OrgSettingsPage';

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
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminHome />} />
            <Route path="tenants" element={<TenantList />} />
            <Route path="tenants/new" element={<TenantWizard />} />
            <Route path="tenants/:orgId" element={<TenantDetail />} />
            <Route path="library" element={<AdminLibrary />}>
              <Route path="scales" element={<AdminLibraryScales />} />
              <Route path="courses" element={<AdminLibraryCourses />} />
              <Route path="schemes" element={<AdminLibrarySchemes />} />
              <Route path="templates" element={<AdminLibraryTemplates />} />
              <Route path="goals" element={<AdminLibraryGoals />} />
            </Route>
            <Route path="users" element={<UserManagement />} />
            <Route path="settings" element={<SystemConfig />} />
          </Route>
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
          <Route index element={<RoleBasedHome />} />
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
          {/* Phase 10 — collaboration center (org_admin + counselor) */}
          <Route path="collaboration" element={<OrgCollaboration />} />
          {/* Phase 10 — audit log (org_admin, also embedded in settings later) */}
          <Route path="audit" element={<AuditLogViewer />} />
          {/* Phase 10 — unified org settings */}
          <Route path="settings" element={<OrgSettingsPage />} />
          {/* Legacy redirects — old standalone pages now embedded as tabs */}
          <Route path="settings/members" element={<Navigate to="/settings" replace />} />
          <Route path="settings/branding" element={<Navigate to="/settings" replace />} />
          <Route path="settings/reminders" element={<ReminderSettings />} />
          <Route path="availability" element={<AvailabilitySettings />} />
          {isSystemAdmin && (
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<AdminHome />} />
              <Route path="tenants" element={<TenantList />} />
              <Route path="tenants/new" element={<TenantWizard />} />
              <Route path="tenants/:orgId" element={<TenantDetail />} />
              <Route path="library" element={<AdminLibrary />}>
                <Route path="scales" element={<AdminLibraryScales />} />
                <Route path="courses" element={<AdminLibraryCourses />} />
                <Route path="schemes" element={<AdminLibrarySchemes />} />
                <Route path="templates" element={<AdminLibraryTemplates />} />
                <Route path="goals" element={<AdminLibraryGoals />} />
              </Route>
              <Route path="users" element={<UserManagement />} />
              <Route path="settings" element={<SystemConfig />} />
            </Route>
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
        const orgs = await api.get<{ id: string; name: string; myRole: string; plan?: string; settings?: { orgType?: string } }[]>('/orgs');
        if (cancelled) return;
        if (orgs.length === 0) {
          setError('您尚未加入任何机构');
          return;
        }
        const { planToTier } = await import('@psynote/shared');
        const orgSettings = (orgs[0] as any).settings;
        const orgType = orgSettings?.orgType || DEFAULT_ORG_TYPE;
        console.log('[OrgSelector] orgType:', orgType, 'settings:', orgSettings);
        setOrg(orgs[0].id, orgs[0].myRole as any, planToTier(orgs[0].plan), null, orgType);
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
interface NavItem extends SceneVisibility {
  to: string;
  label: string;
  end?: boolean;
  disabled?: boolean;
}

/**
 * Sidebar nav items, declaratively scene-gated. Visibility is computed by
 * `isVisible(item, scene)` at render time (see AppShell). The "系统管理"
 * entry is added out-of-band inside AppShell for `isSystemAdmin` users —
 * it is intentionally NOT represented via SceneVisibility (sysadmin is a
 * global identity dimension, not a scene dimension).
 *
 * Phase 14f (merged) — "我的设置" visible to all roles; per-tab filtering
 * lives inside OrgSettingsPage via the same SceneVisibility utility.
 */
const allNavItems: NavItem[] = [
  { to: '/', label: '首页', end: true },
  { to: '/knowledge', label: '知识库' },
  { to: '/delivery', label: '交付中心' },
  {
    to: '/collaboration',
    label: '协作中心',
    onlyForRoles: ['org_admin', 'counselor'],
    hideForOrgTypes: ['solo'],
  },
  { to: '/settings', label: '我的设置' },
];

function AppShell() {
  const { user, currentRole, currentOrgId, currentOrgTier, currentOrgType, isSystemAdmin, logout } = useAuthStore();
  const scene: SceneContext = { orgType: currentOrgType, role: currentRole, tier: currentOrgTier };
  const navItems = allNavItems.filter((item) => isVisible(item, scene));

  // NOTE: Legacy defensive useEffects that re-fetched tier/orgType when the
  // store was missing them have been removed. Those were masking the real bug
  // of `setOrg()` callers omitting required fields. The fix is now upstream:
  //   - `setOrg` signature requires all 5 fields (TS-enforced)
  //   - authStore persist migration v1→v2 nulls out currentOrgId when
  //     currentOrgType is missing, forcing the user back through /select-org
  // If you arrive at AppShell with a null currentOrgType, it's a contract
  // violation from upstream state population, not a hydration race.

  // Phase 7b — if the org has branding tier + a logo set, swap the "Psynote"
  // wordmark in the sidebar header for the org's custom logo. Otherwise this
  // hook returns undefined branding and the fallback h1 is rendered.
  const { data: branding } = useOrgBranding();
  const logoUrl = branding?.logoUrl;
  return (
    // Lock outer to viewport height so the sidebar stays fixed and only
    // <main> scrolls. Without this, the whole page would scroll together
    // and `sticky` inside sub-pages would lose its frame of reference.
    <div className="h-screen bg-slate-50 flex overflow-hidden">
      {/* Sidebar — flex-shrink-0 keeps the 224px width; inner overflow-y-auto
          lets very long nav lists scroll independently too. */}
      <aside className="w-56 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 overflow-y-auto">
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
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-700 font-medium truncate">{user?.name}</div>
            <NotificationBadge />
          </div>
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
        <Outlet />
      </main>
    </div>
  );
}

/** Notification bell with unread count */
function NotificationBadge() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const { data } = useQuery({
    queryKey: ['notification-unread-count', orgId],
    queryFn: () => api.get<{ count: number }>(`/orgs/${orgId}/notifications/unread-count`),
    enabled: !!orgId,
    refetchInterval: 30_000,
  });
  const count = data?.count ?? 0;

  return (
    <div className="relative" title={count > 0 ? `${count} 条未读通知` : '无未读通知'}>
      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
          {count > 99 ? '99+' : count}
        </span>
      )}
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
