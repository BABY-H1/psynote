import React, { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { StatusBadge } from '../../../shared/components';
import { FollowUpReviewForm } from './FollowUpReviewForm';
import type { FollowUpPlan, FollowUpReview } from '@psynote/shared';

const planTypeLabels: Record<string, string> = {
  reassessment: '复评', callback: '回访', check_in: '签到',
};

const frequencyLabels: Record<string, string> = {
  weekly: '每周', 'bi-weekly': '双周', monthly: '每月', quarterly: '每季度',
};

const statusConfig: Record<string, { label: string; variant: 'green' | 'blue' | 'slate' }> = {
  active: { label: '进行中', variant: 'blue' },
  paused: { label: '暂停', variant: 'slate' },
  completed: { label: '已完成', variant: 'green' },
};

const decisionLabels: Record<string, string> = {
  continue: '继续', escalate: '升级', deescalate: '降级', close: '结案',
};

const riskLabels: Record<string, string> = {
  level_1: '一般', level_2: '关注', level_3: '严重', level_4: '危机',
};

interface Props {
  plan: FollowUpPlan;
  reviews: FollowUpReview[];
  episodeId: string;
  currentRisk: string;
  onReviewCreated: () => void;
}

export function FollowUpCard({ plan, reviews, episodeId, currentRisk, onReviewCreated }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const status = statusConfig[plan.status] || statusConfig.active;

  // Due date warning
  const now = new Date();
  const dueDate = plan.nextDue ? new Date(plan.nextDue) : null;
  const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / 86400000) : null;
  const isOverdue = daysUntilDue != null && daysUntilDue < 0;
  const isUrgent = daysUntilDue != null && daysUntilDue >= 0 && daysUntilDue <= 3;

  const planReviews = reviews.filter((r) => r.planId === plan.id);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusBadge label={status.label} variant={status.variant} />
          <span className="text-sm font-medium text-slate-900">
            {planTypeLabels[plan.planType || ''] || plan.planType || '随访'}
          </span>
          {plan.frequency && (
            <span className="text-xs text-slate-400">
              {frequencyLabels[plan.frequency] || plan.frequency}
            </span>
          )}
          {dueDate && (
            <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : isUrgent ? 'text-amber-500 font-medium' : 'text-slate-400'}`}>
              {isOverdue && <AlertTriangle className="w-3 h-3 inline mr-0.5" />}
              {isOverdue ? '已逾期' : isUrgent ? '即将到期' : ''}
              {' '}到期：{dueDate.toLocaleDateString('zh-CN')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {plan.status === 'active' && (
            <button
              onClick={() => setShowReview(!showReview)}
              className="text-xs text-brand-600 hover:text-brand-700"
            >
              {showReview ? '收起' : '+ 记录复评'}
            </button>
          )}
          {planReviews.length > 0 && (
            <button onClick={() => setExpanded(!expanded)} className="text-slate-400 hover:text-slate-600">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {plan.notes && (
        <p className="text-xs text-slate-500 mt-1">{plan.notes}</p>
      )}

      {showReview && (
        <FollowUpReviewForm
          planId={plan.id}
          episodeId={episodeId}
          currentRisk={currentRisk}
          onDone={() => { setShowReview(false); onReviewCreated(); }}
        />
      )}

      {expanded && planReviews.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
          <h4 className="text-xs font-medium text-slate-400">复评记录</h4>
          {planReviews.map((review) => (
            <div key={review.id} className="bg-slate-50 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{new Date(review.reviewDate).toLocaleDateString('zh-CN')}</span>
                {review.decision && (
                  <span className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-xs">
                    {decisionLabels[review.decision] || review.decision}
                  </span>
                )}
                {review.riskBefore && review.riskAfter && review.riskBefore !== review.riskAfter && (
                  <span className="text-xs">
                    风险：{riskLabels[review.riskBefore]} → {riskLabels[review.riskAfter]}
                  </span>
                )}
              </div>
              {review.clinicalNote && (
                <p className="text-slate-600 mt-1">{review.clinicalNote}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
