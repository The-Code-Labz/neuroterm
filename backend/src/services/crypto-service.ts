import crypto from 'crypto';

// Fixed application-level salt for PBKDF2. This does NOT provide per-secret
// randomness (a per-value salt isn't feasible without breaking the compact
// `iv:tag:ciphertext` storage format) — its purpose is purely to slow down
// brute-force/rainbow-table attacks against a weak CREDENTIAL_ENCRYPTION_KEY.
// Real security still comes from that key having genuine entropy
// (`openssl rand -hex 32`, as documented in .env.example).
const PBKDF2_SALT = 'neuroterm-credential-store-v2';
const PBKDF2_ITERATIONS = 210_000;

export class CryptoService {
  private readonly key: Buffer;       // v2: PBKDF2-derived
  private readonly legacyKey: Buffer; // v1: bare SHA-256 (kept only to decrypt pre-existing rows)

  public constructor(secret = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY) {
    if (!secret || secret.length < 32) {
      throw new Error('CREDENTIAL_ENCRYPTION_KEY must be set and at least 32 characters long');
    }
    this.key = crypto.pbkdf2Sync(secret, PBKDF2_SALT, PBKDF2_ITERATIONS, 32, 'sha256');
    this.legacyKey = crypto.createHash('sha256').update(secret).digest();
  }

  public encrypt(value: string | null | undefined): string | null {
    if (!value) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // v2 format — PBKDF2-derived key
    return ['v2', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
  }

  public decrypt(value: string | null | undefined): string | null {
    if (!value) return null;
    const parts = value.split(':');

    let key: Buffer;
    let ivRaw: string;
    let tagRaw: string;
    let ciphertextRaw: string;

    if (parts.length === 4 && parts[0] === 'v2') {
      // v2 rows — PBKDF2-derived key
      key = this.key;
      [, ivRaw, tagRaw, ciphertextRaw] = parts;
    } else if (parts.length === 3) {
      // v1 rows written before this fix — decrypt with the legacy raw-SHA-256
      // key so existing credentials aren't bricked by this change.
      key = this.legacyKey;
      [ivRaw, tagRaw, ciphertextRaw] = parts;
    } else {
      throw new Error('Invalid encrypted credential format');
    }

    const iv = Buffer.from(ivRaw, 'base64');
    const tag = Buffer.from(tagRaw, 'base64');
    const ciphertext = Buffer.from(ciphertextRaw, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
