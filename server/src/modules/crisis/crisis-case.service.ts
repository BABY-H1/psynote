/**
 * Crisis case service — public barrel.
 *
 * The actual implementation is split across 4 modules:
 *   - `./crisis-case.workflow.ts`   — state machine (create / step / sign-off)
 *   - `./crisis-case.queries.ts`    — read-only lookups
 *   - `./crisis-dashboard.service.ts` — SQL aggregations for analytics
 *   - `./crisis-helpers.ts`         — types, row converter, notification fan-out
 *
 * This file stays under the same filename so existing call sites
 * (`import * as crisisService from './crisis-case.service.js'` in
 * crisis-case.routes.ts + workflow.routes.ts) keep working without diff.
 *
 * The public API (7 functions) is contract-tested by
 * `./crisis-case.service.test.ts`.
 */
export {
  createFromCandidate,
  updateChecklistStep,
  submitForSignOff,
  signOff,
} from './crisis-case.workflow.js';

export {
  getCaseById,
  getCaseByEpisode,
  listCases,
} from './crisis-case.queries.js';

export { getDashboardStats } from './crisis-dashboard.service.js';
