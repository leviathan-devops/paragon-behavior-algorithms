// EvidencePipeline — Merkle chain on every tool execution
// Adapted from Manta v2.3. Creates tamper-evident evidence chain.

import { createHash } from 'node:crypto';
import {readFileSync, mkdirSync, appendFileSync} from 'node:fs';
import * as path from 'node:path';

interface MerkleNode {
  hash: string;
  previousHash: string | null;
  timestamp: number;
  tool: string;
  passed: boolean;
  dataHash: string;
}

export class EvidencePipeline {
  private chain: MerkleNode[] = [];
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || '.trident-build/evidence';
    this.loadChain();
  }

  // Load chain from disk on restart
  loadChain(): void {
    try {
      var filePath = path.join(process.cwd(), this.basePath, 'merkle-chain.jsonl');
      var data = readFileSync(filePath, 'utf-8');
      var lines = data.trim().split('\n').filter(function(l) { return l.length > 0; });
      for (var i = 0; i < lines.length; i++) {
        try {
          this.chain.push(JSON['parse'](lines[i]) as MerkleNode);
        } catch (e: unknown) {
          // Skip malformed lines
          console.warn(`[evidence-pipeline] malformed chain line skipped: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } catch (e: unknown) {
      // Fresh start — no chain file yet
      console.warn(`[evidence-pipeline] chain load failed (fresh start): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  record(toolName: string, data: unknown, passed: boolean): MerkleNode {
    var dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    var dataHash = createHash('sha256').update(dataStr).digest('hex').substring(0, 16);
    var previousHash = this.chain.length > 0 ? this.chain[this.chain.length - 1].hash : null;

    var nodeContent = (previousHash || 'root') + '|' + Date.now() + '|' + toolName + '|' + String(passed) + '|' + dataHash;
    var hash = createHash('sha256').update(nodeContent).digest('hex').substring(0, 16);

    var node: MerkleNode = {
      hash,
      previousHash,
      timestamp: Date.now(),
      tool: toolName,
      passed,
      dataHash,
    };

    this.chain.push(node);
    this.persist(node);
    return node;
  }

  private persist(node: MerkleNode): void {
    try {
      var dir = path.join(process.cwd(), this.basePath);
      mkdirSync(dir, { recursive: true });
      var line = JSON.stringify(node) + '\n';
      appendFileSync(path.join(dir, 'merkle-chain.jsonl'), line);
    } catch (e: unknown) {
      // Non-fatal persistence failure
      console.warn(`[evidence-pipeline] chain persist failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  getChainLength(): number { return this.chain.length; }
  getLastHash(): string | null {
    return this.chain.length > 0 ? this.chain[this.chain.length - 1].hash : null;
  }

  verifyChainIntegrity(): boolean {
    for (var i = 1; i < this.chain.length; i++) {
      if (this.chain[i].previousHash !== this.chain[i - 1].hash) return false;
    }
    return this.chain.length > 0; // Only passes if chain actually has entries
  }
}
