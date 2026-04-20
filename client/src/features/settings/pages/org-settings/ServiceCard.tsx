import { Trash2 } from 'lucide-react';

export interface PublicService {
  id: string;
  title: string;
  description: string;
  sessionFormat: 'individual' | 'family' | 'couple';
  targetAudience?: string;
  availableCounselorIds: string[];
  intakeMode: 'booking' | 'application';
  isActive: boolean;
}

export const FORMAT_LABELS: Record<string, string> = {
  individual: '个案咨询',
  family: '家庭治疗',
  couple: '伴侣咨询',
};

export const MODE_LABELS: Record<string, string> = {
  booking: '预约制（来访者直接选时段）',
  application: '申请制（管理员审核分配）',
};

/**
 * One PublicService editor card. Pulled out of PublicServicesTab so the
 * container stays under the 200-line target and each card's lifecycle
 * (input onChange + onBlur flush) is colocated.
 */
export function ServiceCard({
  svc,
  counselors,
  onUpdate,
  onRemove,
  onFlush,
}: {
  svc: PublicService;
  counselors: Array<{ userId: string; name: string }>;
  onUpdate: (patch: Partial<PublicService>) => void;
  onRemove: () => void;
  onFlush: () => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={svc.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            onBlur={onFlush}
            className="text-sm font-semibold text-slate-800 border-none bg-transparent p-0 focus:ring-0 focus:outline-none"
            placeholder="服务名称"
          />
          <span className={`text-xs px-2 py-0.5 rounded-full ${svc.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {svc.isActive ? '已发布' : '草稿'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onUpdate({ isActive: !svc.isActive })} className="text-xs text-blue-600 hover:underline">
            {svc.isActive ? '停用' : '发布'}
          </button>
          <button type="button" onClick={onRemove} className="p-1 text-slate-400 hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">服务描述</label>
          <textarea
            value={svc.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            onBlur={onFlush}
            rows={2}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1"
            placeholder="服务描述…"
          />
        </div>
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">服务形式</label>
            <select
              value={svc.sessionFormat}
              onChange={(e) => onUpdate({ sessionFormat: e.target.value as any })}
              className="w-full text-xs border border-slate-200 rounded px-2 py-1"
            >
              {Object.entries(FORMAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">入口模式</label>
            <select
              value={svc.intakeMode}
              onChange={(e) => onUpdate({ intakeMode: e.target.value as any })}
              className="w-full text-xs border border-slate-200 rounded px-2 py-1"
            >
              {Object.entries(MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">目标受众</label>
        <input
          type="text"
          value={svc.targetAudience ?? ''}
          onChange={(e) => onUpdate({ targetAudience: e.target.value })}
          onBlur={onFlush}
          className="w-full text-xs border border-slate-200 rounded px-2 py-1"
          placeholder="如：12-18岁青少年"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">
          可接诊咨询师（{svc.availableCounselorIds.length}人）
        </label>
        <div className="flex flex-wrap gap-1">
          {counselors.map((c) => {
            const selected = svc.availableCounselorIds.includes(c.userId);
            return (
              <button
                key={c.userId}
                type="button"
                onClick={() => {
                  const ids = selected
                    ? svc.availableCounselorIds.filter((id) => id !== c.userId)
                    : [...svc.availableCounselorIds, c.userId];
                  onUpdate({ availableCounselorIds: ids });
                }}
                className={`text-xs px-2 py-1 rounded-full transition ${
                  selected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
