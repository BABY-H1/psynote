/**
 * Generate RSA 2048 key pair for license signing.
 *
 * Usage:
 *   npx tsx scripts/generate-license-keypair.ts
 *
 * Output:
 *   - src/lib/license/public.pem   (shipped with the app)
 *   - src/lib/license/keys/private.pem (NEVER shipped, .gitignored)
 */

import { generateKeyPair } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB_DIR = resolve(__dirname, '../src/lib/license');
const KEYS_DIR = resolve(LIB_DIR, 'keys');

mkdirSync(KEYS_DIR, { recursive: true });

generateKeyPair(
  'rsa',
  {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  },
  (err, publicKey, privateKey) => {
    if (err) {
      console.error('Failed to generate key pair:', err);
      process.exit(1);
    }

    const pubPath = resolve(LIB_DIR, 'public.pem');
    const privPath = resolve(KEYS_DIR, 'private.pem');

    writeFileSync(pubPath, publicKey, 'utf-8');
    writeFileSync(privPath, privateKey, 'utf-8');

    console.log('RSA 2048 key pair generated:');
    console.log(`  Public key:  ${pubPath}`);
    console.log(`  Private key: ${privPath}`);
    console.log('');
    console.log('IMPORTANT: private.pem must NEVER be committed to git.');
    console.log('Add src/lib/license/keys/ to .gitignore.');
  },
);
