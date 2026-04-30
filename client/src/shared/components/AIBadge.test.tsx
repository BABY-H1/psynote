import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import type { AIProvenance } from '@psynote/shared';
import { AIBadge } from './AIBadge';

afterEach(() => cleanup());

const fullProvenance: AIProvenance = {
  aiGenerated: true,
  aiModel: 'claude-3-7-sonnet-20250219',
  aiPipeline: 'triage-auto',
  aiConfidence: 0.92,
  aiGeneratedAt: '2026-04-29T10:00:00.000Z',
};

describe('<AIBadge />', () => {
  it('renders the generic "AI 生成" label when no provenance is provided', () => {
    render(<AIBadge />);
    const badge = screen.getByTestId('ai-badge');
    expect(badge).toHaveTextContent('AI 生成');
    expect(badge).toHaveAttribute('aria-label', expect.stringContaining('AI 生成'));
  });

  it('exposes model and pipeline in the aria-label / title when provenance is present', () => {
    render(<AIBadge provenance={fullProvenance} />);
    const badge = screen.getByTestId('ai-badge');
    const label = badge.getAttribute('aria-label') ?? '';
    expect(label).toContain('claude-3-7-sonnet-20250219');
    expect(label).toContain('triage-auto');
  });

  it('renders confidence as a percentage when provided', () => {
    render(<AIBadge provenance={fullProvenance} />);
    // 0.92 → "92%"
    expect(screen.getByText(/92%/)).toBeInTheDocument();
  });

  it('omits the confidence percentage when not provided', () => {
    const noConf: AIProvenance = {
      aiGenerated: true,
      aiModel: 'gpt-4o',
      aiGeneratedAt: '2026-04-29T10:00:00.000Z',
    };
    render(<AIBadge provenance={noConf} />);
    const badge = screen.getByTestId('ai-badge');
    // Badge text shouldn't have a "%" anywhere if confidence missing
    expect(badge.textContent).not.toMatch(/%/);
  });

  it('uses the small size by default and accepts md size', () => {
    const { rerender } = render(<AIBadge />);
    let badge = screen.getByTestId('ai-badge');
    // sm: text-[10px]
    expect(badge.className).toMatch(/text-\[10px\]/);

    rerender(<AIBadge size="md" />);
    badge = screen.getByTestId('ai-badge');
    // md: text-xs
    expect(badge.className).toMatch(/text-xs/);
  });

  it('applies a caller-supplied className for layout integration', () => {
    render(<AIBadge className="ml-2" />);
    expect(screen.getByTestId('ai-badge').className).toMatch(/ml-2/);
  });

  it('marks reviewed AI output distinctly when aiReviewedBy is present', () => {
    const reviewed: AIProvenance = {
      ...fullProvenance,
      aiReviewedBy: {
        userId: 'u-1',
        reviewedAt: '2026-04-29T11:00:00.000Z',
        decision: 'accepted',
      },
    };
    render(<AIBadge provenance={reviewed} />);
    const badge = screen.getByTestId('ai-badge');
    // Visible label should change from "AI 生成" to indicate review.
    expect(badge.textContent).toMatch(/AI · 已审核|AI \(已审核\)|已审核/);
  });
});
