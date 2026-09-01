import * as os from 'os';
import * as path from 'path';

const CONFIG_BASE = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
const NODE_MODULES_BASE = process.env.TRIDENT_NODE_MODULES_BASE || '/usr/local/lib/node_modules';

export const TRIDENT_CONFIG = {
  containerImage: process.env.TRIDENT_CONTAINER_IMAGE || 'opencode-test:1.14.34',
  baselineBinary: process.env.TRIDENT_BASELINE_BINARY || path.join(NODE_MODULES_BASE, 'opencode-ai/node_modules/opencode-linux-x64-baseline/bin/opencode'),
  configBase: CONFIG_BASE,
  pluginsDir: path.join(CONFIG_BASE, 'opencode', 'plugins'),
  version: '4.4.2',
  debug: Boolean(process.env.TRIDENT_DEBUG ?? ''),
  logPath: process.env.TRIDENT_LOG_PATH || '',
  artifactsBase: process.env.TRIDENT_ARTIFACTS_BASE || path.join(os.homedir(), 'OPENCODE_WORKSPACE', 'Shared Workspace Context', 'Trident_Agent', 'GENERATED_ARTIFACTS'),

  // Poseidon Mode settings
  poseidonMaxCycles: 50,
  poseidonScoreTarget: 96,
  poseidonStallThreshold: 2,
  poseidonTimeout: 300000,
};

export const POSEIDON_CONFIG = {
  maxCycles: 50,
  scoreTarget: 96,
  stallThreshold: 2,
  evidencePassRate: 0.96,
  confidenceFloor: 0.85,
  
  timeouts: {
    audit: 600000,         // 10 minutes (async, continues when done — not 1 hour)
    vlm: 300000,           // 5 minutes
    vlmHealth: 5000,       // 5 seconds
    circuitBreakerWindow: 600000,  // 10 minutes
    circuitBreakerReset: 300000,   // 5 minutes
    pollInterval: 5000,    // 5 seconds
    gitCommand: 30000,     // 30 seconds
  },
  
  concurrency: {
    tokenBucketCapacity: 600,
    tokenBucketRefill: 100,
    maxConsecutiveFailures: 5,
    restartDelay: 1000,
  },
  
  contextBridge: {
    t1Budget: 5000,
    t2Budget: 40000,
    t1RatioEarly: 0.70,
    t1RatioMid: 0.60,
    t1RatioLate: 0.50,
    milestoneScoreImprovement: 10,
  },
  
  canonDocs: {
    enabled: true,
    baseDir: '.trident/god-loop/canon',
    docs: [
      'BUILD_STATE.md',
      'TASK_QUEUE.md', 
      'CHANGELOG.md',
      'DECISION_CHAIN.md',
      'DEBUG_LOG.md',
      'COMPACTION_SURVIVAL.md',
      'EVIDENCE_STATE.md',
      'POST_COMPACTION_PROMPT.md',
      'SOC_PRESERVATION.md',
    ],
  },

  containerTesting: {
    typeCheckCommand: 'tsc --noEmit',
    buildCommand: 'bun build src/index.ts --outdir dist --target bun --format esm --bundle',
    containerName: process.env.TRIDENT_CONTAINER_NAME || 'trident-test',
    imageName: process.env.TRIDENT_CONTAINER_IMAGE || 'runtime-grade-container-sandbox:master',
    containerTestPassThreshold: 0.96,
    tuiWaitTimeoutMs: 30000,
    tuiPollIntervalMs: 1000,
  },
} as const;
