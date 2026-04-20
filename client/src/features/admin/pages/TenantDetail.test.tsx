import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

/**
 * Characterization for TenantDetail — sysadmin-facing tenant inspector.
 *
 * Written against the pre-split 687-line monolith; must stay green
 * after the 4 tab panels + modals + helpers split out.
 *
 * Pins:
 *   1. 4 tab buttons render: 概览 / 成员 / 订阅 / 服务配置
 *   2. Default tab is 概览 (InfoRow rows appear)
 *   3. Clicking 成员 switches to members table
 *   4. License status chip renders
 *   5. 返回租户列表 back button present
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

describe('TenantDetail — pre-split characterization', () => {
  it('renders 4 tab buttons (概览 / 成员 / 订阅 / 服务配置) after load', async () => {
    render(<TenantDetail />);
    await waitFor(() => expect(screen.getByRole('button', { name: /概览/ })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /成员/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /订阅/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /服务配置/ })).toBeInTheDocument();
  });

  it('default tab shows 基本信息 + 运营概况 info rows', async () => {
    render(<TenantDetail />);
    await waitFor(() => expect(screen.getByText('基本信息')).toBeInTheDocument());
    expect(screen.getByText('运营概况')).toBeInTheDocument();
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
});
