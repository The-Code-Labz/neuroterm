import { Client as SSHClient, type SFTPWrapper } from 'ssh2';
import type { AppDatabase } from '../db/sqlite';
import { makeHostVerifier, type ResolvedConnection } from './ssh-auth';

// One-shot SFTP connections for REST file operations (list/read/write/mkdir/
// delete/rename) — file ops are far less frequent than terminal keystrokes,
// so a fresh handshake per call (a few hundred ms) is an acceptable trade
// for not having to manage a connection-pool lifecycle. The live-watch WS
// (ws/files-ws.ts) opens its own longer-lived connection separately, since
// it needs to poll repeatedly for the life of the subscription.

export class SftpAuthError extends Error {
  public readonly code: string;
  public constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function buildConnectConfig(
  db: AppDatabase,
  resolved: ResolvedConnection
): Parameters<SSHClient['connect']>[0] {
  const { host, port, username, authType } = resolved;

  const connectConfig: Parameters<SSHClient['connect']>[0] = {
    host,
    port,
    username,
    readyTimeout: 15_000,
    hostHash: 'sha256',
    hostVerifier: makeHostVerifier(db, resolved, {
      onMismatch: () => { /* surfaced via the connect() error below */ },
    }),
  };

  if (authType === 'private_key') {
    if (!resolved.privateKey) throw new SftpAuthError('NO_KEY', 'Private key not found — check saved credential');
    connectConfig.privateKey = resolved.privateKey;
    if (resolved.passphrase) connectConfig.passphrase = resolved.passphrase;
  } else {
    if (!resolved.password) throw new SftpAuthError('NO_PASSWORD', 'Password not found — check saved credential');
    connectConfig.password = resolved.password;
  }

  return connectConfig;
}

/** Open an SSH connection + SFTP subsystem, run `fn`, then always close the
 *  connection — regardless of whether `fn` resolved or rejected. */
export async function withSftp<T>(
  db: AppDatabase,
  resolved: ResolvedConnection,
  fn: (sftp: SFTPWrapper) => Promise<T>
): Promise<T> {
  const config = buildConnectConfig(db, resolved);
  const client = new SSHClient();

  try {
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      client.on('ready', () => {
        client.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)));
      });
      client.on('error', reject);
      client.connect(config);
    });

    return await fn(sftp);
  } finally {
    try { client.end(); } catch { /* ignore */ }
  }
}

/** Open a persistent SSH+SFTP connection for the life of a WS watch
 *  subscription. Caller owns the returned handle and must call `close()`. */
export async function openPersistentSftp(
  db: AppDatabase,
  resolved: ResolvedConnection
): Promise<{ sftp: SFTPWrapper; close: () => void; onError: (cb: (err: Error) => void) => void }> {
  const config = buildConnectConfig(db, resolved);
  const client = new SSHClient();

  const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
    client.on('ready', () => {
      client.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)));
    });
    client.on('error', reject);
    client.connect(config);
  });

  return {
    sftp,
    close: () => { try { client.end(); } catch { /* ignore */ } },
    onError: (cb) => client.on('error', cb),
  };
}
