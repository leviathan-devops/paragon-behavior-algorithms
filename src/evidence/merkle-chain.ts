import { createHash } from 'crypto';

export interface MerkleEntry {
  id: number; sessionId: string; eventType: string;
  payload: string; previousHash: string; currentHash: string; timestamp: number;
}

// Pure JS in-memory Merkle chain — no WASM, no native deps, works everywhere
export class MerkleChain {
  private entries: MerkleEntry[] = [];
  private filePath: string | null;

  constructor(filePath?: string) {
    this.filePath = filePath || null;
  }

  async append(sessionId: string, eventType: string, payload: object): Promise<MerkleEntry> {
    const previousHash = this.entries.length > 0 ? this.entries[this.entries.length - 1].currentHash : '';
    const timestamp = Date.now();
    const payloadStr = JSON.stringify(payload);
    const id = this.entries.length + 1;
    const hashInput = sessionId + eventType + payloadStr + previousHash + timestamp;
    const currentHash = createHash('sha256').update(hashInput).digest('hex');
    const entry: MerkleEntry = { id, sessionId, eventType, payload: payloadStr, previousHash, currentHash, timestamp };
    this.entries.push(entry);
    return entry;
  }

  async getLastHash(): Promise<string> {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1].currentHash : '';
  }

  async verifyChain(): Promise<{ valid: boolean; brokenAt: number | null; evidence: string }> {
    // Empty chain — trivially valid, no entries to corrupt
    if (this.entries.length === 0) {
      return { valid: this.entries.length === 0, brokenAt: null, evidence: 'Chain contains zero entries; an empty Merkle chain is trivially intact with no links or hashes to verify' };
    }
    // Verify each entry: hash integrity + chain linkage
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      // Check chain linkage: genesis entry links to empty string, all others link to predecessor
      const expectedPrevHash = i === 0 ? '' : this.entries[i - 1].currentHash;
      if (entry.previousHash !== expectedPrevHash) {
        const linkDesc = i === 0
          ? `Genesis entry id=${entry.id} must have empty previousHash but found '${entry.previousHash}' (chain root corrupt)`
          : `Entry id=${entry.id} previousHash does not match predecessor currentHash (chain linkage broken between entries ${i} and ${i - 1})`;
        return { valid: false, brokenAt: entry.id, evidence: linkDesc };
      }
      // Check hash integrity: recompute SHA-256 and compare against stored currentHash
      const hashInput = entry.sessionId + entry.eventType + entry.payload + entry.previousHash + entry.timestamp;
      const computedHash = createHash('sha256').update(hashInput).digest('hex');
      if (computedHash !== entry.currentHash) {
        return { valid: false, brokenAt: entry.id, evidence: `Recomputed SHA-256 hash for entry id=${entry.id} does not match stored currentHash (payload, eventType, sessionId, previousHash, or timestamp tampered after append)` };
      }
    }
    // Full chain walk completed without finding any corruption
    return { valid: this.entries.length > 0, brokenAt: null, evidence: `Full chain walk completed over ${this.entries.length} entries; every previousHash linkage and recomputed SHA-256 currentHash matched stored values` };
  }

  async queryBySession(sessionId: string): Promise<MerkleEntry[]> {
    return this.entries.filter((e: MerkleEntry) => e.sessionId === sessionId);
  }

  async queryByEventType(eventType: string): Promise<MerkleEntry[]> {
    return this.entries.filter((e: MerkleEntry) => e.eventType === eventType);
  }

  close(): void {}
}
