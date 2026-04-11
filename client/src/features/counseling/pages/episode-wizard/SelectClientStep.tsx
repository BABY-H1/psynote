import React, { useState } from 'react';
import { useOrgMembers } from '../../../../api/useCounseling';
import { useInviteMember } from '../../../../api/useOrg';
import { PageLoading, useToast } from '../../../../shared/components';
import { ArrowRight, UserPlus } from 'lucide-react';

interface Props {
  clientId: string;
  onSelect: (id: string, name: string) => void;
  onNext: () => void;
}

export function SelectClientStep({ clientId, onSelect, onNext }: Props) {
  const { data: members, isLoading } = useOrgMembers();
  const inviteMember = useInviteMember();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');

  const clients = (members || []).filter((m) => m.role === 'client');
  const filtered = clients.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()),
  );

  const handleAddClient = async () => {
    if (!newEmail) return;
    try {
      const member = await inviteMember.mutateAsync({ email: newEmail, role: 'client', name: newName || undefined });
      onSelect(member.userId, member.name);
      toast('来访者已添加', 'success');
      setShowAdd(false);
    } catch (err: any) {
      toast(err?.message || '添加失败', 'error');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-bold text-slate-900 mb-1">选择来访者</h2>
      <p className="text-sm text-slate-500 mb-4">从已有来访者中选择，或添加新的来访者</p>

      <div className="flex items-center gap-3 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索姓名或邮箱..."
          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        <button onClick={() => setShowAdd(!showAdd)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
          <UserPlus className="w-4 h-4" /> 添加新来访者
        </button>
      </div>

      {showAdd && (
        <div className="bg-slate-50 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">邮箱 *</label>
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@example.com"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">姓名</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="来访者姓名"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs text-slate-500">取消</button>
            <button onClick={handleAddClient} disabled={!newEmail || inviteMember.isPending}
              className="px-4 py-1.5 bg-brand-600 text-white rounded-lg text-xs hover:bg-brand-500 disabled:opacity-50">
              {inviteMember.isPending ? '添加中...' : '添加'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? <PageLoading /> : filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400">
          {clients.length === 0 ? '暂无来访者，请先添加' : '未找到匹配的来访者'}
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {filtered.map((c) => (
            <button key={c.userId} onClick={() => onSelect(c.userId, c.name)}
              className={`w-full text-left p-3 rounded-lg border transition ${
                clientId === c.userId ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
              }`}>
              <div className="text-sm font-medium text-slate-900">{c.name}</div>
              <div className="text-xs text-slate-400">{c.email}</div>
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-end mt-4">
        <button onClick={onNext} disabled={!clientId}
          className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5">
          下一步 <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
