import React, { useState, useRef, useEffect } from 'react';
import type { AssessmentBlock, ScreeningRules } from '@psynote/shared';
import { useScale } from '../../../../api/useScales';
import { useConfigureScreeningRules } from '../../../../api/useAI';
import { Sparkles, Loader2, Send, Check } from 'lucide-react';

interface Props {
  assessmentType: string;
  blocks: AssessmentBlock[];
  scales: { id: string; title: string }[];
  rules: ScreeningRules;
  onRulesChange: (rules: ScreeningRules) => void;
}

export function ScreeningRulesStep({ assessmentType, blocks, scales, rules, onRulesChange }: Props) {
  const chatMutation = useConfigureScreeningRules();
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [rulesGenerated, setRulesGenerated] = useState(rules.enabled);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scaleIds = blocks.filter((b) => b.type === 'scale' && b.scaleId).map((b) => b.scaleId!);
  const scaleQueries = scaleIds.map((id) => useScale(id));
  const fullScales = scaleQueries.filter((q) => q.data).map((q) => q.data!);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const typeLabel = assessmentType === 'screening' ? '筛查' : '入组筛选';

  const sendMessage = () => {
    const text = input.trim();
    if (!text || chatMutation.isPending) return;

    const userMsg = { role: 'user' as const, content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');

    const context = {
      assessmentType,
      scales: fullScales.map((s) => ({
        id: s.id,
        title: s.title,
        dimensions: (s.dimensions || []).map((d) => ({
          id: d.id, name: d.name,
          rules: d.rules?.map((r) => ({ minScore: Number(r.minScore), maxScore: Number(r.maxScore), label: r.label, riskLevel: r.riskLevel })),
        })),
        items: (s.items || []).map((it) => ({
          id: it.id, text: it.text, options: it.options as { label: string; value: number }[],
        })),
      })),
    };

    chatMutation.mutate({ messages: updated, context }, {
      onSuccess: (data) => {
        if (data.type === 'rules') {
          onRulesChange(data.rules as ScreeningRules);
          setRulesGenerated(true);
          setMessages((prev) => [...prev, { role: 'assistant', content: data.summary }]);
        } else {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]);
        }
      },
      onError: () => {
        setMessages((prev) => [...prev, { role: 'assistant', content: '抱歉，出现了错误，请重试。' }]);
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-5 h-5 text-amber-500" />
        <h3 className="font-semibold text-slate-900">AI 配置{typeLabel}规则</h3>
      </div>
      <p className="text-sm text-slate-500">
        与 AI 对话描述你的{typeLabel}标准，AI 会根据量表信息生成结构化规则。
      </p>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 h-72 overflow-y-auto space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-slate-400 text-center py-8">
            描述你的{typeLabel}需求，如"总分超过15分标记为高风险"或"第9题选2及以上需要关注"
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === 'user' ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-700'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-sm text-slate-400 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> AI 分析中...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder={`描述${typeLabel}条件...`}
          className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          disabled={chatMutation.isPending}
        />
        <button onClick={sendMessage} disabled={!input.trim() || chatMutation.isPending} className="px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-500 disabled:opacity-50">
          <Send className="w-4 h-4" />
        </button>
      </div>

      {rulesGenerated && rules.conditions.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700 mb-2">
            <Check className="w-4 h-4" />
            <span className="text-sm font-medium">规则已生成 ({rules.conditions.length} 条，逻辑: {rules.logic})</span>
          </div>
          <div className="space-y-1">
            {rules.conditions.map((c, i) => (
              <div key={c.id || i} className="text-xs text-green-800 bg-green-100 rounded px-2 py-1">
                {c.targetLabel || c.type} {c.operator} {c.value} → {c.flagLabel || c.flag}
              </div>
            ))}
          </div>
          <p className="text-xs text-green-600 mt-2">可继续对话修改规则，或点击下一步继续。</p>
        </div>
      )}

      {!rulesGenerated && (
        <button
          onClick={() => { onRulesChange({ enabled: false, conditions: [], logic: 'OR' }); }}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          跳过规则配置
        </button>
      )}
    </div>
  );
}
