import React, { useState, useRef } from 'react';
import { Upload, User as UserIcon, Loader2, Check } from 'lucide-react';
import { useUpdateMyProfile, type MeProfile } from '../../../api/useMe';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';

/**
 * Phase 14f — BasicInfoTab: edit own name + avatar. Email is shown read-only.
 *
 * Avatar upload reuses `POST /api/orgs/:orgId/upload` (the generic file
 * upload route Auth-guarded for any logged-in non-client user).
 */
export function BasicInfoTab({ me }: { me: MeProfile }) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const updateMe = useUpdateMyProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(me.user.name);
  const [avatarUrl, setAvatarUrl] = useState(me.user.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState('');

  const dirty = name.trim() !== me.user.name || avatarUrl !== me.user.avatarUrl;
  const canSave = dirty && !!name.trim() && !updateMe.isPending;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;
    setError('');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.uploadFile<{ url: string }>(`/orgs/${orgId}/upload`, form);
      setAvatarUrl(res.url);
    } catch (err: any) {
      setError(err?.message || '上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSave() {
    setError('');
    try {
      await updateMe.mutateAsync({
        name: name.trim(),
        avatarUrl,
      });
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    } catch (err: any) {
      setError(err?.message || '保存失败');
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      {/* Avatar */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">头像</label>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200 flex-shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-8 h-8 text-slate-300" />
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? '上传中...' : '更换头像'}
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={() => setAvatarUrl(null)}
                className="ml-2 text-xs text-slate-400 hover:text-rose-500"
              >
                移除
              </button>
            )}
            <p className="text-[11px] text-slate-400 mt-1">推荐 256×256 的 PNG/JPG</p>
          </div>
        </div>
      </div>

      {/* Name */}
      <div>
        <label htmlFor="my-name" className="block text-sm font-medium text-slate-700 mb-1">
          姓名 <span className="text-rose-500">*</span>
        </label>
        <input
          id="my-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
      </div>

      {/* Email (read-only) */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
        <input
          type="email"
          value={me.user.email || ''}
          readOnly
          disabled
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
        />
        <p className="text-[11px] text-slate-400 mt-1">邮箱不可修改，如需变更请联系系统管理员</p>
      </div>

      {/* Actions */}
      {error && (
        <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>
      )}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {updateMe.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          保存
        </button>
        {savedAt && (
          <span className="text-sm text-emerald-600 flex items-center gap-1">
            <Check className="w-4 h-4" />
            已保存
          </span>
        )}
      </div>
    </div>
  );
}
