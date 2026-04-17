/**
 * 强托底文案 —— 在规则编辑器、候选池、测评结果页等所有可能让用户误以为
 * "系统会自动联系家长/外部"的地方显示,降低机构法务风险。
 */
import React from 'react';
import { ShieldAlert } from 'lucide-react';

interface Props {
  /** 'inline' 适合段落内,'card' 是独立的 banner */
  variant?: 'inline' | 'card';
  /** 覆盖默认文案 */
  text?: string;
}

const DEFAULT_TEXT =
  '本系统不会自动联系家长或外部机构。所有涉及对外联系、转介、紧急干预的动作,均需咨询师或管理员在获得明确授权后手动确认发出。';

export function NoAutoContactDisclaimer({ variant = 'card', text = DEFAULT_TEXT }: Props) {
  if (variant === 'inline') {
    return (
      <p className="text-[11px] text-amber-700 flex items-start gap-1.5">
        <ShieldAlert className="w-3 h-3 mt-0.5 flex-shrink-0" />
        <span>{text}</span>
      </p>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
      <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
      <div>
        <div className="text-sm font-medium text-amber-900 mb-1">责任边界说明</div>
        <p className="text-xs text-amber-800 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}
