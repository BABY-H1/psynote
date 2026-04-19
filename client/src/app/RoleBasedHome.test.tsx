import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * RoleBasedHome routes to 5 different dashboard components based on
 * (orgType, role). We mock each dashboard into a tagged stub and an
 * authStore whose selector we can drive per-test, then just render &
 * assert which stub mounted.
 */

let currentRole: string | null = null;
let currentOrgType: string | null = null;

vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (s: { currentRole: string | null; currentOrgType: string | null }) => unknown) =>
    selector({ currentRole, currentOrgType }),
}));

vi.mock('../features/dashboard/pages/DashboardHome', () => ({
  DashboardHome: () => <div data-testid="dashboard-home" />,
}));
vi.mock('../features/dashboard/pages/OrgAdminDashboard', () => ({
  OrgAdminDashboard: () => <div data-testid="org-admin-dashboard" />,
}));
vi.mock('../features/dashboard/pages/SchoolDashboard', () => ({
  SchoolDashboard: () => <div data-testid="school-dashboard" />,
}));
vi.mock('../features/dashboard/pages/EnterpriseDashboard', () => ({
  EnterpriseDashboard: () => <div data-testid="enterprise-dashboard" />,
}));

const { RoleBasedHome } = await import('./RoleBasedHome.js');

describe('RoleBasedHome', () => {
  beforeEach(() => {
    cleanup();
    currentRole = null;
    currentOrgType = null;
  });

  it("orgType='solo' → DashboardHome (regardless of role)", () => {
    currentOrgType = 'solo';
    currentRole = 'org_admin'; // even as org_admin, solo wins
    render(<RoleBasedHome />);
    expect(screen.getByTestId('dashboard-home')).toBeInTheDocument();
  });

  it("orgType='school' + role='org_admin' → SchoolDashboard", () => {
    currentOrgType = 'school';
    currentRole = 'org_admin';
    render(<RoleBasedHome />);
    expect(screen.getByTestId('school-dashboard')).toBeInTheDocument();
  });

  it("orgType='enterprise' + role='org_admin' → EnterpriseDashboard", () => {
    currentOrgType = 'enterprise';
    currentRole = 'org_admin';
    render(<RoleBasedHome />);
    expect(screen.getByTestId('enterprise-dashboard')).toBeInTheDocument();
  });

  it("orgType='counseling' + role='org_admin' → OrgAdminDashboard (generic)", () => {
    currentOrgType = 'counseling';
    currentRole = 'org_admin';
    render(<RoleBasedHome />);
    expect(screen.getByTestId('org-admin-dashboard')).toBeInTheDocument();
  });

  it("orgType='hospital' + role='org_admin' → OrgAdminDashboard (generic fallthrough)", () => {
    currentOrgType = 'hospital';
    currentRole = 'org_admin';
    render(<RoleBasedHome />);
    expect(screen.getByTestId('org-admin-dashboard')).toBeInTheDocument();
  });

  it("orgType='enterprise' + role='counselor' → DashboardHome (non-admin fallthrough)", () => {
    currentOrgType = 'enterprise';
    currentRole = 'counselor';
    render(<RoleBasedHome />);
    expect(screen.getByTestId('dashboard-home')).toBeInTheDocument();
  });

  it("orgType='school' + role='counselor' → DashboardHome", () => {
    currentOrgType = 'school';
    currentRole = 'counselor';
    render(<RoleBasedHome />);
    expect(screen.getByTestId('dashboard-home')).toBeInTheDocument();
  });

  it('missing orgType (loading state) → DashboardHome', () => {
    currentOrgType = null;
    currentRole = null;
    render(<RoleBasedHome />);
    expect(screen.getByTestId('dashboard-home')).toBeInTheDocument();
  });
});
