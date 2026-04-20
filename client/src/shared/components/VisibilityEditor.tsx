import { useState } from 'react';
import { X, User, Building2, Globe, Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import type { LibraryResource } from '../api/libraryScope';
import { libraryApi } from '../api/libraryScope';

/** Field types that carry an item's in-org visibility. */
type VisibilityField = 'visibility' | 'isPublic';

/**
 * Which column each library resource uses for visibility. Historical: scales
 * and courses shipped with a binary `isPublic` flag; later resources
 * standardized on `visibility` (3-state personal/organization/public).
 * We read/write whichever column the resource has and translate to a unified
 * 3-option UI — for `isPublic` resources the middle option is collapsed
 * (personal = false, organization = true, no "public" choice).
 */
export const RESOURCE_VISIBILITY_FIELD: Record<LibraryResource, VisibilityField> = {
  scales: 'isPublic',
  courses: 'isPublic',
  goals: 'visibility',
  schemes: 'visibility',
  templates: 'visibility',
  agreements: 'visibility',
};

type VisibilityValue = 'personal' | 'organization' | 'public';

function readVisibility(item: { visibility?: string; isPublic?: boolean }, field: VisibilityField): VisibilityValue {
  if (field === 'isPublic') return item.isPublic ? 'organization' : 'personal';
  return (item.visibility as VisibilityValue) ?? 'personal';
}

function serializeVisibility(next: VisibilityValue, field: VisibilityField): Record<string, unknown> {
  if (field === 'isPublic') return { isPublic: next !== 'personal' };
  return { visibility: next };
}

const LABELS: Record<VisibilityValue, { title: string; hint: string; icon: React.ComponentType<{ className?: string }> }> = {
  personal: {
    title: '仅自己使用',
    hint: '只有创建者能看到；其他成员不可见',
    icon: User,
  },
  organization: {
    title: '机构内共享',
    hint: '本机构所有成员都能使用',
    icon: Building2,
  },
  public: {
    title: '公开',
    hint: '标记为平台公开内容（视当前分发配置为准）',
    icon: Globe,
  },
};

interface VisibilityBadgeProps {
  item: { visibility?: string; isPublic?: boolean };
  resource: LibraryResource;
  onClick: () => void;
}

export function VisibilityBadge({ item, resource, onClick }: VisibilityBadgeProps) {
  const field = RESOURCE_VISIBILITY_FIELD[resource];
  const value = readVisibility(item, field);
  const colorMap: Record<VisibilityValue, string> = {
    personal: 'bg-slate-100 text-slate-500 hover:bg-slate-200',
    organization: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
    public: 'bg-green-100 text-green-700 hover:bg-green-200',
  };
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`text-xs px-2 py-0.5 rounded-full transition ${colorMap[value]}`}
      title="分发范围"
    >
      {LABELS[value].title}
    </button>
  );
}

interface VisibilityEditorProps {
  item: { id: string; visibility?: string; isPublic?: boolean };
  resource: LibraryResource;
  onSaved?: () => void | Promise<void>;
  onClose: () => void;
}

/**
 * Org-admin-facing visibility picker. Writes to the resource's underlying
 * `visibility` or `isPublic` column via `PATCH libraryApi(resource)/:id`.
 *
 * NOTE: distinct from the system-admin's `DistributionEditor` in
 * `features/admin/components/`, which manages cross-tenant `allowedOrgIds`.
 * The two coexist because they answer different questions —
 * "who inside my org?" vs. "which tenants?". `DistributionControl` picks the
 * right one based on current role.
 */
export function VisibilityEditor({ item, resource, onSaved, onClose }: VisibilityEditorProps) {
  const field = RESOURCE_VISIBILITY_FIELD[resource];
  const [value, setValue] = useState<VisibilityValue>(readVisibility(item, field));
  const [saving, setSaving] = useState(false);

  // Org admins can only toggle between "personal" and "organization" —
  // the "public" state crosses tenant boundaries and is reserved for the
  // system admin's `allowed_org_ids` distribution flow. Existing rows
  // already set to 'public' still render their badge correctly via
  // VisibilityBadge below, but org admins can't re-select it here.
  const options: VisibilityValue[] = ['personal', 'organization'];

  async function handleSave() {
    setSaving(true);
    try {
      await api.patch(`${libraryApi(resource)}/${item.id}`, serializeVisibility(value, field));
      await onSaved?.();
      onClose();
    } catch (err) {
      // Error surfaces via react-query if the caller wires up toast; we just release the button.
      console.error('Failed to update visibility:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">分发范围</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-2">
          {options.map((opt) => {
            const { title, hint, icon: Icon } = LABELS[opt];
            const selected = value === opt;
            return (
              <button
                key={opt}
                onClick={() => setValue(opt)}
                className={`w-full flex items-start gap-3 px-4 py-3 rounded-lg text-left transition border ${
                  selected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  selected ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900">{title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{hint}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-slate-500 px-4 py-2">取消</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 inline-flex items-center gap-1"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? '保存中...' : '确认'}
          </button>
        </div>
      </div>
    </div>
  );
}
