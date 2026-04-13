/**
 * Migration 021: Tier rename — 套餐体系重构
 *
 * Old tiers: solo(free) / team(pro) / enterprise / platform
 * New tiers: starter(free) / growth(pro) / flagship(premium)
 *
 * Changes:
 *   - 'platform' plan → 'premium'
 *   - 'enterprise' plan → 'pro' (growth tier)
 *   - 'free' and 'pro' unchanged
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:psynote123@localhost:5432/psynote';

async function migrate() {
  const sql = postgres(DATABASE_URL);

  try {
    // Migrate 'platform' → 'premium' (旗舰版)
    const platformResult = await sql.unsafe(
      `UPDATE organizations SET plan = 'premium' WHERE plan = 'platform' RETURNING id, name`,
    );
    console.log(`  ✓ platform → premium: ${platformResult.length} orgs`);

    // Migrate 'enterprise' → 'pro' (成长版)
    // Note: both counseling orgs and enterprise orgs that had 'enterprise' plan
    // get mapped to 'pro'. The orgType (in settings) determines the org nature,
    // not the plan anymore.
    const enterpriseResult = await sql.unsafe(
      `UPDATE organizations SET plan = 'pro' WHERE plan = 'enterprise' RETURNING id, name`,
    );
    console.log(`  ✓ enterprise → pro: ${enterpriseResult.length} orgs`);

    // Verify final state
    const plans = await sql.unsafe(
      `SELECT plan, count(*) as cnt FROM organizations GROUP BY plan ORDER BY plan`,
    );
    console.log('  Final plan distribution:');
    for (const row of plans) {
      console.log(`    ${row.plan}: ${row.cnt} orgs`);
    }

    console.log('[migration-021] Done — tier names migrated');
  } catch (err) {
    console.error('[migration-021] Failed:', err);
    throw err;
  } finally {
    await sql.end();
  }
}

migrate();
