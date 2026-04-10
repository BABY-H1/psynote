/**
 * Phase 9α — Crisis resources modal.
 *
 * Shown to a portal user when their reflection / worksheet / check-in
 * submission contains crisis keywords (自杀 / 自残 / 想死 / ...). The list
 * of resources comes from the server response so it can be configured per org
 * in the future. For now the server returns DEFAULT_CRISIS_RESOURCES.
 *
 * Design:
 * - Cannot be dismissed by clicking outside (intentional friction)
 * - Phone numbers are tap-to-call on mobile (tel: links)
 * - Severity colour: critical = red, warning = amber
 */
import React from 'react';
import { Phone, X } from 'lucide-react';
import type { CrisisResource } from '@psynote/shared';

interface Props {
  severity: 'critical' | 'warning';
  resources: CrisisResource[];
  onClose: () => void;
}

export function CrisisModal({ severity, resources, onClose }: Props) {
  const isCritical = severity === 'critical';
  const accentColor = isCritical ? 'red' : 'amber';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className={`p-5 border-b border-${accentColor}-100 bg-${accentColor}-50`}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className={`text-lg font-bold text-${accentColor}-800`}>
                {isCritical ? '我们注意到你可能正在经历困难' : '关心你的状态'}
              </h3>
              <p className={`text-sm text-${accentColor}-700 mt-1 leading-relaxed`}>
                {isCritical
                  ? '如果你正在经历强烈的痛苦或有伤害自己的想法，请立即联系专业心理援助热线。你不孤单，有人愿意倾听。'
                  : '如果你需要倾诉或专业支持，下面是一些可以拨打的心理援助热线：'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-white/50 rounded text-slate-500"
              aria-label="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-3">
          {resources.map((r, idx) => (
            <a
              key={idx}
              href={`tel:${r.phone}`}
              className="block p-3 border border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800">{r.name}</div>
                  <div className="text-blue-600 font-mono text-base mt-0.5">{r.phone}</div>
                  {r.hours && <div className="text-xs text-slate-500 mt-0.5">服务时间：{r.hours}</div>}
                  {r.description && (
                    <div className="text-xs text-slate-600 mt-1 leading-relaxed">{r.description}</div>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>

        <div className="p-5 border-t border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-600 leading-relaxed mb-3">
            你的反思已经保存。你的咨询师也会收到通知，会在合适的时候和你联系。
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-slate-700 text-white rounded-xl text-sm font-medium hover:bg-slate-800"
          >
            我已知晓
          </button>
        </div>
      </div>
    </div>
  );
}
