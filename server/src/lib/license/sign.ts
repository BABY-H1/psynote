/**
 * License key signing using RSA private key.
 * Used by admin API to issue licenses from the UI.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SignJWT, importPKCS8 } from 'jose';
import { TIER_FEATURES, type OrgTier } from '@psynote/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

let privateKeyPromise: ReturnType<typeof importPKCS8> | null = null;

function getPrivateKey() {
  if (!privateKeyPromise) {
    const pemPath = resolve(__dirname, 'keys/private.pem');
    try {
      const pem = readFileSync(pemPath, 'utf-8');
      privateKeyPromise = importPKCS8(pem, 'RS256');
    } catch {
      privateKeyPromise = Promise.reject(new Error('License private key not found'));
    }
  }
  return privateKeyPromise;
}

export interface SignLicenseParams {
  orgId: string;
  tier: OrgTier;
  maxSeats: number;
  months: number;
}

export interface SignLicenseResult {
  token: string;
  issuedAt: string;
  expiresAt: string;
  tier: OrgTier;
  maxSeats: number;
  features: string[];
}

export interface SignLicenseWithExpiryParams {
  orgId: string;
  tier: OrgTier;
  maxSeats: number;
  expiresAt: Date;
}

/**
 * Re-sign a license with updated tier/seats while preserving the original expiry date.
 * Used by the "modify" action in the admin license routes.
 */
export async function signLicenseWithExpiry(params: SignLicenseWithExpiryParams): Promise<SignLicenseResult> {
  const privateKey = await getPrivateKey();
  const now = new Date();
  const features = Array.from(TIER_FEATURES[params.tier] ?? TIER_FEATURES.starter);

  const token = await new SignJWT({
    sub: params.orgId,
    tier: params.tier,
    maxSeats: params.maxSeats,
    features,
    issuedAt: now.toISOString(),
    expiresAt: params.expiresAt.toISOString(),
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer('psynote-license-server')
    .setSubject(params.orgId)
    .setIssuedAt()
    .setExpirationTime(params.expiresAt)
    .sign(privateKey);

  return {
    token,
    issuedAt: now.toISOString(),
    expiresAt: params.expiresAt.toISOString(),
    tier: params.tier,
    maxSeats: params.maxSeats,
    features,
  };
}

export async function signLicense(params: SignLicenseParams): Promise<SignLicenseResult> {
  const privateKey = await getPrivateKey();

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + params.months);

  const features = Array.from(TIER_FEATURES[params.tier] ?? TIER_FEATURES.starter);

  const token = await new SignJWT({
    sub: params.orgId,
    tier: params.tier,
    maxSeats: params.maxSeats,
    features,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer('psynote-license-server')
    .setSubject(params.orgId)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(privateKey);

  return {
    token,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    tier: params.tier,
    maxSeats: params.maxSeats,
    features,
  };
}
