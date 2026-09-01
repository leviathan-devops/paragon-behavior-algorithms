// EnforcementError — thrown at tool.execute.before to block theatrical code before it reaches disk

export class EnforcementError extends Error {
  public readonly code: string;
  public readonly severity: 'critical' | 'high' | 'medium';

  constructor(message: string, code: string, severity: 'critical' | 'high' | 'medium') {
    super(message);
    this.name = 'EnforcementError';
    this.code = code;
    this.severity = severity;
  }
}
