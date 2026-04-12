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

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SignJWT, importPKCS8 } from 'jose';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
// Tier → default features (mirrors packages/shared/src/types/tier.ts)
// ---------------------------------------------------------------------------
const TIER_FEATURES: Record<string, string[]> = {
  solo: ['core'],
  team: ['core', 'supervisor', 'branding'],
  enterprise: ['core', 'supervisor', 'branding', 'eap', 'audit_log', 'sso'],
  platform: ['core', 'supervisor', 'branding', 'eap', 'audit_log', 'sso', 'api'],
};

// ---------------------------------------------------------------------------
// Sign
// ---------------------------------------------------------------------------
async function main() {
  const privKeyPath = resolve(__dirname, '../src/lib/license/keys/private.pem');
  let privKeyPem: string;
  try {
    privKeyPem = readFileSync(privKeyPath, 'utf-8');
  } catch {
    console.error(`Cannot read private key at ${privKeyPath}`);
    console.error('Run: npx tsx scripts/generate-license-keypair.ts first.');
    process.exit(1);
  }

  const privateKey = await importPKCS8(privKeyPem, 'RS256');

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + months);

  const token = await new SignJWT({
    sub: orgId,
    tier,
    maxSeats,
    features: TIER_FEATURES[tier],
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer('psynote-license-server')
    .setSubject(orgId)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(privateKey);

  console.log('');
  console.log('=== License Key ===');
  console.log('');
  console.log(token);
  console.log('');
  console.log('=== License Info ===');
  console.log(`  Org ID:     ${orgId}`);
  console.log(`  Tier:       ${tier}`);
  console.log(`  Max Seats:  ${maxSeats}`);
  console.log(`  Features:   ${TIER_FEATURES[tier].join(', ')}`);
  console.log(`  Issued:     ${now.toISOString()}`);
  console.log(`  Expires:    ${expiresAt.toISOString()}`);
}

main().catch((err) => {
  console.error('Failed to issue license:', err);
  process.exit(1);
});
