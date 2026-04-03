import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useEpisode, useTimeline, useCloseEpisode, useConfirmTriage,
  useReferrals, useUpdateReferral,
  useFollowUpPlans, useFollowUpReviews,
} from '../../../api/useCounseling';
import { useTreatmentPlans, useUpdateGoalStatus } from '../../../api/useTreatmentPlan';
import { useConsentDocuments } from '../../../api/useConsent';
import { Timeline } from '../components/Timeline';
import { SessionNoteForm } from '../components/SessionNoteForm';
import { ClientProfilePanel } from '../components/ClientProfilePanel';
import { TreatmentPlanForm } from '../components/TreatmentPlanForm';
import { TreatmentPlanCard } from '../components/TreatmentPlanCard';
import { ReferralForm } from '../components/ReferralForm';
import { ReferralCard } from '../components/ReferralCard';
import { FollowUpPlanForm } from '../components/FollowUpPlanForm';
import { FollowUpCard } from '../components/FollowUpCard';
import { SendConsentForm } from '../components/SendConsentForm';
import { ProgressReportPanel } from '../components/ProgressReportPanel';
import { ComplianceReviewPanel } from '../components/ComplianceReviewPanel';
import { PageLoading, EmptyState, RiskBadge, useToast } from '../../../shared/components';
import { ArrowLeft } from 'lucide-react';

const interventionLabels: Record<string, string> = {
  course: '课程', group: '团辅', counseling: '个咨', referral: '转介',
};

const statusLabels: Record<string, string> = {
  active: '进行中', paused: '暂停', closed: '已结案', archived: '已归档',
};

type TabKey = 'timeline' | 'profile' | 'consent' | 'plan' | 'soap' | 'referral' | 'followup';

export function EpisodeDetail() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const navigate = useNavigate();
  const { data: episode } = useEpisode(episodeId);
  const { data: timeline, isLoading: timelineLoading } = useTimeline(episodeId);
  const closeEpisode = useCloseEpisode();
  const confirmTriage = useConfirmTriage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>('timeline');

  if (!episode) {
    return <PageLoading />;
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'timeline', label: '时间线' },
    { key: 'profile', label: '档案' },
    { key: 'consent', label: '用户协议' },
    { key: 'plan', label: '治疗计划' },
    { key: 'soap', label: '写 SOAP' },
    { key: 'referral', label: '转介' },
    { key: 'followup', label: '随访' },
  ];

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <button
        onClick={() => navigate('/episodes')}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="w-4 h-4" />
        个案管理
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-slate-900">
                {episode.client?.name || '未知来访者'}
              </h1>
              <RiskBadge level={episode.currentRisk} />
              {episode.interventionType && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {interventionLabels[episode.interventionType] || episode.interventionType}
                </span>
              )}
              <span className="text-xs text-slate-400">
                {statusLabels[episode.status] || episode.status}
              </span>
            </div>
            {episode.chiefComplaint && (
              <p className="text-sm text-slate-500 mt-1">{episode.chiefComplaint}</p>
            )}
          </div>
          <div className="flex gap-2">
            {episode.status === 'active' && (
              <button
                onClick={async () => {
                  if (confirm('确定结案？')) {
                    await closeEpisode.mutateAsync({ episodeId: episode.id });
                    toast('已成功结案', 'success');
                  }
                }}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50"
              >
                结案
              </button>
            )}
          </div>
        </div>

        {episode.status === 'active' && (
          <TriageBar
            episodeId={episode.id}
            currentRisk={episode.currentRisk}
            currentIntervention={episode.interventionType || null}
            onConfirm={async (data) => {
              await confirmTriage.mutateAsync(data);
              toast('分流已更新', 'success');
            }}
          />
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === tab.key
                ? 'bg-brand-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'profile' && (
        <ClientProfilePanel
          clientId={episode.clientId}
          clientName={episode.client?.name || '未知'}
          episodeId={episode.id}
        />
      )}
      {activeTab === 'timeline' && (
        <div className="space-y-4">
          <ProgressReportPanel episodeId={episode.id} />
          <ComplianceReviewPanel episodeId={episode.id} />
          <Timeline events={timeline || []} isLoading={timelineLoading} />
        </div>
      )}
      {activeTab === 'plan' && (
        <EpisodeTreatmentPlans
          episodeId={episode.id}
          chiefComplaint={episode.chiefComplaint}
          currentRisk={episode.currentRisk}
        />
      )}
      {activeTab === 'soap' && (
        <SessionNoteForm
          episodeId={episode.id}
          clientId={episode.clientId}
          chiefComplaint={episode.chiefComplaint}
          onDone={() => setActiveTab('timeline')}
        />
      )}
      {activeTab === 'consent' && (
        <EpisodeConsentStatus episodeId={episode.id} clientId={episode.clientId} />
      )}
      {activeTab === 'referral' && (
        <EpisodeReferrals
          episodeId={episode.id}
          clientId={episode.clientId}
          currentRisk={episode.currentRisk}
        />
      )}
      {activeTab === 'followup' && (
        <EpisodeFollowUp
          episodeId={episode.id}
          currentRisk={episode.currentRisk}
        />
      )}
    </div>
  );
}

// ─── Treatment Plans Tab ────────────────────────────────────────

function EpisodeTreatmentPlans({ episodeId, chiefComplaint, currentRisk }: { episodeId: string; chiefComplaint?: string; currentRisk?: string }) {
  const { data: plans, isLoading } = useTreatmentPlans(episodeId);
  const updateGoalStatus = useUpdateGoalStatus();
  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">治疗计划</h3>
        <button onClick={() => { setEditingPlan(null); setShowForm(!showForm); }} className="text-sm text-brand-600 hover:underline">
          {showForm ? '收起' : '+ 新建计划'}
        </button>
      </div>
      {(showForm || editingPlan) && (
        <TreatmentPlanForm episodeId={episodeId} existingPlan={editingPlan || undefined} chiefComplaint={chiefComplaint} currentRisk={currentRisk} onDone={() => { setShowForm(false); setEditingPlan(null); }} />
      )}
      {isLoading ? <PageLoading /> : !plans || plans.length === 0 ? (
        <EmptyState title="暂无治疗计划" action={{ label: '+ 新建计划', onClick: () => setShowForm(true) }} />
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <TreatmentPlanCard key={plan.id} plan={plan}
              onEdit={() => { setEditingPlan(plan); setShowForm(false); }}
              onGoalStatusChange={(goalId, status) => updateGoalStatus.mutate({ planId: plan.id, goalId, status })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Referrals Tab ──────────────────────────────────────────────

function EpisodeReferrals({ episodeId, clientId, currentRisk }: { episodeId: string; clientId: string; currentRisk: string }) {
  const { data: referrals, isLoading } = useReferrals(episodeId);
  const updateReferral = useUpdateReferral();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const isHighRisk = currentRisk === 'level_3' || currentRisk === 'level_4';

  return (
    <div className="space-y-4">
      {isHighRisk && !referrals?.length && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          当前风险等级较高，建议考虑转介至专业机构。
        </div>
      )}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">转介记录</h3>
        <button onClick={() => setShowForm(!showForm)} className="text-sm text-brand-600 hover:underline">
          {showForm ? '收起' : '+ 发起转介'}
        </button>
      </div>
      {showForm && <ReferralForm episodeId={episodeId} clientId={clientId} onDone={() => setShowForm(false)} />}
      {isLoading ? <PageLoading /> : !referrals || referrals.length === 0 ? (
        <EmptyState title="暂无转介记录" action={{ label: '+ 发起转介', onClick: () => setShowForm(true) }} />
      ) : (
        <div className="space-y-2">
          {referrals.map((r) => (
            <ReferralCard key={r.id} referral={r} isPending={updateReferral.isPending}
              onStatusChange={async (status) => {
                try { await updateReferral.mutateAsync({ referralId: r.id, status }); toast('状态已更新', 'success'); }
                catch { toast('操作失败', 'error'); }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Follow-up Tab ──────────────────────────────────────────────

function EpisodeFollowUp({ episodeId, currentRisk }: { episodeId: string; currentRisk: string }) {
  const { data: plans, isLoading } = useFollowUpPlans(episodeId);
  const { data: reviews } = useFollowUpReviews(episodeId);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">随访计划</h3>
        <button onClick={() => setShowForm(!showForm)} className="text-sm text-brand-600 hover:underline">
          {showForm ? '收起' : '+ 新建计划'}
        </button>
      </div>
      {showForm && <FollowUpPlanForm episodeId={episodeId} onDone={() => setShowForm(false)} />}
      {isLoading ? <PageLoading /> : !plans || plans.length === 0 ? (
        <EmptyState title="暂无随访计划" action={{ label: '+ 新建计划', onClick: () => setShowForm(true) }} />
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <FollowUpCard key={plan.id} plan={plan} reviews={reviews || []} episodeId={episodeId} currentRisk={currentRisk} onReviewCreated={() => {}} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Consent Status ─────────────────────────────────────────────

const consentTypeLabels: Record<string, string> = {
  treatment: '咨询知情同意', data_collection: '数据采集', ai_processing: 'AI分析',
  data_sharing: '数据共享', research: '研究用途',
};

function EpisodeConsentStatus({ episodeId, clientId }: { episodeId: string; clientId: string }) {
  const { data: docs, isLoading } = useConsentDocuments({ clientId, careEpisodeId: episodeId });
  const [showSend, setShowSend] = useState(false);

  const pending = (docs || []).filter((d) => d.status === 'pending');
  const signed = (docs || []).filter((d) => d.status === 'signed');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">用户协议</h3>
        <button onClick={() => setShowSend(!showSend)} className="text-sm text-brand-600 hover:underline">
          {showSend ? '收起' : '+ 发送协议'}
        </button>
      </div>

      {showSend && <SendConsentForm clientId={clientId} careEpisodeId={episodeId} onDone={() => setShowSend(false)} />}

      {pending.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="text-sm font-medium text-amber-700 mb-2">待签署 ({pending.length})</div>
          {pending.map((d) => (
            <div key={d.id} className="text-sm text-amber-600">
              • {d.title} ({consentTypeLabels[d.consentType || ''] || d.consentType})
            </div>
          ))}
        </div>
      )}

      {signed.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-sm font-medium text-slate-700 mb-2">已签署 ({signed.length})</div>
          <div className="space-y-1.5">
            {signed.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-sm text-slate-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                <span>{d.title}</span>
                <span className="text-xs text-slate-400">
                  {d.signedAt ? new Date(d.signedAt).toLocaleDateString('zh-CN') : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && (!docs || docs.length === 0) && (
        <EmptyState title="尚未发送用户协议" action={{ label: '+ 发送协议', onClick: () => setShowSend(true) }} />
      )}
    </div>
  );
}

// ─── Triage Bar ─────────────────────────────────────────────────

function TriageBar({
  episodeId, currentRisk, currentIntervention, onConfirm,
}: {
  episodeId: string; currentRisk: string; currentIntervention: string | null;
  onConfirm: (data: { episodeId: string; currentRisk: string; interventionType: string }) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [risk, setRisk] = useState(currentRisk);
  const [intervention, setIntervention] = useState(currentIntervention || 'counseling');

  if (!editing) {
    return <button onClick={() => setEditing(true)} className="mt-3 text-xs text-brand-600 hover:underline">调整分流</button>;
  }

  return (
    <div className="mt-3 flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
      <select value={risk} onChange={(e) => setRisk(e.target.value)} className="px-2 py-1 border border-slate-200 rounded text-xs">
        <option value="level_1">一级（一般）</option>
        <option value="level_2">二级（关注）</option>
        <option value="level_3">三级（严重）</option>
        <option value="level_4">四级（危机）</option>
      </select>
      <select value={intervention} onChange={(e) => setIntervention(e.target.value)} className="px-2 py-1 border border-slate-200 rounded text-xs">
        <option value="course">课程</option>
        <option value="group">团辅</option>
        <option value="counseling">个咨</option>
        <option value="referral">转介</option>
      </select>
      <button onClick={async () => { await onConfirm({ episodeId, currentRisk: risk, interventionType: intervention }); setEditing(false); }} className="px-3 py-1 bg-brand-600 text-white rounded text-xs hover:bg-brand-500">确认</button>
      <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-slate-600">取消</button>
    </div>
  );
}
