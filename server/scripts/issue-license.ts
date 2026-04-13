/**
 * Issue a signed license key for a psynote organization.
 *
 * Usage:
 *   npx tsx scripts/issue-license.ts \
 *     --orgId=3241cbd8-5582-24f1-d9dd-ebbba95cb673 \
 *     --tier=enterprise \
 *     --seats=50 \
 *     --months=12
 *
 * Options:
 *   --orgId   (required)  Organization UUID
 *   --tier    (optional)  solo | team | enterprise | platform (default: team)
 *   --seats   (optional)  Max active members (default: 10)
 *   --months  (optional)  Validity in months from now (default: 12)
 *
 * Output: A compact JWT string that can be pasted into the admin UI or
 *         directly inserted into `organizations.license_key`.
 */

import { signLicense } from '../src/lib/license/sign.js';

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------
function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--(\w+)=(.+)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

const args = parseArgs();

const orgId = args.orgId;
if (!orgId) {
  console.error('Error: --orgId is required');
  process.exit(1);
}

const VALID_TIERS = ['solo', 'team', 'enterprise', 'platform'] as const;
const tier = (args.tier ?? 'team') as (typeof VALID_TIERS)[number];
if (!VALID_TIERS.includes(tier)) {
  console.error(`Error: --tier must be one of: ${VALID_TIERS.join(', ')}`);
  process.exit(1);
}

const maxSeats = Number(args.seats ?? '10');
const months = Number(args.months ?? '12');

// ---------------------------------------------------------------------------
// Sign
// ---------------------------------------------------------------------------
async function main() {
  const result = await signLicense({ orgId, tier, maxSeats, months });

  console.log('');
  console.log('=== License Key ===');
  console.log('');
  console.log(result.token);
  console.log('');
  console.log('=== License Info ===');
  console.log(`  Org ID:     ${orgId}`);
  console.log(`  Tier:       ${result.tier}`);
  console.log(`  Max Seats:  ${result.maxSeats}`);
  console.log(`  Features:   ${result.features.join(', ')}`);
  console.log(`  Issued:     ${result.issuedAt}`);
  console.log(`  Expires:    ${result.expiresAt}`);
}

main().catch((err) => {
  console.error('Failed to issue license:', err);
  process.exit(1);
});
