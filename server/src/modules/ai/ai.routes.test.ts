import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { aiRoutes } from './ai.routes.js';

/**
 * Characterization test — route registration snapshot.
 *
 * This test captures the full set of routes registered by `aiRoutes()`. The
 * snapshot is the contract we preserve across the upcoming module split.
 * If a refactor accidentally drops, renames, or re-methods any endpoint,
 * this test fails with a clean diff.
 *
 * Registration is cheap (no DB, no HTTP); we only inspect what's added.
 */
describe('aiRoutes — route registration contract', () => {
  it('registers the expected set of (method, path) pairs', async () => {
    const app = Fastify();
    const collected: Array<{ method: string; path: string }> = [];

    app.addHook('onRoute', (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const m of methods) {
        collected.push({ method: String(m).toUpperCase(), path: route.url });
      }
    });

    await app.register(aiRoutes);
    await app.ready();
    await app.close();

    const sorted = collected
      .map(({ method, path }) => `${method} ${path}`)
      .sort();

    expect(sorted).toEqual([
      'POST /analyze-material',
      'POST /analyze-material-formatted',
      'POST /analyze-session',
      'POST /case-progress-report',
      'POST /client-summary',
      'POST /configure-screening-rules',
      'POST /create-agreement-chat',
      'POST /create-course-chat',
      'POST /create-goal-chat',
      'POST /create-note-template-chat',
      'POST /create-scale-chat',
      'POST /create-scheme-chat',
      'POST /extract-agreement',
      'POST /extract-course',
      'POST /extract-goal',
      'POST /extract-note-template',
      'POST /extract-scale',
      'POST /extract-scheme',
      'POST /generate-course-blueprint',
      'POST /generate-lesson-block',
      'POST /generate-lesson-blocks',
      'POST /generate-scheme',
      'POST /generate-scheme-overall',
      'POST /generate-session-detail',
      'POST /groups/poster-copy',
      'POST /interpret-result',
      'POST /note-guidance-chat',
      'POST /progress-report',
      'POST /recommendations',
      'POST /referral-summary',
      'POST /refine',
      'POST /refine-course-blueprint',
      'POST /refine-lesson-block',
      'POST /refine-scheme-overall',
      'POST /refine-session-detail',
      'POST /risk-assess',
      'POST /simulated-client',
      'POST /suggest-treatment-plan',
      'POST /supervision',
      'POST /triage',
    ]);
  });

  it('registers exactly 40 endpoints (no drift)', async () => {
    const app = Fastify();
    let count = 0;
    app.addHook('onRoute', () => { count++; });
    await app.register(aiRoutes);
    await app.ready();
    await app.close();
    expect(count).toBe(40);
  });
});
