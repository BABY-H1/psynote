/**
 * License key verification using RSA public key.
 *
 * The license is a JWT signed with RS256. The public key is embedded in the
 * application (public.pem), so verification works fully offline. The private
 * key never leaves the license-issuing server.
 *
 * Verification flow:
 *   1. Decode & verify RS256 signature using embedded public key
 *   2. Check expiration (`exp` claim)
 *   3. Validate issuer (`iss` === 'psynote-license-server')
 *   4. Return structured result with tier, seats, expiry
 *
 * On ANY failure → returns `{ valid: false, status, payload: null }`.
 * The caller (orgContextGuard) handles graceful degradation.
 */

import { jwtVerify, importSPKI, errors as joseErrors } from 'jose';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OrgTier, Feature } from '@psynote/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LicensePayload {
  orgId: string;
  tier: OrgTier;
  maxSeats: number;
  features?: Feature[];
  expiresAt: string;
  issuedAt?: string;
}

export type LicenseStatus = 'active' | 'expired' | 'invalid' | 'none';

export interface LicenseResult {
  valid: boolean;
  status: LicenseStatus;
  payload: LicensePayload | null;
}

// ---------------------------------------------------------------------------
// Public key (loaded once at module init)
// ---------------------------------------------------------------------------

// jose's KeyLike is the correct type for imported keys
let publicKeyPromise: ReturnType<typeof importSPKI> | null = null;

function getPublicKey() {
  if (!publicKeyPromise) {
    const pemPath = resolve(__dirname, 'public.pem');
    try {
      const pem = readFileSync(pemPath, 'utf-8');
      publicKeyPromise = importSPKI(pem, 'RS256');
    } catch {
      // If public key file is missing, all verifications will fail gracefully
      publicKeyPromise = Promise.reject(new Error('License public key not found'));
    }
  }
  return publicKeyPromise;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

const NONE_RESULT: LicenseResult = { valid: false, status: 'none', payload: null };
const INVALID_RESULT: LicenseResult = { valid: false, status: 'invalid', payload: null };
const EXPIRED_RESULT: LicenseResult = { valid: false, status: 'expired', payload: null };

/**
 * Verify a license key string. Returns a structured result that is always safe
 * to read — never throws.
 *
 * @param licenseKey  The compact JWT string, or null/undefined if no license.
 * @param orgId       The org ID to validate against (must match `sub` claim).
 */
export async function verifyLicense(
  licenseKey: string | null | undefined,
  orgId?: string,
): Promise<LicenseResult> {
  if (!licenseKey) return NONE_RESULT;

  try {
    const publicKey = await getPublicKey();

    const { payload } = await jwtVerify(licenseKey, publicKey, {
      issuer: 'psynote-license-server',
      algorithms: ['RS256'],
    });

    // Validate required claims
    const sub = payload.sub as string | undefined;
    const tier = payload.tier as OrgTier | undefined;
    const maxSeats = payload.maxSeats as number | undefined;
    const expiresAt = payload.expiresAt as string | undefined;

    if (!sub || !tier || maxSeats == null || !expiresAt) {
      return INVALID_RESULT;
    }

    // If orgId is provided, verify it matches
    if (orgId && sub !== orgId) {
      return INVALID_RESULT;
    }

    // Check custom expiration (belt-and-suspenders with JWT `exp`)
    if (new Date(expiresAt) < new Date()) {
      return {
        valid: false,
        status: 'expired',
        payload: {
          orgId: sub,
          tier,
          maxSeats,
          features: payload.features as Feature[] | undefined,
          expiresAt,
          issuedAt: payload.issuedAt as string | undefined,
        },
      };
    }

    return {
      valid: true,
      status: 'active',
      payload: {
        orgId: sub,
        tier,
        maxSeats,
        features: payload.features as Feature[] | undefined,
        expiresAt,
        issuedAt: payload.issuedAt as string | undefined,
      },
    };
  } catch (err) {
    // jose throws JWTExpired for `exp` claim
    if (err instanceof joseErrors.JWTExpired) {
      return EXPIRED_RESULT;
    }
    // Any other error (bad signature, malformed, etc.)
    return INVALID_RESULT;
  }
}
