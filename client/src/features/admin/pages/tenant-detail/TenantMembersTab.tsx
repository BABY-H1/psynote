import { Trash2, UserPlus } from 'lucide-react';
import { getRoleLabel } from '../../../../shared/constants/roles';
import { ROLE_OPTIONS, type MemberRow } from './types';

/**
 * Members tab — table of (name / email / role select / status / joined /
 * delete). Role change is immediate (no submit button). The "添加成员"
 * button opens a modal handled by the parent.
 */
export function TenantMembersTab({
  members,
  onAddMember,
  onChangeRole,
  onRemoveMember,
}: {
  members: MemberRow[];
  onAddMember: () => void;
  onChangeRole: (memberId: string, role: string) => void;
  onRemoveMember: (memberId: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">成员列表</h3>
        <button
          onClick={onAddMember}
          className="flex items-center gap-1 text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600"
        >
          <UserPlus className="w-3.5 h-3.5" />
          添加成员
        </button>
      </div>
      {members.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-slate-400">暂无成员</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500">姓名</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">邮箱</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">角色</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">状态</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">加入时间</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {members.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="px-5 py-2.5 text-sm text-slate-900">{m.userName}</td>
                <td className="px-4 py-2.5 text-sm text-slate-500">{m.userEmail}</td>
                <td className="px-4 py-2.5">
                  <select
                    value={m.role}
                    onChange={(e) => onChangeRole(m.id, e.target.value)}
                    className="text-xs border border-slate-200 rounded px-2 py-1 text-slate-600"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>{getRoleLabel(r)}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs ${m.status === 'active' ? 'text-green-600' : 'text-slate-400'}`}>
                    {m.status === 'active' ? '活跃' : m.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-400">
                  {new Date(m.createdAt).toLocaleDateString('zh-CN')}
                </td>
                <td className="px-2 py-2.5">
                  <button
                    onClick={() => onRemoveMember(m.id)}
                    className="p-1 text-slate-300 hover:text-red-500 transition"
                    title="移除成员"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
