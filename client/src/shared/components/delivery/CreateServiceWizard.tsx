import React from 'react';
import { ArrowLeft, Check } from 'lucide-react';

/**
 * CreateServiceWizard — 创建向导外壳。
 *
 * 把 CreateEpisodeWizard / AssessmentWizard / 团辅创建 等"多步骤创建表单"
 * 的进度点 + 返回按钮 + 步骤切换收敛为一套外壳。
 *
 * 当前用法（Phase 4 之后）：
 *  - CreateEpisodeWizard 替换内联进度点（4d，原 CreateEpisodeWizard 第 31-45 行）
 *  - 团辅创建向导（4a，新增）
 *  - 课程创建向导（4b，新增）
 *  - 测评创建向导（4c，AssessmentWizard 重构）
 *
 * 设计要点：
 * 1. **完全受控**：当前步骤、步骤数量都由父组件传入
 * 2. **步骤内容通过 children slot 注入**：父组件根据当前 step 渲染对应的子表单
 * 3. **不绑死 5 步**：通过 `steps` 数组定义，最少 2 步，最多任意
 * 4. **可选标题**：每个 step 可附带 label 显示在进度点下方
 */

export interface WizardStep {
  /** 步骤标识符 */
  key: string;
  /** 显示在进度点下方的短文案 */
  label?: string;
}

interface Props {
  /** 步骤列表（顺序决定显示顺序） */
  steps: WizardStep[];
  /** 当前激活步骤的索引（0-based） */
  activeIndex: number;
  /** 顶部"返回"按钮回调；不传则不渲染返回按钮 */
  onBack?: () => void;
  /** 顶部"返回"按钮文案，默认 "返回" */
  backLabel?: string;
  /** 标题（向导名，例如"创建个案"） */
  title?: string;
  /** 副标题/描述 */
  subtitle?: string;
  /** 步骤内容 — 由父组件根据 activeIndex 渲染对应子表单 */
  children: React.ReactNode;
  /** 外层最大宽度 className，默认 `max-w-2xl` */
  maxWidthClassName?: string;
}

export function CreateServiceWizard({
  steps,
  activeIndex,
  onBack,
  backLabel = '返回',
  title,
  subtitle,
  children,
  maxWidthClassName = 'max-w-2xl',
}: Props) {
  return (
    <div className={`${maxWidthClassName} mx-auto space-y-6`}>
      {/* Back link */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </button>
      )}

      {/* Title */}
      {(title || subtitle) && (
        <div>
          {title && <h1 className="text-2xl font-bold text-slate-900">{title}</h1>}
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>
      )}

      {/* Progress dots */}
      <ProgressDots steps={steps} activeIndex={activeIndex} />

      {/* Active step content */}
      <div>{children}</div>
    </div>
  );
}

function ProgressDots({ steps, activeIndex }: { steps: WizardStep[]; activeIndex: number }) {
  const total = steps.length;
  const showLabels = steps.some((s) => s.label);

  return (
    <div>
      <div className="flex items-center gap-2">
        {steps.map((step, i) => {
          const isDone = i < activeIndex;
          const isCurrent = i === activeIndex;
          const dotCls = isDone || isCurrent ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500';
          return (
            <React.Fragment key={step.key}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${dotCls}`}
              >
                {isDone ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              {i < total - 1 && (
                <div
                  className={`flex-1 h-0.5 ${i < activeIndex ? 'bg-brand-600' : 'bg-slate-200'}`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Optional labels row */}
      {showLabels && (
        <div className="flex items-center gap-2 mt-1.5">
          {steps.map((step, i) => {
            const isCurrent = i === activeIndex;
            return (
              <React.Fragment key={`l-${step.key}`}>
                <div
                  className={`w-8 text-center text-[10px] ${
                    isCurrent ? 'text-brand-600 font-medium' : 'text-slate-400'
                  }`}
                >
                  {step.label || ''}
                </div>
                {i < total - 1 && <div className="flex-1" />}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
