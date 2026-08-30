export interface MachineRule {
  id: string;
  families: unknown[];
  classify(input: unknown): unknown;
  enforce(result: unknown, phase: 'A' | 'B'): void;
  escapeHatchTool: string;
  escalationThreshold: number;
}
