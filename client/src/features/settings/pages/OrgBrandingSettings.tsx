import React, { useEffect, useState } from 'react';
import { Palette, Save, Image as ImageIcon } from 'lucide-react';
import {
  PageLoading,
  useToast,
  FeatureGate,
} from '../../../shared/components';
import {
  useOrgBranding,
  useUpdateOrgBranding,
  type BrandingSettings,
} from '../../../api/useOrgBranding';
import { useCurrentTier } from '../../../shared/hooks/useFeature';
import { TIER_LABELS } from '@psynote/shared';

/**
 * Phase 7b — Organization branding settings page.
 *
 * Gated by `<FeatureGate feature="branding" mode="upsell">`. When the current
 * tier doesn't include branding, shows an upsell card pointing to the `team`
 * tier. When it does, shows a form for logo URL, theme color, report header
 * and report footer. The form is fully controlled — on save, it patches the
 * org's `settings.branding` sub-object via `useUpdateOrgBranding`.
 *
 * Design choice: Phase 7b ships a URL-based logo field rather than a real
 * file uploader. File upload goes through `upload.routes.ts` and adds a new
 * code path; skipping it here keeps the PR focused on the feature flag
 * infrastructure. The upsell copy + the form itself prove the gate works; the
 * upload flow can be bolted on later without touching any of this code.
 */
export function OrgBrandingSettings() {
  return (
    <FeatureGate
      feature="branding"
      mode="upsell"
      requiredTier="team"
      featureLabel="品牌定制"
    >
      <BrandingForm />
    </FeatureGate>
  );
}

function BrandingForm() {
  const tier = useCurrentTier();
  const { data, isLoading } = useOrgBranding();
  const update = useUpdateOrgBranding();
  const { toast } = useToast();

  const [form, setForm] = useState<BrandingSettings>({});

  // Seed the form from the server-loaded value once
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading) return <PageLoading text="加载品牌设置..." />;

  const handleChange = <K extends keyof BrandingSettings>(
    key: K,
    value: BrandingSettings[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update.mutateAsync(form);
      toast('品牌设置已保存', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    }
  };

  return (
    <div className="max-w-2xl space-y-6">

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Logo URL */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <label className="block">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-800">Logo URL</span>
            </div>
            <input
              type="url"
              value={form.logoUrl ?? ''}
              onChange={(e) => handleChange('logoUrl', e.target.value)}
              placeholder="https://example.com/logo.png"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              侧边栏和测评报告的 header 会显示这个 logo。暂支持外链，后续版本会加直接上传。
            </p>
          </label>
          {form.logoUrl && (
            <div className="mt-3 p-3 bg-slate-50 rounded-lg flex items-center gap-3">
              <span className="text-xs text-slate-500">预览:</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.logoUrl}
                alt="logo preview"
                className="h-8 w-auto"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>

        {/* Theme color */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <label className="block">
            <div className="flex items-center gap-2 mb-2">
              <Palette className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-800">主题色</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.themeColor ?? '#6366f1'}
                onChange={(e) => handleChange('themeColor', e.target.value)}
                className="w-14 h-10 border border-slate-200 rounded cursor-pointer"
              />
              <input
                type="text"
                value={form.themeColor ?? ''}
                onChange={(e) => handleChange('themeColor', e.target.value)}
                placeholder="#6366f1"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              十六进制色值。用于按钮、链接、徽章等品牌强调色。
            </p>
          </label>
        </div>

        {/* Report header */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800 block mb-2">
              报告页眉文本
            </span>
            <input
              type="text"
              value={form.reportHeader ?? ''}
              onChange={(e) => handleChange('reportHeader', e.target.value)}
              placeholder="如：XX 心理咨询中心 · 个案测评报告"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-800 block mb-2">
              报告页脚文本
            </span>
            <textarea
              value={form.reportFooter ?? ''}
              onChange={(e) => handleChange('reportFooter', e.target.value)}
              rows={2}
              placeholder="如：本报告仅供内部使用，未经授权不得外传。"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </label>
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={update.isPending}
            className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 transition"
          >
            <Save className="w-4 h-4" />
            {update.isPending ? '保存中...' : '保存更改'}
          </button>
        </div>
      </form>
    </div>
  );
}
