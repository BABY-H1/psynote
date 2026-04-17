import React from 'react';
import { Users, Trash2, Loader2, Info } from 'lucide-react';
import { useMyChildren, useRevokeRelationship } from '../api/useFamily';
import { useViewingContext } from '../stores/viewingContext';
import { PARENT_RELATION_LABELS } from '@psynote/shared';

/**
 * Phase 14 — "我的孩子" management page in the portal.
 *
 * Reached via AccountTab → 我的孩子. Lists all active client_relationships
 * the calling user holds, with a Revoke action.
 *
 * After revoking, if the revoked child is the currently-viewed identity,
 * the viewing context resets back to "我自己".
 */
export function MyChildrenPage() {
  const { data: children, isLoading } = useMyChildren();
  const revokeMutation = useRevokeRelationship();
  const { viewingAs, setViewingAs } = useViewingContext();

  if (isLoading) {
    return (
      <div className="py-10 flex justify-center">
        <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
      </div>
    );
  }

  const list = children ?? [];

  async function handleRevoke(relId: string, childUserId: string) {
    if (!confirm('确定解除与此孩子的绑定？解除后将无法再查看其相关信息。')) return;
    try {
      await revokeMutation.mutateAsync(relId);
      if (viewingAs === childUserId) {
        setViewingAs(null);
      }
    } catch (err: any) {
      alert(err?.message || '操作失败，请重试');
    }
  }

  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 flex gap-2 text-xs text-blue-700">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          您可以通过<strong>身份切换器</strong>（页面顶部）查看任一已绑定孩子的预约和待签同意书。
          <br />
          每次扫描班级邀请码可绑定新的孩子。
        </div>
      </div>

      {list.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <div className="text-sm text-slate-500">暂未绑定任何孩子</div>
          <div className="text-xs text-slate-400 mt-1">请联系老师获取班级邀请码</div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
          {list.map((child) => (
            <div key={child.relationshipId} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-sm font-bold">
                {child.childName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {child.childName}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  您与孩子的关系：{PARENT_RELATION_LABELS[child.relation]}
                  {viewingAs === child.childUserId && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-brand-100 text-brand-700">
                      正在查看
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRevoke(child.relationshipId, child.childUserId)}
                disabled={revokeMutation.isPending}
                className="text-slate-400 hover:text-rose-500 transition p-2"
                aria-label="解除绑定"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
