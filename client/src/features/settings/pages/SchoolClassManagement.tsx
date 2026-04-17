import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { Plus, Trash2, GraduationCap, X, QrCode } from 'lucide-react';
import { ParentInviteModal } from './ParentInviteModal';

interface SchoolClass {
  id: string;
  grade: string;
  className: string;
  homeroomTeacherId: string | null;
  studentCount: number;
  teacherName: string | null;
}

export function SchoolClassManagement() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newGrade, setNewGrade] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [inviteForClass, setInviteForClass] = useState<SchoolClass | null>(null);

  useEffect(() => {
    loadClasses();
  }, [orgId]);

  async function loadClasses() {
    if (!orgId) return;
    try {
      const res = await api.get<{ classes: SchoolClass[] }>(`/orgs/${orgId}/school/classes`);
      setClasses(res.classes);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!orgId || !newGrade.trim() || !newClassName.trim()) return;
    try {
      await api.post(`/orgs/${orgId}/school/classes`, {
        grade: newGrade.trim(),
        className: newClassName.trim(),
      });
      setNewGrade('');
      setNewClassName('');
      setShowAdd(false);
      loadClasses();
    } catch {
    }
  }

  async function handleDelete(classId: string) {
    if (!orgId || !confirm('确定删除该班级？')) return;
    try {
      await api.delete(`/orgs/${orgId}/school/classes/${classId}`);
      loadClasses();
    } catch {
    }
  }

  // Group by grade
  const grouped: Record<string, SchoolClass[]> = {};
  for (const cls of classes) {
    if (!grouped[cls.grade]) grouped[cls.grade] = [];
    grouped[cls.grade].push(cls);
  }

  if (loading) {
    return <div className="text-slate-400 text-sm py-8 text-center">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">管理学校的年级和班级结构</p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 text-white text-sm rounded-lg hover:bg-teal-600 transition"
        >
          <Plus className="w-4 h-4" />
          添加班级
        </button>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <GraduationCap className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">暂无班级数据</p>
          <p className="text-slate-400 text-xs mt-1">点击「添加班级」开始设置年级和班级</p>
        </div>
      ) : (
        Object.entries(grouped).map(([grade, gradeClasses]) => (
          <div key={grade} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">{grade}</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {gradeClasses.map((cls) => (
                <div key={cls.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-900">{cls.className}</span>
                    {cls.teacherName && (
                      <span className="text-xs text-slate-400">班主任: {cls.teacherName}</span>
                    )}
                    <span className="text-xs text-slate-400">{cls.studentCount} 人</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setInviteForClass(cls)}
                      className="text-slate-400 hover:text-teal-600 transition flex items-center gap-1 px-2 py-1 rounded text-xs"
                      title="生成本班家长邀请码"
                    >
                      <QrCode className="w-4 h-4" />
                      家长邀请
                    </button>
                    <button
                      onClick={() => handleDelete(cls.id)}
                      className="text-slate-400 hover:text-red-500 transition p-1"
                      title="删除班级"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Add Class Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">添加班级</h2>
              <button onClick={() => setShowAdd(false)}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">年级 *</label>
                <input
                  type="text"
                  placeholder="如：高一、初二、一年级"
                  value={newGrade}
                  onChange={(e) => setNewGrade(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-200"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">班级名称 *</label>
                <input
                  type="text"
                  placeholder="如：1班、2班"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-200"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                取消
              </button>
              <button
                onClick={handleAdd}
                disabled={!newGrade.trim() || !newClassName.trim()}
                className="px-4 py-2 text-sm bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition disabled:opacity-50"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 14 — Parent invite token modal */}
      {inviteForClass && (
        <ParentInviteModal
          schoolClass={inviteForClass}
          onClose={() => setInviteForClass(null)}
        />
      )}
    </div>
  );
}
