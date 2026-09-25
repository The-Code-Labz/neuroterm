import { promises as fsp } from 'fs';
import nodePath from 'path';
import type { SFTPWrapper } from 'ssh2';

// Unifies local-filesystem and SFTP-over-SSH access behind one small
// interface so api/files.routes.ts and ws/files-ws.ts don't need to branch
// on connection mode themselves. Paths are always POSIX-style (both the
// local container and any real SSH remote are POSIX), so `nodePath.posix`
// is used even though this runs on a Linux host either way.

export type EntryType = 'file' | 'dir' | 'other';

export interface FileEntryInfo {
  name: string;
  type: EntryType;
  size: number;
  mtime: number; // epoch milliseconds
}

export interface StatInfo {
  type: EntryType;
  size: number;
  mtime: number; // epoch milliseconds
}

export interface FileBackend {
  list(path: string): Promise<FileEntryInfo[]>;
  stat(path: string): Promise<StatInfo>;
  readFile(path: string, maxBytes: number): Promise<{ buffer: Buffer; truncated: boolean }>;
  writeFile(path: string, content: Buffer): Promise<void>;
  mkdir(path: string): Promise<void>;
  removeFile(path: string): Promise<void>;
  removeDir(path: string): Promise<void>; // non-recursive; directory must be empty
  rename(oldPath: string, newPath: string): Promise<void>;
}

export function joinPath(base: string, name: string): string {
  return nodePath.posix.join(base || '/', name);
}

/** Recursively delete a file or directory tree using only the FileBackend
 *  primitives — works identically for local and SFTP backends. */
export async function removeRecursive(backend: FileBackend, path: string): Promise<void> {
  const info = await backend.stat(path);
  if (info.type === 'dir') {
    const entries = await backend.list(path);
    for (const entry of entries) {
      await removeRecursive(backend, joinPath(path, entry.name));
    }
    await backend.removeDir(path);
  } else {
    await backend.removeFile(path);
  }
}

// ─── Local backend ────────────────────────────────────────────────────────────

export function localBackend(): FileBackend {
  return {
    async list(path) {
      const entries = await fsp.readdir(path, { withFileTypes: true });
      const out: FileEntryInfo[] = [];
      for (const entry of entries) {
        const full = nodePath.posix.join(path, entry.name);
        try {
          const st = await fsp.stat(full);
          out.push({
            name: entry.name,
            type: st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'other',
            size: st.size,
            mtime: Math.floor(st.mtimeMs),
          });
        } catch {
          // Broken symlink or a race with concurrent deletion — surface it
          // as an inert entry rather than failing the whole listing.
          out.push({ name: entry.name, type: 'other', size: 0, mtime: 0 });
        }
      }
      return out;
    },

    async stat(path) {
      const st = await fsp.stat(path);
      return {
        type: st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'other',
        size: st.size,
        mtime: Math.floor(st.mtimeMs),
      };
    },

    async readFile(path, maxBytes) {
      const st = await fsp.stat(path);
      const len = Math.min(st.size, maxBytes);
      const fh = await fsp.open(path, 'r');
      try {
        const buffer = Buffer.alloc(len);
        if (len > 0) await fh.read(buffer, 0, len, 0);
        return { buffer, truncated: st.size > maxBytes };
      } finally {
        await fh.close();
      }
    },

    async writeFile(path, content) {
      await fsp.writeFile(path, content);
    },

    async mkdir(path) {
      await fsp.mkdir(path);
    },

    async removeFile(path) {
      await fsp.unlink(path);
    },

    async removeDir(path) {
      await fsp.rmdir(path);
    },

    async rename(oldPath, newPath) {
      await fsp.rename(oldPath, newPath);
    },
  };
}

// ─── SFTP backend ─────────────────────────────────────────────────────────────

function sftpReaddir(sftp: SFTPWrapper, path: string) {
  return new Promise<FileEntryInfo[]>((resolve, reject) => {
    sftp.readdir(path, (err, list) => {
      if (err) { reject(err); return; }
      resolve(
        list.map((entry) => ({
          name: entry.filename,
          type: entry.attrs.isDirectory() ? 'dir' : entry.attrs.isFile() ? 'file' : 'other',
          size: entry.attrs.size,
          mtime: entry.attrs.mtime * 1000,
        }))
      );
    });
  });
}

function sftpStat(sftp: SFTPWrapper, path: string) {
  return new Promise<StatInfo>((resolve, reject) => {
    sftp.stat(path, (err, stats) => {
      if (err) { reject(err); return; }
      resolve({
        type: stats.isDirectory() ? 'dir' : stats.isFile() ? 'file' : 'other',
        size: stats.size,
        mtime: stats.mtime * 1000,
      });
    });
  });
}

function sftpReadFile(sftp: SFTPWrapper, path: string, maxBytes: number) {
  return new Promise<{ buffer: Buffer; truncated: boolean }>((resolve, reject) => {
    const stream = sftp.createReadStream(path);
    const chunks: Buffer[] = [];
    let total = 0;
    let truncated = false;
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (err) { reject(err); return; }
      resolve({ buffer: Buffer.concat(chunks), truncated });
    };

    stream.on('data', (chunk: Buffer) => {
      if (truncated) return;
      total += chunk.length;
      if (total > maxBytes) {
        truncated = true;
        chunks.push(chunk.subarray(0, chunk.length - (total - maxBytes)));
        stream.destroy();
        finish();
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', (err: Error) => finish(err));
    stream.on('close', () => finish());
    stream.on('end', () => finish());
  });
}

function sftpWriteFile(sftp: SFTPWrapper, path: string, content: Buffer) {
  return new Promise<void>((resolve, reject) => {
    const stream = sftp.createWriteStream(path);
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (err) { reject(err); return; }
      resolve();
    };
    stream.on('error', (err: Error) => finish(err));
    stream.on('close', () => finish());
    stream.end(content);
  });
}

function sftpMkdir(sftp: SFTPWrapper, path: string) {
  return new Promise<void>((resolve, reject) => sftp.mkdir(path, (err) => (err ? reject(err) : resolve())));
}
function sftpUnlink(sftp: SFTPWrapper, path: string) {
  return new Promise<void>((resolve, reject) => sftp.unlink(path, (err) => (err ? reject(err) : resolve())));
}
function sftpRmdir(sftp: SFTPWrapper, path: string) {
  return new Promise<void>((resolve, reject) => sftp.rmdir(path, (err) => (err ? reject(err) : resolve())));
}
function sftpRename(sftp: SFTPWrapper, oldPath: string, newPath: string) {
  return new Promise<void>((resolve, reject) => sftp.rename(oldPath, newPath, (err) => (err ? reject(err) : resolve())));
}

export function sftpBackend(sftp: SFTPWrapper): FileBackend {
  return {
    list: (path) => sftpReaddir(sftp, path),
    stat: (path) => sftpStat(sftp, path),
    readFile: (path, maxBytes) => sftpReadFile(sftp, path, maxBytes),
    writeFile: (path, content) => sftpWriteFile(sftp, path, content),
    mkdir: (path) => sftpMkdir(sftp, path),
    removeFile: (path) => sftpUnlink(sftp, path),
    removeDir: (path) => sftpRmdir(sftp, path),
    rename: (oldPath, newPath) => sftpRename(sftp, oldPath, newPath),
  };
}
