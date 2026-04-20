import { TIER_LABELS, type OrgTier, getOrgTypeDisplay } from '@psynote/shared';
import { InfoRow } from './TenantDetailPrimitives';
import { LICENSE_STATUS_LABELS, type TenantDetailData } from './types';

/**
 * Overview tab — two side-by-side info cards: 基本信息 + 运营概况.
 * Pure presentation; reads the tenant object the parent already loaded.
 */
export function TenantOverviewTab({ tenant }: { tenant: TenantDetailData }) {
  const orgType = (tenant.settings as { orgType?: string } | null)?.orgType || 'counseling';
  const typeDisplay = getOrgTypeDisplay(orgType);
  const ls = LICENSE_STATUS_LABELS[tenant.license.status];

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">基本信息</h3>
        <InfoRow label={typeDisplay.nameLabel} value={tenant.name} />
        <InfoRow label={typeDisplay.slugLabel} value={tenant.slug} mono />
        <InfoRow label="组织类型" value={typeDisplay.label} />
        <InfoRow label="创建时间" value={new Date(tenant.createdAt).toLocaleDateString('zh-CN')} />
        <InfoRow label="最后更新" value={new Date(tenant.updatedAt).toLocaleDateString('zh-CN')} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">运营概况</h3>
        <InfoRow label="成员总数" value={String(tenant.members.length)} />
        <InfoRow
          label="活跃成员"
          value={String(tenant.members.filter((m) => m.status === 'active').length)}
        />
        <InfoRow label="许可状态" value={ls.label} />
        <InfoRow
          label="套餐等级"
          value={tenant.license.tier ? TIER_LABELS[tenant.license.tier as OrgTier] : '-'}
        />
        {tenant.license.expiresAt && (
          <InfoRow
            label="到期时间"
            value={new Date(tenant.license.expiresAt).toLocaleDateString('zh-CN')}
          />
        )}
      </div>
    </div>
  );
}
