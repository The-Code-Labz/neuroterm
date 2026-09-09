import { describe, it, expect } from 'vitest';
import { isValidTmuxSessionName } from '../src/services/tmux-service';

describe('isValidTmuxSessionName', () => {
  it('accepts alphanumeric, underscore, and hyphen', () => {
    expect(isValidTmuxSessionName('neuroterm')).toBe(true);
    expect(isValidTmuxSessionName('my-session_1')).toBe(true);
  });

  it('rejects shell metacharacters (defense against remote command injection over SSH)', () => {
    expect(isValidTmuxSessionName('a; rm -rf /')).toBe(false);
    expect(isValidTmuxSessionName('a`whoami`')).toBe(false);
    expect(isValidTmuxSessionName('a$(id)')).toBe(false);
    expect(isValidTmuxSessionName('a\r\nid')).toBe(false);
    expect(isValidTmuxSessionName('a b')).toBe(false);
  });

  it('rejects empty string, non-strings, and overlong names', () => {
    expect(isValidTmuxSessionName('')).toBe(false);
    expect(isValidTmuxSessionName(undefined)).toBe(false);
    expect(isValidTmuxSessionName(123)).toBe(false);
    expect(isValidTmuxSessionName('a'.repeat(129))).toBe(false);
    expect(isValidTmuxSessionName('a'.repeat(128))).toBe(true);
  });
});
