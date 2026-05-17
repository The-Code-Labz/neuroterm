import { execSync, spawn } from 'child_process';

export interface TmuxSession {
  name: string;
  windows: number;
  created: string;
}

export class TmuxService {
  /**
   * Check if a tmux session exists locally
   */
  public sessionExists(name: string): boolean {
    try {
      execSync(`tmux has-session -t ${JSON.stringify(name)} 2>/dev/null`, { stdio: 'ignore' });
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
    execSync(
      `tmux new-session -d -s ${JSON.stringify(name)} -x ${cols} -y ${rows}`,
      { stdio: 'ignore' }
    );
  }

  /**
   * List all local tmux sessions
   */
  public listSessions(): TmuxSession[] {
    try {
      const output = execSync(
        `tmux list-sessions -F '#{session_name}|#{session_windows}|#{session_created}'`,
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
      execSync(`tmux kill-session -t ${JSON.stringify(name)}`, { stdio: 'ignore' });
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
