export class StructuredBlockError extends Error {
  public readonly layer: string;
  public readonly reason: string;
  public readonly correction: string;
  public readonly toolName: string;
  public readonly timestamp: string;

  constructor(layer: string, reason: string, correction: string, toolName: string) {
    super(`[${layer} BLOCKED] ${reason}`);
    this.name = 'StructuredBlockError';
    this.layer = layer;
    this.reason = reason;
    this.correction = correction;
    this.toolName = toolName;
    this.timestamp = new Date().toISOString();
  }
}
