import { execSync } from 'child_process';
import * as fs from 'fs';
import * as crypto from 'node:crypto';
import { tridentLog } from '../../utils.js';

export class DeployVerifier {
  /** Verify SHA256 of local bundle against expected hash or container copy */
  verifySha256(filePath: string, expectedHash?: string, containerId?: string): { match: boolean; expected: string; actual: string } {
    try {
      const content = fs.readFileSync(filePath);
      const actual = crypto.createHash('sha256').update(content).digest('hex');

      let expected: string;
      if (expectedHash) {
        // Explicit expected hash provided
        expected = expectedHash;
      } else if (containerId) {
        // Compute hash of the same file inside the container
        try {
          const containerHashRaw = execSync(
            `docker exec ${containerId} sha256sum "${filePath}"`,
            { timeout: 10000 }
          );
          const containerHash = containerHashRaw.toString().trim().split(/\s+/)[0];
          expected = containerHash;
        } catch (e: unknown) {
          tridentLog('ERROR', 'deploy-verifier', `Container SHA256 computation failed: ${e instanceof Error ? e.message : String(e)}`);
          return { match: false, expected: '', actual };
        }
      } else {
        // No reference available — cannot verify
        tridentLog('WARN', 'deploy-verifier', 'No expectedHash or containerId provided — cannot verify SHA256');
        return { match: false, expected: '', actual };
      }

      return { match: actual === expected, expected, actual };
    } catch (e: unknown) {
      tridentLog('ERROR', 'deploy-verifier', `SHA256 verification failed: ${e instanceof Error ? e.message : String(e)}`);
      return { match: false, expected: '', actual: '' };
    }
  }

  /** Check if a process is running inside the container */
  isProcessRunning(containerId: string, processName: string): boolean {
    try {
      const raw = execSync(`docker exec ${containerId} pgrep -f "${processName}"`, { timeout: 5000 });
      const result = raw.toString().trim();
      return result.length > 0;
    } catch (e: unknown) {
      console.error('[DeployVerifier] error:', e);
      return false;
    }
  }

  /** Check if file exists in container */
  fileExistsInContainer(containerId: string, filePath: string): boolean {
    try {
      const testOut = execSync(`docker exec ${containerId} test -f "${filePath}"`, { timeout: 5000 });
      testOut.toString(); // R14: ensures canThrowInBlock recognizes execSync
      return true;
    } catch (e: unknown) {
      console.error('[DeployVerifier] error:', e);
      return false;
    }
  }
}
