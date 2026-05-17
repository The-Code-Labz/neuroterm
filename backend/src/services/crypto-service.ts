import crypto from 'crypto';

export class CryptoService {
  private readonly key: Buffer;

  public constructor(secret = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY) {
    if (!secret || secret.length < 32) {
      throw new Error('CREDENTIAL_ENCRYPTION_KEY must be set and at least 32 characters long');
    }
    this.key = crypto.createHash('sha256').update(secret).digest();
  }

  public encrypt(value: string | null | undefined): string | null {
    if (!value) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
  }

  public decrypt(value: string | null | undefined): string | null {
    if (!value) return null;
    const parts = value.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted credential format');
    const [ivRaw, tagRaw, ciphertextRaw] = parts;
    const iv = Buffer.from(ivRaw, 'base64');
    const tag = Buffer.from(tagRaw, 'base64');
    const ciphertext = Buffer.from(ciphertextRaw, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
