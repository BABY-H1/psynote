import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

/**
 * Characterization for TenantDetail — sysadmin-facing tenant inspector.
 *
 * As of 2026-04 the tab structure collapsed from 4 (概览 / 成员 / 订阅 /
 * 服务配置) to 2 (基本信息 / 成员). This file pins the merged layout:
 *
 *   1. Two tab buttons render: 基本信息 / 成员
 *   2. Default tab is 基本信息 — surfaces both 基本信息 + 运营概况 cards
 *      (plus subscription + services, now on one page)
 *   3. Clicking 成员 switches to members table
 *   4. License status chip renders ("有效" for active license)
 *   5. 返回租户列表 back button present
 *   6. Single 修改 button switches the tab into edit mode
 */

const apiGet = vi.fn();
const apiPost = vi.fn().mockResolvedValue({});
const apiPatch = vi.fn().mockResolvedValue({});
const apiDelete = vi.fn().mockResolvedValue({});

vi.mock('../../../api/client', () => ({
  api: { get: apiGet, post: apiPost, patch: apiPatch, delete: apiDelete },
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ orgId: 'org-1' }),
  useNavigate: () => vi.fn(),
}));

const fakeTenant = {
  id: 'org-1',
  name: '演示机构',
  slug: 'demo-tenant',
  plan: 'growth',
  settings: { orgType: 'counseling' },
  triageConfig: {},
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-06-01T00:00:00Z',
  members: [
    {
      id: 'm1',
      userId: 'u1',
      role: 'counselor',
      status: 'active',
      createdAt: '2025-01-02T00:00:00Z',
      userName: '咨询师 A',
      userEmail: 'a@demo.cn',
    },
  ],
  license: {
    status: 'active' as const,
    tier: 'growth' as const,
    maxSeats: 10,
    expiresAt: '2026-01-01T00:00:00Z',
    issuedAt: '2025-01-01T00:00:00Z',
  },
};

const { TenantDetail } = await import('./TenantDetail');

beforeEach(() => {
  cleanup();
  apiGet.mockReset();
  apiGet.mockImplementation((url: string) => {
    if (url === `/admin/tenants/org-1`) return Promise.resolve(fakeTenant);
    if (url === `/admin/tenants/org-1/services`) {
      return Promise.resolve({
        aiConfig: { apiKey: '', baseUrl: '', model: '', monthlyTokenLimit: 0 },
        emailConfig: { smtpHost: '', smtpPort: 465, smtpUser: '', smtpPass: '', senderName: '', senderEmail: '' },
      });
    }
    return Promise.resolve({});
  });
});

describe('TenantDetail — post-merge characterization', () => {
  it('renders 2 tab buttons (基本信息 / 成员) after load', async () => {
    render(<TenantDetail />);
    await waitFor(() => expect(screen.getByRole('button', { name: /基本信息/ })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /成员/ })).toBeInTheDocument();
    // The old tab labels are gone.
    expect(screen.queryByRole('button', { name: /^概览$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^订阅$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /服务配置/ })).toBeNull();
  });

  it('default tab surfaces 基本信息 + 运营概况 cards', async () => {
    render(<TenantDetail />);
    // "基本信息" appears on both the tab chip and the card heading, so
    // assert via the heading-only neighbour 运营概况 which is unique.
    await waitFor(() => expect(screen.getByText('运营概况')).toBeInTheDocument());
    expect(screen.getAllByText('基本信息').length).toBeGreaterThan(0);
  });

  it('clicking 成员 tab shows the members table heading', async () => {
    render(<TenantDetail />);
    await waitFor(() => expect(screen.getByRole('button', { name: /成员/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /成员/ }));
    expect(screen.getByText('成员列表')).toBeInTheDocument();
    expect(screen.getByText('咨询师 A')).toBeInTheDocument();
  });

  it('license status chip renders ("有效" for active license)', async () => {
    render(<TenantDetail />);
    await waitFor(() => expect(screen.getAllByText('有效').length).toBeGreaterThan(0));
  });

  it('back-to-tenants button present', async () => {
    render(<TenantDetail />);
    await waitFor(() => expect(screen.getByRole('button', { name: /返回租户列表/ })).toBeInTheDocument());
  });

  it('per-card 修改 button puts only that card into edit mode', async () => {
    render(<TenantDetail />);
    // Each editable card (基本信息 / AI 服务 / 邮件服务) has its own "修改"
    // button. Subscription shows "修改套餐" — intentionally not a bare "修改".
    await waitFor(() => expect(screen.getAllByRole('button', { name: '修改' }).length).toBeGreaterThan(0));
    const editButtons = screen.getAllByRole('button', { name: '修改' });
    expect(editButtons.length).toBeGreaterThanOrEqual(1);

    // Click the first one (基本信息 card). That card's save+cancel appear,
    // but the other cards' 修改 buttons remain visible (independent states).
    const before = editButtons.length;
    fireEvent.click(editButtons[0]);
    expect(screen.getByRole('button', { name: /保存/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
    // One "修改" button consumed by the now-editing card; the remaining
    // cards keep theirs available.
    expect(screen.getAllByRole('button', { name: '修改' }).length).toBe(before - 1);
  });
});
