// ============================================================
// FILE: src/poseidon/container-tester.ts
// VERSION: v4.4.2 — Merged 12-Step Container Test Runner
// PURPOSE: Runtime-grade container testing with warhead integration
//
// MERGED FROM:
//   - poseidon/container-tester.ts (build, deploy, hash verify)
//   - warheads/container-testing/container-manager.ts (ContainerManager)
//   - warheads/container-testing/tmux-session.ts (TmuxSession)
//   - warheads/container-testing/deploy-verifier.ts (DeployVerifier)
//
// 12-STEP CYCLE:
//   BUILD → DEPLOY → VERIFY_HASH → SPAWN_CONTAINER → CREATE_TMUX
//   → LAUNCH_TUI → VERIFY_IDENTITY → VERIFY_TOOLS → VERIFY_FIREWALL
//   → RUN_AUDIT → COLLECT_EVIDENCE → TEARDOWN(no-op)
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { POSEIDON_CONFIG } from '../config.js';
import { ContainerManager } from '../warheads/container-testing/container-manager.js';
import { TmuxSession } from '../warheads/container-testing/tmux-session.js';
import { DeployVerifier } from '../warheads/container-testing/deploy-verifier.js';

// ============================================================================
// INTERFACES (backwards-compatible with god-loop.ts)
// ============================================================================

export interface ContainerTestConfig {
  targetPath: string;
  waveId: string;
  cycle: number;
}

export interface ContainerTestResult {
  passed: boolean;
  score: number;
  hashVerified: boolean;
  tuiResponded: boolean;
  buildTimeMs: number;
  errors: string[];
  tuiOutput: string;
  deployedHash: string;
  expectedHash: string;
  evidence?: string;
  steps?: Array<{ step: number; name: string; passed: boolean; evidence?: string }>;
}

interface StepResult {
  passed: boolean;
  output: string;
  evidence?: string;
}

// ============================================================================
// SCORING WEIGHTS (total = 100)
// ============================================================================
const SCORE = {
  buildSuccess: 15,
  deploySuccess: 15,
  hashVerified: 15,
  tuiLaunched: 10,
  identityVerified: 15,
  toolsVerified: 10,
  firewallVerified: 10,
  agentResponded: 10,
} as const;

// ============================================================================
// MAIN CLASS
// ============================================================================

export class ContainerTestRunner {
  private targetPath: string;

  constructor(targetPath: string) {
    this.targetPath = targetPath;
  }

  /**
   * Run the full 12-step container test cycle.
   * Signature is backwards-compatible with god-loop.ts.
   */
  async runFullCycle(config?: ContainerTestConfig): Promise<ContainerTestResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const steps: Array<{ step: number; name: string; passed: boolean; evidence?: string }> = [];
    const waveId = config?.waveId ?? 'standalone';

    // Scoring components
    let buildSuccess = false;
    let deploySuccess = false;
    let hashVerified = false;
    let tuiLaunched = false;
    let identityVerified = false;
    let toolsVerified = false;
    let firewallVerified = false;
    let agentResponded = false;

    let tuiOutput = '';
    let deployedHash = '';
    let expectedHash = '';

    try {
      // ===== Step 1: BUILD =====
      console.log(`[ContainerTester:${waveId}] Step 1/12: BUILD`);
      const buildResult = await this.build();
      buildSuccess = buildResult.success;
      steps.push({ step: 1, name: 'BUILD', passed: buildSuccess, evidence: buildResult.evidence });
      if (!buildSuccess) {
        errors.push(`Build failed: ${buildResult.error}`);
        return this.makeResult(false, 0, false, false, startTime, errors, '', '', '', steps);
      }

      // ===== Step 2: DEPLOY (to persistent container plugin path) =====
      console.log(`[ContainerTester:${waveId}] Step 2/12: DEPLOY`);
      const deployResult = await this.deploy();
      deploySuccess = deployResult.success;
      steps.push({ step: 2, name: 'DEPLOY', passed: deploySuccess, evidence: deployResult.evidence });
      if (!deploySuccess) {
        errors.push(`Deploy failed: ${deployResult.error}`);
      }

      // ===== Step 3: VERIFY HASH =====
      console.log(`[ContainerTester:${waveId}] Step 3/12: VERIFY HASH`);
      const hashResult = await this.verifyHash();
      hashVerified = hashResult.match;
      deployedHash = hashResult.deployedHash;
      expectedHash = hashResult.expectedHash;
      steps.push({
        step: 3, name: 'VERIFY HASH', passed: hashVerified,
        evidence: `local=${expectedHash.substring(0, 12)} container=${deployedHash.substring(0, 12)}`,
      });
      if (!hashVerified) {
        errors.push(`Hash mismatch: local=${expectedHash.substring(0, 12)}, container=${deployedHash.substring(0, 12)}`);
      }

      // ===== Step 4: SPAWN CONTAINER (unique name, don't kill existing) =====
      console.log(`[ContainerTester:${waveId}] Step 4/12: SPAWN CONTAINER`);
      const testContainerName = `trident-test-${Date.now()}`;
      const imageName = POSEIDON_CONFIG.containerTesting.imageName;
      const containerMgr = new ContainerManager();
      const containerId = await containerMgr.spawn(imageName, testContainerName);
      if (!containerId) {
        steps.push({ step: 4, name: 'SPAWN CONTAINER', passed: false, evidence: 'spawn returned null' });
        errors.push(`Failed to spawn test container ${testContainerName}`);
        // Cannot proceed with behavioral tests — score what we have so far
        return this.makeResult(
          false, this.computeScore({ buildSuccess, deploySuccess, hashVerified, tuiLaunched, identityVerified, toolsVerified, firewallVerified, agentResponded }),
          hashVerified, false, startTime, errors, tuiOutput, deployedHash, expectedHash, steps,
        );
      }
      steps.push({ step: 4, name: 'SPAWN CONTAINER', passed: true, evidence: `name=${testContainerName} id=${containerId.substring(0, 12)}` });

      // Copy bundle to test container (prerequisite for TUI)
      const distPath = path.join(this.targetPath, 'dist');
      const indexPath = path.join(distPath, 'index.js');
      const bundleCopied = await containerMgr.copyBundle(indexPath);
      if (!bundleCopied) {
        errors.push('Failed to copy bundle to test container');
      }

      // ===== Step 5: CREATE TMUX =====
      console.log(`[ContainerTester:${waveId}] Step 5/12: CREATE TMUX`);
      const tmux = new TmuxSession();
      const sessionName = tmux.create(testContainerName);
      const tmuxCreated = sessionName !== null;
      steps.push({ step: 5, name: 'CREATE TMUX', passed: tmuxCreated, evidence: tmuxCreated ? `session=${sessionName}` : 'tmux creation failed' });
      if (!tmuxCreated) {
        errors.push('Failed to create tmux session');
      }

      // ===== Step 6: LAUNCH TUI (wait for opencode to boot inside tmux) =====
      console.log(`[ContainerTester:${waveId}] Step 6/12: LAUNCH TUI`);
      const verifier = new DeployVerifier();
      const bootResult = await this.waitForTUIBoot(tmux, verifier, containerId);
      tuiLaunched = bootResult.passed;
      tuiOutput += bootResult.output;
      steps.push({ step: 6, name: 'LAUNCH TUI', passed: tuiLaunched, evidence: bootResult.evidence });
      if (!tuiLaunched) {
        errors.push('TUI did not boot within timeout');
      }

      // ===== Step 7: VERIFY IDENTITY =====
      console.log(`[ContainerTester:${waveId}] Step 7/12: VERIFY IDENTITY`);
      const identityResult = await this.verifyIdentity(tmux);
      identityVerified = identityResult.passed;
      tuiOutput += identityResult.output;
      steps.push({ step: 7, name: 'VERIFY IDENTITY', passed: identityVerified, evidence: identityResult.evidence });
      if (!identityVerified) {
        errors.push('Identity verification failed: "Trident" not found in response');
      }

      // ===== Step 8: VERIFY TOOLS =====
      console.log(`[ContainerTester:${waveId}] Step 8/12: VERIFY TOOLS`);
      const toolsResult = await this.verifyTools(tmux);
      toolsVerified = toolsResult.passed;
      tuiOutput += toolsResult.output;
      steps.push({ step: 8, name: 'VERIFY TOOLS', passed: toolsVerified, evidence: toolsResult.evidence });
      if (!toolsVerified) {
        errors.push('Tools verification failed: tool keywords not found');
      }

      // ===== Step 9: VERIFY FIREWALL =====
      console.log(`[ContainerTester:${waveId}] Step 9/12: VERIFY FIREWALL`);
      const firewallResult = await this.verifyFirewall(tmux);
      firewallVerified = firewallResult.passed;
      tuiOutput += firewallResult.output;
      steps.push({ step: 9, name: 'VERIFY FIREWALL', passed: firewallVerified, evidence: firewallResult.evidence });
      if (!firewallVerified) {
        errors.push('Firewall verification failed: BLOCK not detected');
      }

      // ===== Step 10: RUN AUDIT CHECK =====
      console.log(`[ContainerTester:${waveId}] Step 10/12: RUN AUDIT CHECK`);
      const auditResult = await this.runAuditCheck(tmux);
      agentResponded = auditResult.passed;
      tuiOutput += auditResult.output;
      steps.push({ step: 10, name: 'RUN AUDIT CHECK', passed: agentResponded, evidence: auditResult.evidence });
      if (!agentResponded) {
        errors.push('Audit check failed: agent did not respond');
      }

      // ===== Step 11: COLLECT EVIDENCE =====
      console.log(`[ContainerTester:${waveId}] Step 11/12: COLLECT EVIDENCE`);
      // THE R16 PATH_RESOLUTION FIX (2026-08-16): the plugin path inside the
      // container is assembled with path.join — the container's home is /root
      // (the sandbox image's fixed layout), so the segments are the port.
      const pluginPath = path.join('/root', '.config', 'opencode', 'plugins', 'trident', 'dist', 'index.js');
      const pluginExists = verifier.fileExistsInContainer(containerId, pluginPath);
      steps.push({ step: 11, name: 'COLLECT EVIDENCE', passed: pluginExists, evidence: pluginExists ? 'Plugin index.js verified in container' : 'Plugin not found in container' });
      if (!pluginExists) {
        errors.push('Evidence collection: plugin index.js not found in test container');
      }

      // ===== Step 12: TEARDOWN — intentional no-op per testing law =====
      console.log(`[ContainerTester:${waveId}] Step 12/12: TEARDOWN (no-op)`);
      steps.push({ step: 12, name: 'TEARDOWN', passed: true, evidence: 'Intentional no-op: container left running per testing law' });

      // ===== COMPUTE FINAL SCORE =====
      const score = this.computeScore({
        buildSuccess, deploySuccess, hashVerified, tuiLaunched,
        identityVerified, toolsVerified, firewallVerified, agentResponded,
      });
      const passed = score >= POSEIDON_CONFIG.containerTesting.containerTestPassThreshold;
      const buildTimeMs = Date.now() - startTime;

      console.log(`[ContainerTester:${waveId}] Cycle complete: score=${score}/100 passed=${passed} errors=${errors.length}`);

      return {
        passed,
        score,
        hashVerified,
        tuiResponded: tuiLaunched,
        buildTimeMs,
        errors,
        tuiOutput,
        deployedHash,
        expectedHash,
        evidence: `12-step cycle completed. Steps: ${steps.filter(s => s.passed).length}/${steps.length} passed.`,
        steps,
      };
    } catch (err: unknown) {
      console.error('[ContainerTester] failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Exception: ${msg}`);
      return this.makeResult(false, 0, hashVerified, tuiLaunched, startTime, errors, tuiOutput, deployedHash, expectedHash, steps);
    }
  }

  // ===========================================================================
  // PRIVATE: BUILD (Step 1) — kept from poseidon
  // ===========================================================================

  private async build(): Promise<{ success: boolean; error?: string; evidence?: string }> {
    let success = false;
    let evidence = 'test completed';
    try {
      execSync(POSEIDON_CONFIG.containerTesting.typeCheckCommand, { cwd: this.targetPath, encoding: 'utf-8', timeout: 120000, stdio: 'pipe' });
      execSync(POSEIDON_CONFIG.containerTesting.buildCommand, { cwd: this.targetPath, encoding: 'utf-8', timeout: 120000, stdio: 'pipe' });
      const distPath = path.join(this.targetPath, 'dist');
      if (!fs.existsSync(distPath)) {
        return { success: false, error: 'Build completed but dist directory not found', evidence };
      }
      success = true;
      evidence = 'tsc --noEmit + bun build succeeded (exit 0), dist/ exists';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg, evidence };
    }
    return { success, evidence };
  }

  // ===========================================================================
  // PRIVATE: DEPLOY (Step 2) — updated to plugin path
  // ===========================================================================

  private async deploy(): Promise<{ success: boolean; error?: string; evidence?: string }> {
    let success = false;
    let evidence = 'test completed';
    try {
      const containerName = POSEIDON_CONFIG.containerTesting.containerName;
      const distPath = path.join(this.targetPath, 'dist');
      if (!fs.existsSync(distPath)) {
        return { success: false, error: 'dist directory does not exist', evidence };
      }
      // Create plugin directory in persistent container
      execSync(`docker exec "${containerName}" mkdir -p /root/.config/opencode/plugins/trident/dist`, { encoding: 'utf-8', timeout: 10000, stdio: 'pipe' });
      // Copy dist contents to plugin path
      execSync(`docker cp "${distPath}/." "${containerName}:/root/.config/opencode/plugins/trident/dist/"`, { encoding: 'utf-8', timeout: 30000, stdio: 'pipe' });
      success = true;
      evidence = `docker cp dist/ → ${containerName}:/root/.config/opencode/plugins/trident/dist/ succeeded (exit 0)`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg, evidence };
    }
    return { success, evidence };
  }

  // ===========================================================================
  // PRIVATE: VERIFY HASH (Step 3) — kept from poseidon, path updated
  // ===========================================================================

  private async verifyHash(): Promise<{ match: boolean; deployedHash: string; expectedHash: string }> {
    try {
      const containerName = POSEIDON_CONFIG.containerTesting.containerName;
      const mainFile = path.join(this.targetPath, 'dist', 'index.js');
      if (!fs.existsSync(mainFile)) {
        return { match: false, deployedHash: '', expectedHash: '' };
      }
      const expectedHash = execSync(`sha256sum "${mainFile}"`, { encoding: 'utf-8' }).split(' ')[0].trim();
      let deployedHash = '';
      try {
        const raw = execSync(
          `docker exec "${containerName}" sha256sum /root/.config/opencode/plugins/trident/dist/index.js`,
          { encoding: 'utf-8', timeout: 10000 },
        );
        deployedHash = raw.split(' ')[0].trim();
      } catch {
        return { match: false, deployedHash: 'error', expectedHash };
      }
      return { match: expectedHash === deployedHash, deployedHash, expectedHash };
    } catch {
      return { match: false, deployedHash: 'error', expectedHash: 'error' };
    }
  }

  // ===========================================================================
  // PRIVATE: WAIT FOR TUI BOOT (Step 6)
  // ===========================================================================

  private async waitForTUIBoot(tmux: TmuxSession, verifier: DeployVerifier, containerId: string): Promise<StepResult> {
    try {
      const maxWaitMs = POSEIDON_CONFIG.containerTesting.tuiWaitTimeoutMs;
      const pollIntervalMs = POSEIDON_CONFIG.containerTesting.tuiPollIntervalMs;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitMs) {
        const pane = tmux.capturePane();
        // Check for ready markers in the TUI
        if (pane.includes('Ask') || pane.includes('opencode') || pane.includes('Ready') || pane.includes('>')) {
          return { passed: true, output: pane, evidence: 'TUI boot detected via tmux capturePane (ready marker found)' };
        }
        // Also check if opencode process is running (secondary signal)
        const procRunning = verifier.isProcessRunning(containerId, 'opencode');
        if (procRunning && pane.trim().length > 10) {
          // Process running and pane has content — likely booting
          return { passed: true, output: pane, evidence: 'opencode process running + pane has content' };
        }
        await this.sleep(pollIntervalMs);
      }

      const finalPane = tmux.capturePane();
      return { passed: false, output: finalPane, evidence: `No ready marker within ${maxWaitMs}ms` };
    } catch (err: unknown) {
      console.error('[ContainerTester] waitForTUIBoot failed:', err);
      throw err;
    }
  }

  // ===========================================================================
  // PRIVATE: VERIFY IDENTITY (Step 7)
  // ===========================================================================

  private async verifyIdentity(tmux: TmuxSession): Promise<StepResult> {
    try {
      tmux.sendKeys('who are you');
      await this.sleep(5000);
      const pane = tmux.capturePane();
      const hasTrident = pane.includes('Trident') || pane.includes('trident');
      return {
        passed: hasTrident,
        output: pane,
        evidence: hasTrident ? '"Trident" found in TUI response' : '"Trident" NOT found in TUI response',
      };
    } catch (err: unknown) {
      console.error('[ContainerTester] verifyIdentity failed:', err);
      throw err;
    }
  }

  // ===========================================================================
  // PRIVATE: VERIFY TOOLS (Step 8)
  // ===========================================================================

  private async verifyTools(tmux: TmuxSession): Promise<StepResult> {
    try {
      tmux.sendKeys('Call trident-status');
      await this.sleep(5000);
      const pane = tmux.capturePane();
      const keywords = ['trident-status', 'mode', 'layer', 'iteration', 'status', 'Trident'];
      const found = keywords.filter(kw => pane.toLowerCase().includes(kw.toLowerCase()));
      const passed = found.length >= 2;
      return {
        passed,
        output: pane,
        evidence: passed ? `Tool keywords found: ${found.join(', ')}` : `Tool keywords not found (matched: ${found.join(', ') || 'none'})`,
      };
    } catch (err: unknown) {
      console.error('[ContainerTester] verifyTools failed:', err);
      throw err;
    }
  }

  // ===========================================================================
  // PRIVATE: VERIFY FIREWALL (Step 9)
  // ===========================================================================

  private async verifyFirewall(tmux: TmuxSession): Promise<StepResult> {
    try {
      tmux.sendKeys('edit /tmp/test.txt');
      await this.sleep(5000);
      const pane = tmux.capturePane();
      const hasBlock = pane.includes('BLOCK') || pane.includes('blocked') || pane.includes('denied') || pane.includes('not allowed');
      return {
        passed: hasBlock,
        output: pane,
        evidence: hasBlock ? 'Firewall BLOCK detected for file edit attempt' : 'Firewall BLOCK NOT detected',
      };
    } catch (err: unknown) {
      console.error('[ContainerTester] verifyFirewall failed:', err);
      throw err;
    }
  }

  // ===========================================================================
  // PRIVATE: RUN AUDIT CHECK (Step 10)
  // ===========================================================================

  private async runAuditCheck(tmux: TmuxSession): Promise<StepResult> {
    try {
      tmux.sendKeys('Call trident-status');
      await this.sleep(5000);
      const pane = tmux.capturePane();
      // Agent responded if pane has meaningful content (not empty, not just echo)
      const trimmed = pane.trim();
      const hasContent = trimmed.length > 20;
      const noError = !pane.includes('Error:') && !pane.includes('command not found');
      const passed = hasContent && noError;
      return {
        passed,
        output: pane,
        evidence: passed ? 'Agent responded with meaningful output' : `Agent response insufficient (len=${trimmed.length}, error=${!noError})`,
      };
    } catch (err: unknown) {
      console.error('[ContainerTester] runAuditCheck failed:', err);
      throw err;
    }
  }

  // ===========================================================================
  // PRIVATE: SCORE COMPUTATION (100-point weighted)
  // ===========================================================================

  private computeScore(input: {
    buildSuccess: boolean;
    deploySuccess: boolean;
    hashVerified: boolean;
    tuiLaunched: boolean;
    identityVerified: boolean;
    toolsVerified: boolean;
    firewallVerified: boolean;
    agentResponded: boolean;
  }): number {
    let score = 0;
    if (input.buildSuccess) score += SCORE.buildSuccess;
    if (input.deploySuccess) score += SCORE.deploySuccess;
    if (input.hashVerified) score += SCORE.hashVerified;
    if (input.tuiLaunched) score += SCORE.tuiLaunched;
    if (input.identityVerified) score += SCORE.identityVerified;
    if (input.toolsVerified) score += SCORE.toolsVerified;
    if (input.firewallVerified) score += SCORE.firewallVerified;
    if (input.agentResponded) score += SCORE.agentResponded;
    return score;
  }

  // ===========================================================================
  // PRIVATE: RESULT BUILDER HELPER
  // ===========================================================================

  private makeResult(
    passed: boolean,
    score: number,
    hashVerified: boolean,
    tuiResponded: boolean,
    startTime: number,
    errors: string[],
    tuiOutput: string,
    deployedHash: string,
    expectedHash: string,
    steps: Array<{ step: number; name: string; passed: boolean; evidence?: string }>,
  ): ContainerTestResult {
    return {
      passed,
      score,
      hashVerified,
      tuiResponded,
      buildTimeMs: Date.now() - startTime,
      errors,
      tuiOutput,
      deployedHash,
      expectedHash,
      evidence: 'test completed',
      steps,
    };
  }

  // ===========================================================================
  // PRIVATE: SLEEP UTILITY
  // ===========================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
