import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { Search, Upload, Users, X, GraduationCap } from 'lucide-react';

/**
 * Phase 14e — School student management UI.
 *
 * Mirrors HREmployeeList's bulk-import pattern but for students:
 *   - list students (GET /school/students)
 *   - search + filter by grade/class
 *   - bulk import (POST /school/students/import) via textarea CSV
 *
 * The backend endpoint was already present from Phase 10 school onboarding;
 * only the UI was missing until this phase.
 */

interface Student {
  id: string;
  userId: string;
  studentId: string | null;
  grade: string | null;
  className: string | null;
  parentName: string | null;
  parentPhone: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

interface ImportResult {
  summary: { total: number; created: number; existing: number; errors: number };
  results: Array<{ name: string; status: string; error?: string }>;
}

export function SchoolStudentList() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importData, setImportData] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  async function reload() {
    if (!orgId) return;
    try {
      const res = await api.get<{ students: Student[] }>(`/orgs/${orgId}/school/students`);
      setStudents(res.students);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, [orgId]);

  // Derived filter metadata
  const grades = Array.from(new Set(students.map((s) => s.grade).filter(Boolean))) as string[];
  const classes = Array.from(
    new Set(
      students
        .filter((s) => !gradeFilter || s.grade === gradeFilter)
        .map((s) => s.className)
        .filter(Boolean),
    ),
  ) as string[];

  const filtered = students.filter((s) => {
    if (gradeFilter && s.grade !== gradeFilter) return false;
    if (classFilter && s.className !== classFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.userName?.toLowerCase().includes(q) ||
      s.studentId?.toLowerCase().includes(q) ||
      s.parentName?.toLowerCase().includes(q) ||
      s.parentPhone?.includes(q)
    );
  });

  async function handleImport() {
    if (!orgId || !importData.trim()) return;
    setImporting(true);
    setImportResult(null);

    try {
      // CSV: name, studentId(可选), grade(可选), className(可选), parentName(可选), parentPhone(可选), parentEmail(可选)
      const lines = importData.trim().split('\n').filter((l) => l.trim());
      const students = lines.map((line) => {
        const parts = line.split(',').map((p) => p.trim());
        return {
          name: parts[0] || '',
          studentId: parts[1] || undefined,
          grade: parts[2] || undefined,
          className: parts[3] || undefined,
          parentName: parts[4] || undefined,
          parentPhone: parts[5] || undefined,
          parentEmail: parts[6] || undefined,
        };
      });

      const result = await api.post<ImportResult>(
        `/orgs/${orgId}/school/students/import`,
        { students },
      );
      setImportResult(result);
      await reload();
    } catch (err: any) {
      setImportResult({
        summary: { total: 0, created: 0, existing: 0, errors: 1 },
        results: [{ name: '', status: 'error', error: err.message }],
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-slate-500">管理全校学生名单</p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 text-white text-sm rounded-lg hover:bg-teal-600 transition"
        >
          <Upload className="w-4 h-4" />
          批量导入
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索姓名、学号、家长..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-200"
          />
        </div>
        <select
          value={gradeFilter}
          onChange={(e) => { setGradeFilter(e.target.value); setClassFilter(''); }}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-200"
        >
          <option value="">全部年级</option>
          {grades.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          disabled={!gradeFilter}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-200 disabled:opacity-50"
        >
          <option value="">全部班级</option>
          {classes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <GraduationCap className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">暂无学生数据</p>
            <p className="text-slate-400 text-xs mt-1">点击「批量导入」添加学生</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                <th className="px-5 py-3">姓名</th>
                <th className="px-4 py-3">学号</th>
                <th className="px-4 py-3">年级</th>
                <th className="px-4 py-3">班级</th>
                <th className="px-4 py-3">家长</th>
                <th className="px-4 py-3">家长手机</th>
                <th className="px-4 py-3">注册时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition">
                  <td className="px-5 py-3 text-sm font-medium text-slate-900">{s.userName || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 font-mono">{s.studentId || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{s.grade || '未分配'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{s.className || '未分配'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{s.parentName || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 font-mono">{s.parentPhone || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {new Date(s.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-3 text-xs text-slate-400">
        共 {filtered.length} 名学生
        {(gradeFilter || classFilter || search) && students.length !== filtered.length && (
          <span className="ml-1">（全校共 {students.length} 名）</span>
        )}
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">批量导入学生</h2>
              <button onClick={() => { setShowImport(false); setImportResult(null); }}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            </div>

            <p className="text-sm text-slate-500 mb-3 leading-relaxed">
              每行一条记录，格式（英文逗号分隔，后面字段可选）：<br />
              <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded block mt-1">
                姓名, 学号, 年级, 班级, 家长姓名, 家长手机, 家长邮箱
              </code>
            </p>

            <textarea
              rows={10}
              placeholder={`张三, 20240301, 高一, 3班, 张父, 13800138000,
李四, 20240302, 高一, 3班, 李母, 13800138001,`}
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-teal-200"
            />

            <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
              提示：家长手机是后续「家长自助绑定」的核身字段，填写后家长扫码时才能验证通过。最多一次导入 500 人。
            </p>

            {importResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${
                importResult.summary.errors > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                <div className="font-medium">
                  导入完成：{importResult.summary.created} 新建 / {importResult.summary.existing} 已存在
                  {importResult.summary.errors > 0 && ` / ${importResult.summary.errors} 失败`}
                </div>
                {importResult.summary.errors > 0 && (
                  <ul className="mt-2 text-xs space-y-1">
                    {importResult.results.filter((r) => r.status === 'error').slice(0, 5).map((r, i) => (
                      <li key={i}>• {r.name || '(无姓名)'}: {r.error}</li>
                    ))}
                  </ul>
                )}
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
                className="px-4 py-2 text-sm bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition disabled:opacity-50"
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
