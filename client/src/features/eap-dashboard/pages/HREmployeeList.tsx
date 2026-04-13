import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { Search, Upload, Users, X } from 'lucide-react';

interface Employee {
  id: string;
  userId: string;
  employeeId: string | null;
  department: string | null;
  entryMethod: string;
  isAnonymous: boolean;
  registeredAt: string;
  userName: string | null;
  userEmail: string | null;
}

interface ImportResult {
  summary: { total: number; created: number; existing: number; errors: number };
  results: Array<{ email: string; status: string; error?: string }>;
}

export function HREmployeeList() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importData, setImportData] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!orgId) return;
    api.get<{ employees: Employee[] }>(`/orgs/${orgId}/eap/employees`)
      .then((res) => setEmployees(res.employees))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  const filtered = employees.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.userName?.toLowerCase().includes(q) ||
      e.userEmail?.toLowerCase().includes(q) ||
      e.employeeId?.toLowerCase().includes(q) ||
      e.department?.toLowerCase().includes(q)
    );
  });

  async function handleImport() {
    if (!orgId || !importData.trim()) return;
    setImporting(true);
    setImportResult(null);

    try {
      // Parse CSV: name, email, employeeId, department
      const lines = importData.trim().split('\n').filter((l) => l.trim());
      const employees = lines.map((line) => {
        const parts = line.split(',').map((p) => p.trim());
        return {
          name: parts[0] || '',
          email: parts[1] || '',
          employeeId: parts[2] || undefined,
          department: parts[3] || undefined,
        };
      });

      const result = await api.post<ImportResult>(`/orgs/${orgId}/eap/employees/import`, { employees });
      setImportResult(result);

      // Reload employee list
      const res = await api.get<{ employees: Employee[] }>(`/orgs/${orgId}/eap/employees`);
      setEmployees(res.employees);
    } catch (err: any) {
      setImportResult({
        summary: { total: 0, created: 0, existing: 0, errors: 1 },
        results: [{ email: '', status: 'error', error: err.message }],
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">员工管理</h1>
          <p className="text-sm text-slate-500">管理 EAP 服务覆盖的员工</p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 transition"
        >
          <Upload className="w-4 h-4" />
          批量导入
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="搜索姓名、邮箱、工号..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-200"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">暂无员工数据</p>
            <p className="text-slate-400 text-xs mt-1">点击「批量导入」添加员工</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                <th className="px-5 py-3">姓名</th>
                <th className="px-4 py-3">邮箱</th>
                <th className="px-4 py-3">工号</th>
                <th className="px-4 py-3">部门</th>
                <th className="px-4 py-3">注册方式</th>
                <th className="px-4 py-3">注册时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50 transition">
                  <td className="px-5 py-3 text-sm font-medium text-slate-900">
                    {emp.userName || '—'}
                    {emp.isAnonymous && (
                      <span className="ml-1 text-xs text-purple-500">(匿名)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{emp.userEmail || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 font-mono">{emp.employeeId || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{emp.department || '未分配'}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {({ link: '链接', qr_code: '二维码', sso: 'SSO', hr_import: '导入' } as Record<string, string>)[emp.entryMethod] || emp.entryMethod}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {new Date(emp.registeredAt).toLocaleDateString('zh-CN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">批量导入员工</h2>
              <button onClick={() => { setShowImport(false); setImportResult(null); }}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            </div>

            <p className="text-sm text-slate-500 mb-3">
              每行一条记录，格式：<code className="text-xs bg-slate-100 px-1 py-0.5 rounded">姓名, 邮箱, 工号(可选), 部门(可选)</code>
            </p>

            <textarea
              rows={8}
              placeholder={`张三, zhangsan@company.com, EMP001, 研发部\n李四, lisi@company.com, EMP002, 市场部`}
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-amber-200"
            />

            {importResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${
                importResult.summary.errors > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
              }`}>
                导入完成：{importResult.summary.created} 新建，{importResult.summary.existing} 已存在
                {importResult.summary.errors > 0 && `，${importResult.summary.errors} 失败`}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setShowImport(false); setImportResult(null); }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                关闭
              </button>
              <button
                onClick={handleImport}
                disabled={importing || !importData.trim()}
                className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition disabled:opacity-50"
              >
                {importing ? '导入中...' : '开始导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
