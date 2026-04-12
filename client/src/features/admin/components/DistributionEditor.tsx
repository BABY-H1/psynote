import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { X, Check, Building2 } from 'lucide-react';

interface OrgOption {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  allowedOrgIds: string[];
  onSave: (orgIds: string[]) => Promise<void>;
  onClose: () => void;
}

export function DistributionEditor({ allowedOrgIds, onSave, onClose }: Props) {
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(allowedOrgIds));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<any[]>('/admin/tenants');
        setOrgs(data.map((o: any) => ({ id: o.id, name: o.name, slug: o.slug })));
      } catch (err) {
        console.error('Failed to load orgs:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggle(orgId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(Array.from(selected));
      onClose();
    } catch {
      // error handled by parent
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

        <div className="px-6 py-4">
          <p className="text-xs text-slate-500 mb-3">选择可以使用此内容的机构。未选中的机构将无法看到此内容。</p>

          {loading ? (
            <div className="text-sm text-slate-400 py-4 text-center">加载机构列表...</div>
          ) : orgs.length === 0 ? (
            <div className="text-sm text-slate-400 py-4 text-center">暂无机构</div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {orgs.map((org) => {
                const isSelected = selected.has(org.id);
                return (
                  <button
                    key={org.id}
                    onClick={() => toggle(org.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition ${
                      isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center text-xs ${
                      isSelected ? 'bg-blue-500 text-white' : 'border border-slate-300'
                    }`}>
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>
                    <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{org.name}</div>
                      <div className="text-xs text-slate-400">{org.slug}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400">已选 {selected.size} 个机构</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm text-slate-500 px-4 py-2">取消</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {saving ? '保存中...' : '确认'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Badge showing distribution status. Click to open editor.
 */
export function DistributionBadge({ allowedOrgIds, onClick }: { allowedOrgIds: string[] | null; onClick: () => void }) {
  const count = allowedOrgIds?.length ?? 0;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`text-xs px-2 py-0.5 rounded-full transition ${
        count > 0
          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
          : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
      }`}
    >
      {count > 0 ? `${count} 个机构` : '未分发'}
    </button>
  );
}
