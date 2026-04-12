import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { Search, Plus, Edit2, Trash2 } from 'lucide-react';
import { DistributionBadge, DistributionEditor } from '../components/DistributionEditor';

interface CourseTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  allowedOrgIds: string[];
  createdAt: string;
}

export function AdminLibraryCourses() {
  const [items, setItems] = useState<CourseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [distTarget, setDistTarget] = useState<CourseTemplate | null>(null);

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    setLoading(true);
    try {
      const data = await api.get<CourseTemplate[]>('/admin/library/courses');
      setItems(data);
    } catch (err) {
      console.error('Failed to load system courses:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = items.filter((c) =>
    !search || c.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="relative max-w-xs flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜索课程模板..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <button className="flex items-center gap-1.5 text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">
          <Plus className="w-4 h-4" />
          新建课程模板
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="px-5 py-12 text-center text-slate-400 text-sm">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-slate-400 text-sm">
            {items.length === 0 ? '暂无系统课程模板' : '没有匹配的结果'}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">课程名称</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">分类</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">状态</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">分发范围</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">创建时间</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="text-sm font-medium text-slate-900">{c.title}</div>
                    {c.description && <div className="text-xs text-slate-400 mt-0.5 truncate max-w-sm">{c.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{c.category || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${c.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {c.status === 'published' ? '已发布' : c.status === 'draft' ? '草稿' : c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <DistributionBadge allowedOrgIds={c.allowedOrgIds} onClick={() => setDistTarget(c)} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{new Date(c.createdAt).toLocaleDateString('zh-CN')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button className="p-1 text-slate-400 hover:text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {distTarget && (
        <DistributionEditor
          allowedOrgIds={distTarget.allowedOrgIds || []}
          onSave={async (orgIds) => {
            await api.patch(`/admin/library/courses/${distTarget.id}/distribution`, { allowedOrgIds: orgIds });
            await loadItems();
          }}
          onClose={() => setDistTarget(null)}
        />
      )}
    </div>
  );
}
