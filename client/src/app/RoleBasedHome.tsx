import { useAuthStore } from '../stores/authStore';
import { DashboardHome } from '../features/dashboard/pages/DashboardHome';
import { OrgAdminDashboard } from '../features/dashboard/pages/OrgAdminDashboard';
import { SchoolDashboard } from '../features/dashboard/pages/SchoolDashboard';
import { EnterpriseDashboard } from '../features/dashboard/pages/EnterpriseDashboard';

/**
 * Render different home pages based on org role and orgType.
 *
 * Routing priority:
 *   1. orgType === 'solo'                              → DashboardHome (regardless of role)
 *   2. orgType === 'school'     + role === 'org_admin' → SchoolDashboard
 *   3. orgType === 'enterprise' + role === 'org_admin' → EnterpriseDashboard
 *   4. role === 'org_admin' (other orgTypes)           → OrgAdminDashboard
 *   5. default                                         → DashboardHome
 */
export function RoleBasedHome() {
  const role = useAuthStore((s) => s.currentRole);
  const orgType = useAuthStore((s) => s.currentOrgType);
  // Solo: always personal workstation, no org metrics
  if (orgType === 'solo') return <DashboardHome />;
  // School: school-specific dashboard
  if (orgType === 'school' && role === 'org_admin') return <SchoolDashboard />;
  // Enterprise: EAP-specific dashboard (risk分布 / 部门矩阵 / 服务趋势 / HR 待办)
  if (orgType === 'enterprise' && role === 'org_admin') return <EnterpriseDashboard />;
  if (role === 'org_admin') return <OrgAdminDashboard />;
  return <DashboardHome />;
}
