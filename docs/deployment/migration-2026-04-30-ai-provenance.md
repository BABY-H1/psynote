# DB Migration Runbook · 2026-04-30 · `assessment_results.ai_provenance`

**Status**: Required before deploying main commit `1ae4195` (PR #1) or later.

**Severity**: 🟢 Low — additive nullable column, zero downtime, fully backwards compatible.

**ETA**: <10 seconds for the column add. Backfill not needed (UI has fallback).

---

## What's changing

PR #1 (`feat: 研判分流独立模块 + 候选按服务实例归档`, merged 2026-04-30) adds one column:

```sql
ALTER TABLE assessment_results
  ADD COLUMN ai_provenance jsonb;
```

- **Nullable** — existing rows stay valid with `NULL`
- **JSONB** — stores `AIProvenance` shape (model / pipeline / confidence / generated_at)
- **Backfill not needed** — frontend `<AIBadge />` falls back to a generic "AI 生成" label when `ai_provenance IS NULL`. The provenance is only written for **new** AI-authored content going forward.

## Why now

The new column is consumed at:
- `server/src/modules/assessment/triage-automation.service.ts` — writes provenance alongside recommendations
- `client/src/features/research-triage/components/TriageDetailPanel.tsx` — renders `<AIBadge />` next to AI 解读 / AI 建议

If you deploy main without applying this migration, the server will throw `column "ai_provenance" of relation "assessment_results" does not exist` on the first AI triage call after a result submission.

## Pre-check (run before migration)

```bash
# Confirm prod DB doesn't already have the column (idempotency check)
psql "$PROD_DATABASE_URL" -c "\d assessment_results" | grep -i ai_provenance
# If it returns a row, you can skip the migration step.
```

## Migration steps

The project uses `drizzle-kit push` (schema-sync) rather than journaled migrations — `server/drizzle/meta/_journal.json` is known stale. CI uses push, prod should too.

```bash
# 1. cd to server workspace
cd server

# 2. Apply with push (diffs TS schema vs DB, applies the delta)
DATABASE_URL="$PROD_DATABASE_URL" yes | npx drizzle-kit push
# PowerShell equivalent: echo y | npx drizzle-kit push
```

Expected output line:
```
[✓] Pulled schema from database
[✓] Changes applied
```

The actual SQL drizzle-kit emits:
```sql
ALTER TABLE "assessment_results" ADD COLUMN "ai_provenance" jsonb;
```

## Post-check

```bash
# 1. Verify column exists with correct type
psql "$PROD_DATABASE_URL" -c "\d assessment_results" | grep ai_provenance
# Expected: ai_provenance | jsonb |  |  |

# 2. Sanity: zero rows have provenance yet (we didn't backfill)
psql "$PROD_DATABASE_URL" -c "SELECT COUNT(*) FROM assessment_results WHERE ai_provenance IS NOT NULL;"
# Expected: 0

# 3. After deploying app + a counselor submitting a fresh assessment with AI triage,
#    the count should grow:
psql "$PROD_DATABASE_URL" -c "SELECT COUNT(*) FROM assessment_results WHERE ai_provenance IS NOT NULL;"
# Expected: > 0 after some new submissions land
```

## Rollback

If the column needs to be removed (extremely unlikely — it's nullable and backwards compatible):

```sql
ALTER TABLE assessment_results DROP COLUMN ai_provenance;
```

App-side rollback: revert merge commit `1ae4195`. The schema change is forward-compatible with the previous app version (old code ignores the column), so the rollback can be staged:
1. App rollback first → no problem (old code doesn't read the column)
2. Schema rollback later if truly needed → no problem (no FK / no view depends on it)

## Why no formal migration file?

The project's `server/drizzle/` migration journal is documented as stale (see `.github/workflows/ci.yml` comments around the `drizzle-kit push` step). The intentional approach is push-based for both CI and prod. If/when the journal gets resurrected, generate a migration via `npx drizzle-kit generate` in a dev environment first.

## Related

- PR: https://github.com/BABY-H1/psynote/pull/1
- Merge commit: `1ae4195`
- Schema diff: `server/src/db/schema.ts` — search for `ai_provenance`
- Type: `packages/shared/src/types/ai-provenance.ts` (`AIProvenance`)
