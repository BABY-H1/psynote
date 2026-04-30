import { Trash2, UserPlus, Stethoscope } from 'lucide-react';
import { getRoleLabel } from '../../../../shared/constants/roles';
import { ROLE_OPTIONS, type MemberRow } from './types';

/**
 * Members tab — table of (name / email / role select / status / joined /
 * 临床执业身份 toggle / delete). Role change is immediate (no submit
 * button). The "添加成员" button opens a modal handled by the parent.
 *
 * Phase 1.5 严格合规: clinic_admin 默认不读 phi_full(咨询全文)。
 * 单人小诊所"老板兼咨询师"通过本 tab 的"临床执业身份"开关单点开通,
 * 写到 access_profile.dataClasses。
 */
export function TenantMembersTab({
  members,
  onAddMember,
  onChangeRole,
  onSetClinicalPractitioner,
  onRemoveMember,
}: {
  members: MemberRow[];
  onAddMember: () => void;
  onChangeRole: (memberId: string, role: string) => void;
  onSetClinicalPractitioner: (memberId: string, on: boolean) => void;
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
              <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">临床执业身份</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {members.map((m) => {
              const isClinical = (m.accessProfile?.dataClasses ?? []).includes('phi_full');
              // 仅 org_admin 角色 (clinic_admin etc.) 才有意义打开此开关 —
              // counselor/client 已经通过 role 默认策略决定密级,无需 access_profile 补丁
              const canToggle = m.role === 'org_admin';
              return (
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
                  <td className="px-4 py-2.5">
                    {canToggle ? (
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600" title="老板兼咨询师场景:打开后该 admin 可读 phi_full(咨询全文)">
                        <input
                          type="checkbox"
                          checked={isClinical}
                          onChange={(e) => onSetClinicalPractitioner(m.id, e.target.checked)}
                          className="rounded border-slate-300"
                        />
                        <Stethoscope className={`w-3.5 h-3.5 ${isClinical ? 'text-emerald-600' : 'text-slate-300'}`} />
                        <span className={isClinical ? 'text-emerald-700 font-medium' : ''}>
                          {isClinical ? '已开通 phi_full' : '默认仅摘要'}
                        </span>
                      </label>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
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
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
