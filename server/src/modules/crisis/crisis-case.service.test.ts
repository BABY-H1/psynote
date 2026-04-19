import { describe, it, expect } from 'vitest';
import * as crisisService from './crisis-case.service.js';

/**
 * Characterization: public-API surface of the crisis-case service.
 *
 * After the split into workflow / queries / dashboard / helpers modules,
 * `crisis-case.service.ts` becomes a barrel that MUST re-export the same
 * 7 function names that its 2 call sites already depend on:
 *   - `server/src/modules/crisis/crisis-case.routes.ts`
 *   - `server/src/modules/workflow/workflow.routes.ts`
 *
 * Any accidental rename / unintentional removal fails this test instead
 * of manifesting as a runtime error in production traffic.
 */
describe('crisis-case.service — public API contract', () => {
  it('re-exports the 7 service functions consumed by routes', () => {
    const keys = [
      'createFromCandidate',
      'getCaseById',
      'getCaseByEpisode',
      'listCases',
      'updateChecklistStep',
      'submitForSignOff',
      'signOff',
      'getDashboardStats',
    ];
    for (const k of keys) {
      expect(
        typeof (crisisService as Record<string, unknown>)[k],
        `missing or wrong type: ${k}`,
      ).toBe('function');
    }
  });
});
