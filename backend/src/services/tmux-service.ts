import { execFileSync } from 'child_process';

export interface TmuxSession {
  name: string;
  windows: number;
  created: string;
}

// tmux session names are used as literal -t/-s args to execFileSync (no shell
// involved, so no injection risk there) but are also interpolated into a
// remote command string over SSH (see ws/terminal-ws.ts) — so we still
// validate the character set at the boundary as defense in depth.
const VALID_SESSION_NAME = /^[a-zA-Z0-9_-]{1,128}$/;

export function isValidTmuxSessionName(name: unknown): name is string {
  return typeof name === 'string' && VALID_SESSION_NAME.test(name);
}

export class TmuxService {
  /**
   * Check if a tmux session exists locally
   */
  public sessionExists(name: string): boolean {
    try {
      execFileSync('tmux', ['has-session', '-t', name], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a new detached tmux session
   */
  public createSession(name: string, cols = 220, rows = 50): void {
    if (this.sessionExists(name)) return;
    execFileSync(
      'tmux',
      ['new-session', '-d', '-s', name, '-x', String(cols), '-y', String(rows)],
      { stdio: 'ignore' }
    );
  }

  /**
   * List all local tmux sessions
   */
  public listSessions(): TmuxSession[] {
    try {
      const output = execFileSync(
        'tmux',
        ['list-sessions', '-F', '#{session_name}|#{session_windows}|#{session_created}'],
        { encoding: 'utf8' }
      ).trim();

      if (!output) return [];

      return output.split('\n').map((line) => {
        const [name, windows, created] = line.split('|');
        return { name, windows: parseInt(windows || '1', 10), created: created || '' };
      });
    } catch {
      return [];
    }
  }

  /**
   * Kill a local tmux session
   */
  public killSession(name: string): void {
    try {
      execFileSync('tmux', ['kill-session', '-t', name], { stdio: 'ignore' });
    } catch {
      // already gone
    }
  }

  /**
   * Get the tmux attach command for a session (creates if not exists)
   */
  public getAttachCommand(name: string, cols = 220, rows = 50): string[] {
    this.createSession(name, cols, rows);
    return ['tmux', 'new-session', '-A', '-s', name];
  }
}
