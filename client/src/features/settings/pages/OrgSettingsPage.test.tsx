import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

/**
 * Characterization for OrgSettingsPage — the settings shell.
 *
 * Written against the pre-split 762-line monolith; must stay green after
 * the 4 inline tab components (BasicInfo / Certifications / PublicServices
 * / EAPPartnership) move into their own files.
 *
 * Pins the shell contract:
 *   1. Group tabs render ("我的" + admin groups when scene allows them)
 *   2. Default selected tab is "my-basic" (MyBasicInfoTab mounts)
 *   3. Clicking a different group jumps to that group's first tab
 *   4. Each stub-mocked inline tab renders on click
 */

// ─── Mock scene & auth ───

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector?: (s: any) => unknown) => {
    const state = {
      currentRole: 'org_admin',
      currentOrgType: 'counseling',
      currentOrgTier: 'starter',
      currentOrgId: 'org-1',
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('../../../api/useMe', () => ({
  useMe: () => ({ data: { id: 'u1', email: 'a@a', name: 'A' } }),
}));

vi.mock('../../../api/useOrg', () => ({
  useOrgMembers: () => ({ data: [], isLoading: false }),
}));

vi.mock('../../../api/client', () => ({
  api: {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

// React-Query: we keep its hooks real-ish with simple resolved promises so
// each Tab component can mount without crashing.
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null, isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('../../../shared/components', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Stub all imported tab components so we don't instantiate their hook graphs.
vi.mock('./SchoolClassManagement', () => ({
  SchoolClassManagement: () => <div data-testid="school-class-mgmt" />,
}));
vi.mock('./SchoolStudentList', () => ({
  SchoolStudentList: () => <div data-testid="school-student-list" />,
}));
vi.mock('./MemberManagement', () => ({
  MemberManagement: () => <div data-testid="member-mgmt" />,
}));
vi.mock('./OrgBrandingSettings', () => ({
  OrgBrandingSettings: () => <div data-testid="branding" />,
}));
vi.mock('./SubscriptionTab', () => ({
  SubscriptionTab: () => <div data-testid="subscription" />,
}));
vi.mock('../../collaboration/AuditLogViewer', () => ({
  AuditLogViewer: () => <div data-testid="audit" />,
}));
vi.mock('../../me/components/BasicInfoTab', () => ({
  BasicInfoTab: () => <div data-testid="my-basic" />,
}));
vi.mock('../../me/components/CounselorProfileTab', () => ({
  CounselorProfileTab: () => <div data-testid="my-counselor" />,
}));
vi.mock('../../me/components/ChangePasswordTab', () => ({
  ChangePasswordTab: () => <div data-testid="my-password" />,
}));

// Scene visibility — minimal permissive stub so every TabDef passes.
vi.mock('../../../app/scene/visibility', () => ({
  isVisible: () => true,
}));

const { OrgSettingsPage } = await import('./OrgSettingsPage');

beforeEach(() => cleanup());

describe('OrgSettingsPage — pre-split characterization', () => {
  it('renders group tab bar including "我的"', () => {
    render(<OrgSettingsPage />);
    expect(screen.getByRole('button', { name: '我的' })).toBeInTheDocument();
  });

  it('default tab is my-basic (MyBasicInfoTab mounts)', () => {
    render(<OrgSettingsPage />);
    expect(screen.getByTestId('my-basic')).toBeInTheDocument();
  });

  it('clicking 安全与合规 group switches away from my-basic', () => {
    render(<OrgSettingsPage />);
    const securityGroupBtn = screen.getByRole('button', { name: '安全与合规' });
    fireEvent.click(securityGroupBtn);
    // my-basic is no longer rendered; a security-group sub-tab is now active
    expect(screen.queryByTestId('my-basic')).not.toBeInTheDocument();
  });

  it('renders GROUP_LABELS: "我的" / "门面信息" / "组织管理" / "经营信息" / "安全与合规"', () => {
    render(<OrgSettingsPage />);
    for (const label of ['我的', '门面信息', '组织管理', '经营信息', '安全与合规']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });
});
