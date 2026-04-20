import { useState } from 'react';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import type { LibraryResource } from '../api/libraryScope';
import { useIsSystemLibraryScope } from '../api/libraryScope';
import {
  DistributionBadge,
  DistributionEditor,
} from '../../features/admin/components/DistributionEditor';
import { VisibilityBadge, VisibilityEditor } from './VisibilityEditor';

interface DistributionControlItem {
  id: string;
  /** Set by system admin — which tenants can see this platform-level content. */
  allowedOrgIds?: string[] | null;
  /** Org-level visibility — 3-state on goals/schemes/templates/agreements. */
  visibility?: string;
  /** Legacy 2-state on scales/courses. */
  isPublic?: boolean;
}

interface Props {
  resource: LibraryResource;
  item: DistributionControlItem;
  /** Called after a successful save so the parent list can refetch. */
  onSaved?: () => void | Promise<void>;
}

/**
 * Unified "分发范围" affordance for a single knowledge-library row.
 *
 * Role-aware: a system admin sees the cross-tenant distribution editor
 * (writes `allowed_org_ids`), an org admin sees the org-internal visibility
 * editor (writes `visibility` or `isPublic`), other roles render null.
 *
 * The two editors are intentionally distinct components because they answer
 * different questions — "which tenants?" vs. "who inside my org?" — and
 * their data shapes would just collide if merged.
 */
export function DistributionControl({ resource, item, onSaved }: Props) {
  const isSystemScope = useIsSystemLibraryScope();
  const role = useAuthStore((s) => s.currentRole);
  const [editing, setEditing] = useState(false);

  // Only system admin and org admin get distribution controls. Counselors
  // inherit whatever visibility the creating admin picked; clients are
  // out of scope entirely.
  const canManage = isSystemScope || role === 'org_admin';
  if (!canManage) return null;

  if (isSystemScope) {
    return (
      <>
        <DistributionBadge
          allowedOrgIds={item.allowedOrgIds ?? null}
          onClick={() => setEditing(true)}
        />
        {editing && (
          <DistributionEditor
            allowedOrgIds={item.allowedOrgIds ?? []}
            onSave={async (orgIds) => {
              await api.patch(`/admin/library/${resource}/${item.id}/distribution`, {
                allowedOrgIds: orgIds,
              });
              await onSaved?.();
            }}
            onClose={() => setEditing(false)}
          />
        )}
      </>
    );
  }

  // Org admin path
  return (
    <>
      <VisibilityBadge item={item} resource={resource} onClick={() => setEditing(true)} />
      {editing && (
        <VisibilityEditor
          item={item}
          resource={resource}
          onSaved={onSaved}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
