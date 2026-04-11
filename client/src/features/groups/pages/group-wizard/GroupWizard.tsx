import React, { useState, useCallback } from 'react';
import { useGroupSchemes, useGroupScheme, useCreateGroupInstance, useBulkEnroll } from '../../../../api/useGroups';
import { useAssessments } from '../../../../api/useAssessments';
import { useOrgMembers } from '../../../../api/useCounseling';
import { useToast } from '../../../../shared/components';
import { ArrowLeft, Save, Rocket } from 'lucide-react';
import { BeforePhase } from './BeforePhase';
import { DuringPhase } from './DuringPhase';
import { AfterPhase } from './AfterPhase';
import type { AssessmentConfig, GroupScheme } from '@psynote/shared';

export type GroupPublishMode = 'assign' | 'class' | 'public';

export interface GroupWizardState {
  schemeId: string;
  title: string;
  description: string;
  locationType: 'offline' | 'online';
  location: string;
  meetingLink: string;
  meetingPlatform: string;
  capacity: number;
  startDate: string;
  schedule: string;
  leaderId: string;
  // 发布模式
  publishMode: GroupPublishMode;
  targetGroupLabel: string;
  selectedMemberIds: string[];
  csvMembers: Array<{ name: string; email?: string; phone?: string }>;
  assessmentConfig: AssessmentConfig;
  sessionOverrides: Record<number, { title?: string; goal?: string; assessments?: string[] }>;
}

const INITIAL_STATE: GroupWizardState = {
  schemeId: '',
  title: '',
  description: '',
  locationType: 'offline',
  location: '',
  meetingLink: '',
  meetingPlatform: '',
  capacity: 12,
  startDate: '',
  schedule: '',
  leaderId: '',
  publishMode: 'assign',
  targetGroupLabel: '',
  selectedMemberIds: [],
  csvMembers: [],
  assessmentConfig: {},
  sessionOverrides: {},
};

type Phase = 'before' | 'during' | 'after';

const PHASES: { key: Phase; label: string; emoji: string }[] = [
  { key: 'before', label: '开始前', emoji: '🟡' },
  { key: 'during', label: '进行中', emoji: '🟢' },
  { key: 'after', label: '结束后', emoji: '🔵' },
];

interface Props {
  onClose: () => void;
  onCreated?: (id: string) => void;
}

export function GroupWizard({ onClose, onCreated }: Props) {
  const [state, setState] = useState<GroupWizardState>(INITIAL_STATE);
  const [activePhase, setActivePhase] = useState<Phase>('before');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: schemes } = useGroupSchemes();
  const { data: selectedScheme } = useGroupScheme(state.schemeId || undefined);
  const { data: assessments } = useAssessments();
  const { data: members } = useOrgMembers();
  const createInstance = useCreateGroupInstance();
  const bulkEnroll = useBulkEnroll();
  const { toast } = useToast();

  const activeAssessments = assessments?.filter((a: any) => a.status !== 'archived') || [];
  const clients = (members || []).filter((m) => m.role === 'client');

  const updateState = useCallback((patch: Partial<GroupWizardState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  /** Apply scheme template — prefill all fields */
  const handleSchemeSelect = useCallback((schemeId: string) => {
    const scheme = schemes?.find((s) => s.id === schemeId);
    if (!scheme) return;

    const perSession: Record<string, string[]> = {};
    if (scheme.sessions) {
      scheme.sessions.forEach((sess, idx) => {
        if (sess.relatedAssessments && sess.relatedAssessments.length > 0) {
          perSession[String(idx + 1)] = [...sess.relatedAssessments];
        }
      });
    }

    setState((prev) => ({
      ...prev,
      schemeId,
      title: scheme.title || prev.title,
      description: scheme.description || prev.description,
      capacity: scheme.recommendedSize ? parseInt(scheme.recommendedSize, 10) || prev.capacity : prev.capacity,
      schedule: scheme.frequency || prev.schedule,
      assessmentConfig: {
        screening: scheme.recruitmentAssessments || [],
        preGroup: scheme.overallAssessments || [],
        perSession,
        postGroup: scheme.overallAssessments || [],
        followUp: [],
        satisfaction: [],
      },
      sessionOverrides: {},
    }));
  }, [schemes]);

  const handleSubmit = async (status: 'draft' | 'recruiting') => {
    if (!state.title.trim()) {
      toast('请填写活动名称', 'error');
      setActivePhase('before');
      return;
    }
    if (!state.schemeId) {
      toast('请选择方案模板', 'error');
      setActivePhase('before');
      return;
    }

    setIsSubmitting(true);
    try {
      // Compose location string from locationType
      let locationStr = state.location || undefined;
      if (state.locationType === 'online') {
        const parts = [state.meetingPlatform, state.meetingLink].filter(Boolean);
        locationStr = parts.length > 0 ? `线上：${parts.join(' ')}` : '线上';
      }

      const instance = await createInstance.mutateAsync({
        schemeId: state.schemeId,
        title: state.title.trim(),
        description: state.description || undefined,
        location: locationStr,
        capacity: state.capacity,
        startDate: state.startDate || undefined,
        schedule: state.schedule || undefined,
        leaderId: state.leaderId || undefined,
        status,
        assessmentConfig: state.assessmentConfig,
        // Keep legacy fields for backward compat
        recruitmentAssessments: state.assessmentConfig.screening || [],
        overallAssessments: state.assessmentConfig.preGroup || [],
      });

      // Batch enroll members if any
      const allMembers = [
        ...state.selectedMemberIds.map((id) => ({ userId: id })),
        ...state.csvMembers.map((m) => ({ name: m.name, email: m.email, phone: m.phone })),
      ];

      if (allMembers.length > 0) {
        try {
          const result = await bulkEnroll.mutateAsync({
            instanceId: instance.id,
            members: allMembers,
          });
          if (result.errors.length > 0) {
            toast(`${result.enrolled} 人报名成功，${result.errors.length} 人失败`, 'warning' as any);
          }
        } catch {
          toast('成员批量报名部分失败', 'error');
        }
      }

      toast(status === 'draft' ? '草稿已保存' : '活动已发布', 'success');
      onCreated?.(instance.id);
      onClose();
    } catch (err: any) {
      toast(err?.message || '创建失败', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-slate-900">创建团辅活动</h2>
      </div>

      {/* Phase Tabs */}
      <div className="flex border-b border-slate-200 mb-6">
        {PHASES.map((phase) => (
          <button
            key={phase.key}
            onClick={() => setActivePhase(phase.key)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition ${
              activePhase === phase.key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <span>{phase.emoji}</span>
            {phase.label}
          </button>
        ))}
      </div>

      {/* Phase Content */}
      <div className="mb-24">
        {activePhase === 'before' && (
          <BeforePhase
            state={state}
            onChange={updateState}
            schemes={schemes || []}
            selectedScheme={selectedScheme || null}
            onSchemeSelect={handleSchemeSelect}
            assessments={activeAssessments}
            clients={clients}
          />
        )}
        {activePhase === 'during' && (
          <DuringPhase
            state={state}
            onChange={updateState}
            selectedScheme={selectedScheme || null}
            assessments={activeAssessments}
          />
        )}
        {activePhase === 'after' && (
          <AfterPhase
            state={state}
            onChange={updateState}
            assessments={activeAssessments}
          />
        )}
      </div>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 py-4 px-6 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="text-sm text-slate-500">
            {state.schemeId ? (
              <span className="text-green-600">已选模板：{state.title || '未命名'}</span>
            ) : (
              <span className="text-amber-600">请先选择方案模板</span>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              取消
            </button>
            <button
              onClick={() => handleSubmit('draft')}
              disabled={isSubmitting || !state.schemeId || !state.title.trim()}
              className="px-5 py-2 border border-brand-200 bg-brand-50 text-brand-700 rounded-lg text-sm font-medium hover:bg-brand-100 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" /> 保存草稿
            </button>
            <button
              onClick={() => handleSubmit('recruiting')}
              disabled={isSubmitting || !state.schemeId || !state.title.trim()}
              className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Rocket className="w-4 h-4" /> {isSubmitting ? '创建中...' : '立即发布'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
