/**
 * CONTAINER TEST PLAN GENERATOR
 *
 * For the 18% of bugs that require runtime verification,
 * auto-generates executable TUI test scripts.
 */

import { AuditFinding } from './types.ts';
import { TRIDENT_CONFIG } from '../config.js';

export function generateContainerTestPlan(
  findings: AuditFinding[],
  pluginName: string,
  agentName: string
): string {
  const runtimeFindings = findings.filter((f: AuditFinding) =>
    (f.runtimeImpact || '').includes('container') ||
    (f.runtimeImpact || '').includes('TUI') ||
    (f.runtimeImpact || '').includes('runtime') ||
    f.layer === 'R1' ||
    f.layer === 'R5' ||
    f.layer === 'R12'
  );

  if (runtimeFindings.length === 0) return '';

  const project = `${pluginName}-audit-$(date +%m%d%H%M%S)`;
  const snap = `/tmp/snap-${project}`;
  const container = `test-${project}`;

  let script = `# TRIDENT v4.3 — CONTAINER TEST PLAN\n`;
  script += `# Generated: ${new Date().toISOString()}\n`;
  script += `# Project: ${pluginName} | Agent: ${agentName}\n`;
  script += `# Runtime-Required Tests: ${runtimeFindings.length}\n\n`;
  script += `---\n\n`;

  script += `## Setup\n\n`;
  script += `\`\`\`bash\n`;
  script += `PROJECT="${project}"\n`;
  script += `SNAP="${snap}"\n`;
  script += `CONTAINER="${container}"\n`;
  script += `PLUGIN="${pluginName}"\n`;
  script += `AGENT="${agentName}"\n\n`;
  script += `rm -rf "$SNAP"\n`;
  script += `mkdir -p "$SNAP/plugins/$PLUGIN/dist"\n`;
  script += `cp dist/index.js "$SNAP/plugins/$PLUGIN/dist/"\n`;
  script += `cp -r identity/ "$SNAP/plugins/$PLUGIN/identity/" 2>/dev/null || true\n\n`;
  script += `# Create opencode.json\n`;
  script += `cat > "$SNAP/opencode.json" << OPENEOL\n`;
  script += `{\n`;
  script += `  "model": "muse-spark-1.2-contributor",\n`;
  script += `  "provider": {\n`;
  script += `    "opencode": {\n`;
  script += `      "npm": "@ai-sdk/openai-compatible",\n`;
  script += `      "options": { "baseURL": "https://api.deepseek.com/v1" }\n`;
  script += `    }\n`;
  script += `  },\n`;
  script += `  "plugin": ["file:///root/.config/opencode/plugins/$PLUGIN/dist/index.js"],\n`;  script += `  "agent": { "$AGENT": { "name": "$AGENT", "mode": "primary", "tools": {} } },\n`;
  script += `  "permission": {}\n`;
  script += `}\n`;
  script += `OPENEOL\n\n`;
  script += `docker rm -f "$CONTAINER" 2>/dev/null || true\n`;
  script += `tmux kill-session -t "$CONTAINER" 2>/dev/null || true\n\n`;
  script += `docker run -d --rm --name "$CONTAINER" --entrypoint "" \\\n`;
  script += `  -v "$SNAP:/root/.config/opencode" \\\n`;
  script += `  ${TRIDENT_CONFIG.containerImage} \\\n`;
  script += `  /bin/sh -c '${TRIDENT_CONFIG.baselineBinary} --agent $AGENT 2>&1; sleep 3600'\n\n`;
  script += `sleep 28\ndocker ps | grep "$CONTAINER" || { echo "Container died!"; exit 1; }\n`;
  script += `\`\`\`\n\n`;

  script += `## Tests\n\n`;

  script += `### Test 1: Identity Injection\n`;
  script += `\`\`\`bash\n`;
  script += `tmux new-session -d -s "$CONTAINER" \\\n`;
  script += `  "docker exec -it $CONTAINER ${TRIDENT_CONFIG.baselineBinary} --agent $AGENT 2>&1; sleep 120"\n`;
  script += `sleep 10\ntmux send-keys -t "$CONTAINER" Escape\nsleep 2\n`;
  script += `tmux send-keys -t "$CONTAINER" "who are you" Enter\nsleep 25\n`;
  script += `tmux capture-pane -t "$CONTAINER" -p | strings | grep -vE '^\\\[' | head -40\n`;
  script += `\`\`\`\n`;
  script += `**Expected:** Model responds with plugin identity (NOT "I'm opencode")\n`;
  script += `**Verifies:** R1 Hook Contract (output.system injection works)\n\n`;

  let testNum = 2;

  const hasStateMachineIssues = findings.some((f: AuditFinding) => f.layer === 'R2');
  if (hasStateMachineIssues) {
    script += `### Test ${testNum}: State Machine Completion\n`;
    script += `\`\`\`bash\n`;
    script += `tmux send-keys -t "$CONTAINER" "call trident-status" Enter\nsleep 15\n`;
    script += `tmux capture-pane -t "$CONTAINER" -p | strings | head -30\n`;
    script += `\`\`\`\n`;
    script += `**Expected:** Status shows COMPLETE or IDLE (not stuck at LAYER_IN_PROGRESS)\n`;
    script += `**Verifies:** R2 State Machine (advanceLayer() called at completion)\n\n`;
    testNum++;
  }

  const hasAsyncIssues = findings.some((f: AuditFinding) => f.layer === 'R3');
  if (hasAsyncIssues) {
    script += `### Test ${testNum}: Async Correctness\n`;
    script += `\`\`\`bash\n`;
    script += `# Run a sequence of rapid tool calls to test async handling\n`;
    script += `for i in 1 2 3; do\n`;
    script += `  tmux send-keys -t "$CONTAINER" "call trident-status" Enter\n`;
    script += `  sleep 5\n`;
    script += `done\n`;
    script += `sleep 15\n`;
    script += `tmux capture-pane -t "$CONTAINER" -p | strings | head -40\n`;
    script += `\`\`\`\n`;
    script += `**Expected:** All 3 calls yield valid output (no undefined/null)\n`;
    script += `**Verifies:** R3 Async (no fire-and-forget, no unhandled rejections)\n\n`;
    testNum++;
  }

  script += `### Test ${testNum}: Cleanup\n`;
  script += `\`\`\`bash\n`;
  script += `tmux kill-session -t "$CONTAINER" 2>/dev/null\n`;
  script += `docker kill "$CONTAINER" 2>/dev/null\n`;
  script += `rm -rf "$SNAP"\n`;
  script += `\`\`\`\n\n`;

  script += `---\n*Generated by Trident v4.3 Runtime Grade DevOps Manager*\n`;

  return script;
}
