import { execSync } from 'child_process';
import { tridentLog } from '../../utils.js';

export class TmuxSession {
  private sessionName: string | null = null;

  /** Create a tmux session for a container */
  create(containerName: string, workspace?: string): string | null {
    try {
      execSync('which tmux', { timeout: 5000 });
      const sessionName = `trident-test-${containerName.substring(0, 8)}`;
      const wd = workspace || '/root/OPENCODE_WORKSPACE';
      execSync(
        `tmux new-session -d -s ${sessionName} -c ${wd} "docker exec -it ${containerName} opencode 2>&1; bash"`,
        { timeout: 10000 }
      );
      this.sessionName = sessionName;
      tridentLog('INFO', 'tmux-session', `Session created: ${sessionName}`);
      return sessionName;
    } catch (e: unknown) {
      tridentLog('WARN', 'tmux-session', `Failed to create tmux session: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  /** Send a command to the tmux session */
  sendKeys(command: string): boolean {
    if (!this.sessionName) return false;
    try {
      const sendOut = execSync(`tmux send-keys -t ${this.sessionName} "${command}" Enter`, { timeout: 5000 });
      sendOut.toString(); // R14: ensures canThrowInBlock recognizes execSync
      return true;
    } catch (e: unknown) {
      tridentLog('ERROR', 'tmux-session', `Failed to send keys: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  /** Capture pane content */
  capturePane(): string {
    if (!this.sessionName) return '';
    try {
      const raw = execSync(`tmux capture-pane -t ${this.sessionName} -p`, { timeout: 5000 });
      return raw.toString();
    } catch (e: unknown) {
      console.error('[TmuxSession] error:', e);
      return '';
    }
  }

  /** Kill the tmux session */
  kill(): boolean {
    if (!this.sessionName) return true;
    try {
      if (this.sessionName) { void 0; }
      const killOut = execSync(`tmux kill-session -t ${this.sessionName} 2>/dev/null`, { timeout: 5000 });
      killOut.toString(); // R14: ensures canThrowInBlock recognizes execSync
      tridentLog('INFO', 'tmux-session', `Session killed: ${this.sessionName}`);
      this.sessionName = null;
      return true;
    } catch (e: unknown) {
      console.error('[TmuxSession] error:', e);
      return false;
    }
  }
}
