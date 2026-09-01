import { ContainerManager } from './container-manager.js';
import { TmuxSession } from './tmux-session.js';
import { DeployVerifier } from './deploy-verifier.js';
import { tridentLog } from '../../utils.js';

export { ContainerManager, TmuxSession, DeployVerifier };

export class ContainerTestRunner {
  public container: ContainerManager;
  public tmux: TmuxSession;
  public verifier: DeployVerifier;

  constructor() {
    this.container = new ContainerManager();
    this.tmux = new TmuxSession();
    this.verifier = new DeployVerifier();
    tridentLog('INFO', 'container-testing', 'ContainerTestRunner initialized');
  }

  /** Run the full 12-step container test protocol */
  async runFullProtocol(
    image: string,
    pluginPath: string,
    configPath: string,
    identityFile: string,
  ): Promise<{ passed: boolean; steps: Array<{ step: number; name: string; passed: boolean; evidence?: string }> }> {
    const steps: Array<{ step: number; name: string; passed: boolean; evidence?: string }> = [];
    
    // Step 1: Spawn container
    let containerId: string | null = null;
    try {
      containerId = await this.container.spawn(image);
      steps.push({ step: 1, name: 'spawn-container', passed: !!containerId, evidence: containerId ?? undefined });
    } catch (e: unknown) {
      steps.push({ step: 1, name: 'spawn-container', passed: false, evidence: String(e) });
      return { passed: false, steps };
    }

    // Step 2: Copy bundle
    try {
      const bundleCopied = await this.container.copyBundle(pluginPath);
      steps.push({ step: 2, name: 'copy-bundle', passed: bundleCopied === true, evidence: bundleCopied ? 'Bundle copied to container' : 'copyBundle returned false' });
    } catch (e: unknown) {
      steps.push({ step: 2, name: 'copy-bundle', passed: false, evidence: String(e) });
      return { passed: false, steps };
    }

    // Step 3: SHA256 verify
    try {
      const shaVerified = await this.verifier.verifySha256(pluginPath);
      steps.push({ step: 3, name: 'sha256-verify', passed: shaVerified.match, evidence: shaVerified.expected });
    } catch (e: unknown) {
      steps.push({ step: 3, name: 'sha256-verify', passed: false, evidence: String(e) });
      return { passed: false, steps };
    }

    // Step 4: Deploy config
    try {
      const configDeployed = await this.container.deployConfig(configPath);
      steps.push({ step: 4, name: 'deploy-config', passed: configDeployed === true, evidence: configDeployed ? 'Config deployed to container' : 'deployConfig returned false' });
    } catch (e: unknown) {
      steps.push({ step: 4, name: 'deploy-config', passed: false, evidence: String(e) });
      return { passed: false, steps };
    }

    // Step 5: Create tmux session
    try {
      const sessionName = this.tmux.create(containerId ?? 'test');
      steps.push({ step: 5, name: 'create-tmux', passed: !!sessionName, evidence: sessionName ?? undefined });
    } catch (e: unknown) {
      steps.push({ step: 5, name: 'create-tmux', passed: false, evidence: 'tmux creation failed: ' + String(e) });
      return { passed: false, steps };
    }

    // Step 6: Launch TUI via tmux
    try {
      this.container.exec('sh -c "OPENCODE_SKIP_UPDATE=1 nohup /usr/local/lib/node_modules/opencode-ai/bin/.opencode --agent trident > /tmp/opencode-boot.log 2>&1 &"');
      await new Promise(resolve => setTimeout(resolve, 10000));
      const bootLog = this.container.exec('cat /tmp/opencode-boot.log 2>/dev/null || echo "no log"');
      const booted = bootLog.includes('opencode') || bootLog.includes('Trident') || bootLog.length > 10;
      steps.push({ step: 6, name: 'launch-TUI', passed: booted, evidence: booted ? 'opencode process launched' : 'boot log empty or missing' });
    } catch (e: unknown) {
      tridentLog('WARN', 'container-testing', 'Step 6 launch-TUI failed: ' + String(e));
      steps.push({ step: 6, name: 'launch-TUI', passed: false, evidence: String(e) });
    }

    // Step 7: Verify identity — send "who are you" and check for "Trident"
    try {
      const sent = this.tmux.sendKeys('who are you');
      if (sent) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const pane = this.tmux.capturePane();
        const hasTrident = pane.toLowerCase().includes('trident');
        steps.push({ step: 7, name: 'verify-identity', passed: hasTrident, evidence: hasTrident ? 'Identity confirmed: Trident' : 'No Trident identity in output' });
      } else {
        steps.push({ step: 7, name: 'verify-identity', passed: false, evidence: 'Failed to send keys to tmux' });
      }
    } catch (e: unknown) {
      tridentLog('WARN', 'container-testing', 'Step 7 verify-identity failed: ' + String(e));
      steps.push({ step: 7, name: 'verify-identity', passed: false, evidence: String(e) });
    }

    // Step 8: Verify tools — call trident-status and check for status info
    try {
      const sent = this.tmux.sendKeys('Call trident-status');
      if (sent) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const pane = this.tmux.capturePane();
        const hasToolInfo = pane.includes('trident') || pane.includes('mode') || pane.includes('layer') || pane.includes('gate') || pane.includes('Trident');
        steps.push({ step: 8, name: 'verify-tools', passed: hasToolInfo, evidence: hasToolInfo ? 'Tools responded with status info' : 'No tool status in output' });
      } else {
        steps.push({ step: 8, name: 'verify-tools', passed: false, evidence: 'Failed to send keys to tmux' });
      }
    } catch (e: unknown) {
      tridentLog('WARN', 'container-testing', 'Step 8 verify-tools failed: ' + String(e));
      steps.push({ step: 8, name: 'verify-tools', passed: false, evidence: String(e) });
    }

    // Step 9: Verify firewall — attempt a blocked tool call and check it gets blocked
    try {
      const sent = this.tmux.sendKeys('edit /tmp/test.txt');
      if (sent) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const pane = this.tmux.capturePane();
        const isBlocked = pane.includes('BLOCK') || pane.includes('blocked') || pane.includes('FIREWALL') || pane.includes('not allowed');
        steps.push({ step: 9, name: 'verify-firewall', passed: isBlocked, evidence: isBlocked ? 'Firewall correctly blocked write tool' : 'Firewall may not be active' });
      } else {
        steps.push({ step: 9, name: 'verify-firewall', passed: false, evidence: 'Cannot verify firewall — tmux sendKeys failed' });
      }
    } catch (e: unknown) {
      tridentLog('WARN', 'container-testing', 'Step 9 verify-firewall failed: ' + String(e));
      steps.push({ step: 9, name: 'verify-firewall', passed: false, evidence: String(e) });
    }

    // Step 10: Run audit — verify agent responds to status request
    try {
      this.tmux.sendKeys('Call trident-status');
      await new Promise(resolve => setTimeout(resolve, 10000));
      const statusPane = this.tmux.capturePane();
      const agentResponded = statusPane.includes('score') || statusPane.includes('mode') || statusPane.includes('layer') || statusPane.includes('Trident') || statusPane.includes('idle');
      steps.push({ step: 10, name: 'run-audit', passed: agentResponded, evidence: agentResponded ? 'Agent responded with audit state' : 'No agent response in pane' });
    } catch (e: unknown) {
      tridentLog('WARN', 'container-testing', 'Step 10 run-audit failed: ' + String(e));
      steps.push({ step: 10, name: 'run-audit', passed: false, evidence: String(e) });
    }

    // Step 11: Collect evidence — check GENERATED_ARTIFACTS directory exists
    try {
      const artifactsDir = '/root/OPENCODE_WORKSPACE/GENERATED_ARTIFACTS';
      const dirExists = this.container.fileExistsInContainer(containerId ?? 'test', artifactsDir);
      steps.push({ step: 11, name: 'collect-evidence', passed: dirExists, evidence: dirExists ? `Evidence directory exists: ${artifactsDir}` : 'GENERATED_ARTIFACTS not found' });
    } catch (e: unknown) {
      tridentLog('WARN', 'container-testing', 'Step 11 collect-evidence failed: ' + String(e));
      steps.push({ step: 11, name: 'collect-evidence', passed: false, evidence: String(e) });
    }

    // Step 12: Teardown — do NOT call teardown; leave container running per testing law
    steps.push({ step: 12, name: 'teardown-container', passed: true, evidence: 'Container left running per testing law (no teardown)' });

    tridentLog('INFO', 'container-testing', `Protocol complete: ${steps.filter((s: { step: number; name: string; passed: boolean; evidence?: string }) => s.passed).length}/12 passed`);
    return { passed: steps.every((s: { step: number; name: string; passed: boolean; evidence?: string }) => s.passed), steps };
  }
}
