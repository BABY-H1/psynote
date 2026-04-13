import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { Plus, Trash2, Save, QrCode, Link2 } from 'lucide-react';

interface Department {
  id: string;
  name: string;
  headCount?: number;
}

interface CrisisContact {
  userId: string;
  name: string;
  phone?: string;
}

export function HRSettings() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [crisisContacts, setCrisisContacts] = useState<CrisisContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // New department form
  const [newDeptName, setNewDeptName] = useState('');

  useEffect(() => {
    if (!orgId) return;
    api.get<{ departments: Department[]; crisisContacts: CrisisContact[] }>(
      `/orgs/${orgId}/eap/employees/departments`,
    )
      .then((res) => {
        setDepartments(res.departments || []);
        setCrisisContacts(res.crisisContacts || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  function addDepartment() {
    if (!newDeptName.trim()) return;
    setDepartments((prev) => [
      ...prev,
      { id: `dept-${Date.now()}`, name: newDeptName.trim() },
    ]);
    setNewDeptName('');
  }

  function removeDepartment(id: string) {
    setDepartments((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleSave() {
    if (!orgId) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.put(`/orgs/${orgId}/eap/employees/departments`, {
        departments,
        crisisContacts,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Error handling
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-slate-400 text-sm py-12 text-center">加载中...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900 mb-1">企业设置</h1>
        <p className="text-sm text-slate-500">管理部门结构、危机联络人和员工入口</p>
      </div>

      {/* Department Management */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">部门管理</h2>
        <p className="text-xs text-slate-500 mb-4">部门用于测评报告的分组统计和团体报告生成</p>

        <div className="space-y-2 mb-4">
          {departments.map((dept) => (
            <div key={dept.id} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg">
              <span className="text-sm text-slate-700 flex-1">{dept.name}</span>
              <button
                onClick={() => removeDepartment(dept.id)}
                className="text-slate-400 hover:text-red-500 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="输入部门名称"
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDepartment()}
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
          <button
            onClick={addDepartment}
            disabled={!newDeptName.trim()}
            className="flex items-center gap-1 px-3 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            添加
          </button>
        </div>
      </div>

      {/* Crisis Contacts */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-2">危机联络人</h2>
        <p className="text-xs text-slate-500 mb-4">
          当咨询师标记四级（危机）预警时，系统将显名通知以下联络人
        </p>

        <div className="space-y-3 mb-4">
          {crisisContacts.map((contact, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 bg-red-50 rounded-lg">
              <span className="text-sm text-slate-700 flex-1">{contact.name}</span>
              <span className="text-xs text-slate-500">{contact.phone || '—'}</span>
              <button
                onClick={() => setCrisisContacts((prev) => prev.filter((_, j) => j !== i))}
                className="text-slate-400 hover:text-red-500 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {crisisContacts.length === 0 && (
            <p className="text-xs text-slate-400">暂未设置危机联络人</p>
          )}
        </div>

        <button
          onClick={() =>
            setCrisisContacts((prev) => [...prev, { userId: '', name: '', phone: '' }])
          }
          className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700"
        >
          <Plus className="w-4 h-4" />
          添加联络人
        </button>
      </div>

      {/* Employee Entry */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-2">员工入口</h2>
        <p className="text-xs text-slate-500 mb-4">员工通过以下方式自助注册并使用 EAP 服务</p>

        <div className="grid grid-cols-2 gap-4">
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Link2 className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium text-slate-700">注册链接</span>
            </div>
            <code className="text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded block truncate">
              {window.location.origin}/eap/register/{useAuthStore.getState().currentOrgId ? 'org-slug' : '...'}
            </code>
          </div>
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <QrCode className="w-4 h-4 text-green-500" />
              <span className="text-sm font-medium text-slate-700">二维码</span>
            </div>
            <p className="text-xs text-slate-400">基于注册链接自动生成二维码（后续支持）</p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-6 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 transition disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? '保存中...' : saved ? '已保存' : '保存设置'}
        </button>
      </div>
    </div>
  );
}
