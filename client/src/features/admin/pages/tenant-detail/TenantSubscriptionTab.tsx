import { Ban, CreditCard, Edit2, RefreshCw } from 'lucide-react';
import { TIER_LABELS, type OrgTier } from '@psynote/shared';
import { InfoRow } from './TenantDetailPrimitives';
import { LICENSE_STATUS_LABELS, type TenantDetailData } from './types';

/**
 * Subscription tab — current license card + action buttons.
 *
 * Buttons switch based on license.status:
 *   - none / expired → 签发许可证
 *   - anything else  → 修改 / 续期 12 个月 / 撤销许可证
 */
export function TenantSubscriptionTab({
  tenant,
  onIssue,
  onModify,
  onRenew,
  onRevoke,
}: {
  tenant: TenantDetailData;
  onIssue: () => void;
  onModify: () => void;
  onRenew: () => void;
  onRevoke: () => void;
}) {
  const ls = LICENSE_STATUS_LABELS[tenant.license.status];
  const tierLabel = tenant.license.tier ? TIER_LABELS[tenant.license.tier as OrgTier] : '-';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">当前订阅</h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow label="许可状态" value={ls.label} />
          <InfoRow label="套餐等级" value={tierLabel} />
          <InfoRow label="席位上限" value={tenant.license.maxSeats ? String(tenant.license.maxSeats) : '-'} />
          <InfoRow label="已用席位" value={String(tenant.members.length)} />
          <InfoRow
            label="签发时间"
            value={tenant.license.issuedAt ? new Date(tenant.license.issuedAt).toLocaleDateString('zh-CN') : '-'}
          />
          <InfoRow
            label="到期时间"
            value={tenant.license.expiresAt ? new Date(tenant.license.expiresAt).toLocaleDateString('zh-CN') : '-'}
          />
        </div>
      </div>
      <div className="flex gap-3">
        {tenant.license.status === 'none' || tenant.license.status === 'expired' ? (
          <button
            onClick={onIssue}
            className="flex items-center gap-1.5 text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
          >
            <CreditCard className="w-4 h-4" />
            签发许可证
          </button>
        ) : (
          <>
            <button
              onClick={onModify}
              className="flex items-center gap-1.5 text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
            >
              <Edit2 className="w-4 h-4" />
              修改
            </button>
            <button
              onClick={onRenew}
              className="flex items-center gap-1.5 text-sm bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600"
            >
              <RefreshCw className="w-4 h-4" />
              续期 12 个月
            </button>
            <button
              onClick={onRevoke}
              className="flex items-center gap-1.5 text-sm bg-red-50 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100"
            >
              <Ban className="w-4 h-4" />
              撤销许可证
            </button>
          </>
        )}
      </div>
    </div>
  );
}
