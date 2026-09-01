/**
 * DEPLOYMENT MANIFEST GENERATOR
 *
 * Produces exact file copy instructions for container deployment.
 * Eliminates "missing dist files in container" class of bugs.
 */

import { AuditFinding, AuditResult } from './types.ts';
// FINDING #8 FIX: Import centralized config for consistent version references
import { TRIDENT_CONFIG } from '../config.js';

export function generateDeploymentManifest(
  result: AuditResult,
  projectName: string,
  agentName: string,
  binPath: string
): string {
  const safeProjectName = projectName.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
  const hasDistIssue = result.findings.some((f: AuditFinding) => f.layer === 'R0' || f.layer === 'R5');
  const hasIdentityIssue = result.findings.some((f: AuditFinding) => f.layer === 'R1' || f.layer === 'R12');
  const hasConfigIssue = result.findings.some((f: AuditFinding) => f.layer === 'R7');

  const pluginBase = `/root/.config/opencode/plugins/${safeProjectName}`;

  let manifest = `# DEPLOYMENT MANIFEST\n\n`;
  manifest += `**Project:** ${safeProjectName}\n`;
  manifest += `**Agent:** ${agentName}\n`;
  manifest += `**Score:** ${result.score}/100 — ${result.grade}\n\n`;

  if (hasDistIssue || hasConfigIssue || hasIdentityIssue) {
    manifest += `## Required Fixes Before Deployment\n\n`;
    for (const f of result.findings.filter((f: AuditFinding) => f.severity === 'CRITICAL')) {
      manifest += `- [ ] [${f.layer}] ${f.file}:${f.line} — ${f.description}\n`;
    }
    manifest += `\n`;
  }

  manifest += `## Container Deployment\n\n`;
  manifest += `### Prerequisites\n`;
  manifest += `- Docker image: \`${TRIDENT_CONFIG.containerImage}\`\n`;
  manifest += `- Binary: \`${binPath}\`\n`;
  manifest += `- Test runner: \`tmux\` (apt install tmux)\n\n`;

  manifest += `### Files to Deploy\n\n`;
  manifest += `| Source | Destination in Container |\n`;
  manifest += `|--------|------------------------|\n`;
  manifest += `| \`dist/index.js\` | \`${pluginBase}/dist/\` |\n`;
  manifest += `| \`dist/index.js.map\` | \`${pluginBase}/dist/\` |\n`;

  if (hasIdentityIssue) {
    manifest += `| \`identity/TRIDENT.md\` | \`${pluginBase}/identity/trident/\` |\n`;
    manifest += `| \`identity/IDENTITY.md\` | \`${pluginBase}/identity/trident/\` |\n`;
  }

  manifest += `\n### Config Template\n\n`;
  manifest += `\`\`\`json\n`;
  manifest += `{\n`;
  manifest += `  "model": "muse-spark-1.2-contributor",\n`;
  manifest += `  "provider": {\n`;
  manifest += `    "opencode": {\n`;
  manifest += `      "npm": "@ai-sdk/openai-compatible",\n`;
  manifest += `      "options": {\n`;
  manifest += `        "baseURL": "https://api.deepseek.com/v1"\n`;
  manifest += `      }\n`;
  manifest += `    }\n`;
  manifest += `  },\n`;
  manifest += `  "plugin": ["file://${pluginBase}/dist/index.js"],\n`;
  manifest += `  "agent": {\n`;
  manifest += `    "${agentName}": {\n`;
  manifest += `      "name": "${agentName}",\n`;
  manifest += `      "mode": "primary",\n`;
  manifest += `      "tools": {}\n`;
  manifest += `    }\n`;
  manifest += `  },\n`;
  manifest += `  "permission": {}\n`;
  manifest += `}\n`;
  manifest += `\`\`\`\n\n`;

  manifest += `### Deploy Commands\n\n`;
  manifest += `\`\`\`bash\n`;
  manifest += `PROJECT="${safeProjectName}-$(date +%m%d%H%M%S)"\n`;
  manifest += `SNAP="/tmp/snap-$PROJECT"\n`;
  manifest += `CONTAINER="test-$PROJECT"\n\n`;
  manifest += `rm -rf "$SNAP"\n`;
  manifest += `mkdir -p "$SNAP/plugins/${safeProjectName}/dist"\n`;
  manifest += `cp dist/index.js "$SNAP/plugins/${safeProjectName}/dist/"\n`;
  manifest += `cp dist/index.js.map "$SNAP/plugins/${safeProjectName}/dist/"\n`;
  if (hasIdentityIssue) {
    manifest += `mkdir -p "$SNAP/plugins/${safeProjectName}/identity/trident"\n`;
    manifest += `cp identity/*.md "$SNAP/plugins/${safeProjectName}/identity/trident/" 2>/dev/null\n`;
  }
  manifest += `\n`;
  manifest += `# Create config (customize model/provider)\n`;
  manifest += `cat > "$SNAP/opencode.json" << 'EOF'\n`;
  manifest += `{\n`;
  manifest += `  "model": "muse-spark-1.2-contributor",\n`;
  manifest += `  "provider": {\n`;
  manifest += `    "opencode": {\n`;
  manifest += `      "npm": "@ai-sdk/openai-compatible",\n`;
  manifest += `      "options": {\n`;
  manifest += `        "baseURL": "https://api.deepseek.com/v1"\n`;
  manifest += `      }\n`;
  manifest += `    }\n`;
  manifest += `  },\n`;
  manifest += `  "plugin": ["file://${pluginBase}/dist/index.js"],\n`;
  manifest += `  "agent": {\n`;
  manifest += `    "${agentName}": {\n`;
  manifest += `      "name": "${agentName}",\n`;
  manifest += `      "mode": "primary",\n`;
  manifest += `      "tools": {}\n`;
  manifest += `    }\n`;
  manifest += `  },\n`;
  manifest += `  "permission": {}\n`;
  manifest += `}\n`;
  manifest += `EOF\n`;
  manifest += `\n`;
  manifest += `docker rm -f "$CONTAINER" 2>/dev/null\n`;
  manifest += `docker run -d --rm --name "$CONTAINER" --entrypoint "" \\\n`;
  manifest += `  -v "$SNAP:/root/.config/opencode" \\\n`;
  manifest += `  ${TRIDENT_CONFIG.containerImage} \\\n`;
  manifest += `  /bin/sh -c '${binPath} --agent ${agentName} 2>&1; sleep 3600'\n`;
  manifest += `\`\`\`\n`;

  manifest += `\n---\n*Generated by Trident v4.3 Runtime Grade DevOps Manager*\n`;
  return manifest;
}
