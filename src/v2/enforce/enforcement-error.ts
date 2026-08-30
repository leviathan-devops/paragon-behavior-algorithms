export class StructuredEnforcementError extends Error {
  readonly machine: string;
  readonly detected: string;
  readonly correction: string;
  readonly evidenceRequired: boolean;
  readonly phase: 'A' | 'B';
  readonly tier: number;

  constructor(fields: {
    machine: string;
    detected: string;
    correction: string;
    evidenceRequired: boolean;
    phase: 'A' | 'B';
    tier: number;
    message?: string;
  }) {
    const msg = fields.message ?? `[${fields.machine}] tier ${fields.tier}: ${fields.detected}. ${fields.correction}`;
    super(msg);
    this.name = 'StructuredEnforcementError';
    this.machine = fields.machine;
    this.detected = fields.detected;
    this.correction = fields.correction;
    this.evidenceRequired = fields.evidenceRequired;
    this.phase = fields.phase;
    this.tier = fields.tier;
    Object.setPrototypeOf(this, StructuredEnforcementError.prototype);
  }
}
