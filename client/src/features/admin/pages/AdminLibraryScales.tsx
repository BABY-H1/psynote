import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { Search, Plus, Edit2, Trash2 } from 'lucide-react';
import { DistributionBadge, DistributionEditor } from '../components/DistributionEditor';

interface Scale {
  id: string;
  title: string;
  description: string;
  questionCount: number;
  isPublic: boolean;
  allowedOrgIds: string[];
  createdAt: string;
}

export function AdminLibraryScales() {
  const [scales, setScales] = useState<Scale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [distTarget, setDistTarget] = useState<Scale | null>(null);

  useEffect(() => {
    loadScales();
  }, []);

  async function loadScales() {
    setLoading(true);
    try {
      const data = await api.get<Scale[]>('/admin/library/scales');
      setScales(data);
    } catch (err) {
      console.error('Failed to load system scales:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = scales.filter((s) =>
    !search || s.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="relative max-w-xs flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜索量表..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <button className="flex items-center gap-1.5 text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">
          <Plus className="w-4 h-4" />
          新建系统量表
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="px-5 py-12 text-center text-slate-400 text-sm">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-slate-400 text-sm">
            {scales.length === 0 ? '暂无系统量表' : '没有匹配的结果'}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">量表名称</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">题目数</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">状态</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">分发范围</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">创建时间</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="text-sm font-medium text-slate-900">{s.title}</div>
                    {s.description && (
                      <div className="text-xs text-slate-400 mt-0.5 truncate max-w-sm">{s.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{s.questionCount}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.isPublic ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.isPublic ? '已发布' : '草稿'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <DistributionBadge allowedOrgIds={s.allowedOrgIds} onClick={() => setDistTarget(s)} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{new Date(s.createdAt).toLocaleDateString('zh-CN')}</td>
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
            await api.patch(`/admin/library/scales/${distTarget.id}/distribution`, { allowedOrgIds: orgIds });
            await loadScales();
          }}
          onClose={() => setDistTarget(null)}
        />
      )}
    </div>
  );
}
