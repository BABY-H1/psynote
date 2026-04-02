import React, { useState } from 'react';
import { useAssessment, useResults, useUpdateAssessment } from '../../../api/useAssessments';
import { useScale } from '../../../api/useScales';
import type { AssessmentResult, AssessmentBlock } from '@psynote/shared';
import {
  ArrowLeft, Link2, Copy, Check, Eye, Users, BarChart3,
  ToggleLeft, ToggleRight,
} from 'lucide-react';
import { PageLoading, RiskBadge, useToast } from '../../../shared/components';

interface Props {
  assessmentId: string;
  onClose: () => void;
}

const riskLabels: Record<string, string> = {
  level_1: '一级', level_2: '二级', level_3: '三级', level_4: '四级',
};

export function AssessmentDetail({ assessmentId, onClose }: Props) {
  const { data: assessment, isLoading } = useAssessment(assessmentId);
  const { data: results } = useResults({ assessmentId });
  const updateAssessment = useUpdateAssessment();
  const { toast } = useToast();
  const [tab, setTab] = useState<'overview' | 'results'>('overview');
  const [copied, setCopied] = useState(false);

  if (isLoading || !assessment) return <PageLoading text="加载测评详情..." />;

  const shareUrl = `${window.location.origin}/assess/${assessment.id}`;
  const blocks = (assessment.blocks || []) as AssessmentBlock[];
  const collectModeLabels: Record<string, string> = {
    anonymous: '完全匿名',
    optional_register: '可选注册',
    require_register: '必须登录',
  };

  const resultDisplay = assessment.resultDisplay as { mode: string; show: string[] } | undefined;

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast('链接已复制', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleActive = () => {
    updateAssessment.mutate({
      assessmentId: assessment.id,
      isActive: !assessment.isActive,
    }, {
      onSuccess: () => toast(assessment.isActive ? '测评已停用' : '测评已启用', 'success'),
    });
  };

  // Risk distribution from results
  const riskDist = (results || []).reduce<Record<string, number>>((acc, r) => {
    const level = r.riskLevel || 'none';
    acc[level] = (acc[level] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-slate-900 truncate">{assessment.title}</h2>
          {assessment.description && (
            <p className="text-sm text-slate-500 mt-0.5">{assessment.description}</p>
          )}
        </div>
        <button
          onClick={toggleActive}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            assessment.isActive
              ? 'bg-green-50 text-green-700 hover:bg-green-100'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          {assessment.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          {assessment.isActive ? '进行中' : '已停用'}
        </button>
      </div>

      {/* Share link */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="w-4 h-4 text-brand-600" />
          <span className="text-sm font-medium text-slate-900">公开链接</span>
        </div>
        <div className="flex gap-2">
          <input
            value={shareUrl}
            readOnly
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 select-all"
          />
          <button
            onClick={copyLink}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-500 transition flex items-center gap-1.5"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {[
          { key: 'overview' as const, label: '概览', icon: BarChart3 },
          { key: 'results' as const, label: `作答结果 (${results?.length || 0})`, icon: Users },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Config summary */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-medium text-slate-900">测评配置</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-400">收集方式</span>
                <p className="text-slate-700 font-medium">{collectModeLabels[assessment.collectMode] || assessment.collectMode}</p>
              </div>
              <div>
                <span className="text-slate-400">结果展示</span>
                <p className="text-slate-700 font-medium">
                  {resultDisplay?.mode === 'none' ? '不展示' : `自定义 (${resultDisplay?.show?.length || 0} 项)`}
                </p>
              </div>
              <div>
                <span className="text-slate-400">内容区块</span>
                <p className="text-slate-700 font-medium">{blocks.length} 个</p>
              </div>
              <div>
                <span className="text-slate-400">量表</span>
                <p className="text-slate-700 font-medium">{blocks.filter((b) => b.type === 'scale').length} 个</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-medium text-slate-900">作答统计</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-900">{results?.length || 0}</div>
                <div className="text-xs text-slate-400">已提交</div>
              </div>
              {Object.entries(riskDist).map(([level, count]) => (
                <div key={level} className="text-center">
                  <div className="text-2xl font-bold text-slate-900">{count}</div>
                  <div className="text-xs text-slate-400">{riskLabels[level] || '无风险'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'results' && (
        <div className="space-y-3">
          {!results || results.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-400">暂无作答结果</div>
          ) : (
            results.map((r) => (
              <ResultCard key={r.id} result={r} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ResultCard({ result }: { result: AssessmentResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-700">
              {result.userId ? `用户 ${result.userId.slice(0, 8)}...` : '匿名'}
            </span>
            <span className="text-xs text-slate-400">
              {new Date(result.createdAt).toLocaleString('zh-CN')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-slate-600">总分: {result.totalScore}</span>
            {result.riskLevel && <RiskBadge level={result.riskLevel} />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
          {/* Dimension scores */}
          {Object.entries(result.dimensionScores).length > 0 && (
            <div>
              <span className="text-xs text-slate-400">维度得分</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {Object.entries(result.dimensionScores).map(([dimId, score]) => (
                  <span key={dimId} className="text-xs px-2 py-1 bg-slate-50 text-slate-600 rounded">
                    {dimId.slice(0, 8)}: {score}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Demographics */}
          {Object.keys(result.demographicData || {}).length > 0 && (
            <div>
              <span className="text-xs text-slate-400">人口学信息</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {Object.entries(result.demographicData).map(([key, val]) => (
                  <span key={key} className="text-xs px-2 py-1 bg-slate-50 text-slate-600 rounded">
                    {key}: {String(val)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {result.aiInterpretation && (
            <div>
              <span className="text-xs text-slate-400">AI 解读</span>
              <p className="text-sm text-slate-600 mt-1 bg-blue-50 rounded-lg p-3">{result.aiInterpretation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
