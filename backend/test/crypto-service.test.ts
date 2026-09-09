import { describe, it, expect } from 'vitest';
import { CryptoService } from '../src/services/crypto-service';

const KEY = 'a'.repeat(32);

describe('CryptoService', () => {
  it('round-trips a value through encrypt/decrypt', () => {
    const svc = new CryptoService(KEY);
    const plaintext = 'super secret password';
    const enc = svc.encrypt(plaintext);
    expect(enc).not.toBeNull();
    expect(enc).not.toContain(plaintext);
    expect(svc.decrypt(enc)).toBe(plaintext);
  });

  it('returns null for null/undefined/empty input without throwing', () => {
    const svc = new CryptoService(KEY);
    expect(svc.encrypt(null)).toBeNull();
    expect(svc.encrypt(undefined)).toBeNull();
    expect(svc.encrypt('')).toBeNull();
    expect(svc.decrypt(null)).toBeNull();
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const svc = new CryptoService(KEY);
    const a = svc.encrypt('same value');
    const b = svc.encrypt('same value');
    expect(a).not.toBe(b);
  });

  it('rejects a key shorter than 32 characters', () => {
    expect(() => new CryptoService('too-short')).toThrow();
  });

  it('two independently-constructed services with different keys cannot decrypt each other\'s values', () => {
    const a = new CryptoService(KEY);
    const b = new CryptoService('b'.repeat(32));
    const enc = a.encrypt('secret')!;
    expect(() => b.decrypt(enc)).toThrow();
  });
});
