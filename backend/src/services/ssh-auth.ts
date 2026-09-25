import type { AppDatabase } from '../db/sqlite';
import type { CryptoService } from './crypto-service';

// Shared by ws/terminal-ws.ts (interactive shell) and services/sftp-client.ts
// (file explorer) — both need the same "resolve auth from connection row,
// optionally overridden by a linked credential" merge and the same TOFU
// host-key pinning behavior. Keeping this in one place means the security
// logic (host-key verification) can't drift between the two call sites.

export interface ResolvedConnection {
  id: string;
  host: string;
  port: number;
  username: string;
  authType: string;
  password: string | null;
  privateKey: string | null;
  passphrase: string | null;
  hostKeyFingerprint: string | null;
}

/** Merge a connection row with its linked credential's auth fields (if any),
 *  decrypting secrets. Mirrors the auth-resolution block previously inlined
 *  in ws/terminal-ws.ts's handleTerminalWs. */
export function resolveConnectionAuth(
  db: AppDatabase,
  crypto: CryptoService,
  connectionRow: Record<string, unknown>
): ResolvedConnection {
  let authRow: Record<string, unknown> = connectionRow;

  const credentialId = connectionRow['credential_id'] as string | null;
  if (credentialId) {
    const credential = db.prepare(`SELECT * FROM credentials WHERE id = ?`).get(credentialId) as
      | Record<string, unknown>
      | undefined;
    if (credential) {
      authRow = {
        ...connectionRow,
        auth_type: credential['auth_type'],
        password_enc: credential['password_enc'],
        private_key_enc: credential['private_key_enc'],
        passphrase_enc: credential['passphrase_enc'],
      };
    }
  }

  return {
    id: connectionRow['id'] as string,
    host: connectionRow['host'] as string,
    port: (connectionRow['port'] as number) || 22,
    username: connectionRow['username'] as string,
    authType: authRow['auth_type'] as string,
    password: crypto.decrypt(authRow['password_enc'] as string | null),
    privateKey: crypto.decrypt(authRow['private_key_enc'] as string | null),
    passphrase: crypto.decrypt(authRow['passphrase_enc'] as string | null),
    hostKeyFingerprint: connectionRow['host_key_fingerprint'] as string | null,
  };
}

export interface HostVerifierEvents {
  onNewKey?: (hashedKey: string) => void;
  onMismatch?: (hashedKey: string) => void;
}

/** TOFU (trust-on-first-use) host-key verifier for ssh2's `hostVerifier`
 *  option. First handshake pins the key to the connection row; any later
 *  handshake presenting a different key is refused. See ws/terminal-ws.ts
 *  for the rationale (no pinning = ssh2 accepts any host key by default). */
export function makeHostVerifier(
  db: AppDatabase,
  resolved: ResolvedConnection,
  events: HostVerifierEvents = {}
): (hashedKey: string) => boolean {
  return (hashedKey: string): boolean => {
    if (!resolved.hostKeyFingerprint) {
      db.prepare(`UPDATE connections SET host_key_fingerprint = ? WHERE id = ?`).run(hashedKey, resolved.id);
      events.onNewKey?.(hashedKey);
      return true;
    }
    if (hashedKey !== resolved.hostKeyFingerprint) {
      events.onMismatch?.(hashedKey);
      return false;
    }
    return true;
  };
}
