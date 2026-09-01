export interface LayerJson {
  id: string;
  description?: string;
  toolMatchers: Array<{
    toolName: string;
    argPatterns?: Record<string, string[]>;
  }>;
  banks: {
    descriptive: string[];
    suggestive: string[];
    substitute: string[];
    use: string[];
  };
  pbaContextBoost?: {
    families: string[];
    boostAmount: number;
  };
  enforcement: {
    tier1: string;
    tier2: string;
    tier3: string;
    tier4: string;
  };
  threshold: number;
  severity: string;
  chainRules?: Array<{
    name: string;
    description?: string;
    requires?: Array<{ tool: string; withinMs?: number }>;
    forbids?: Array<{ tool: string; withinMs?: number }>;
    violation: { layerId: string; customMessage?: string };
  }>;
}

export interface CompiledLayer {
  id: string;
  description: string;
  toolMatchers: Array<{
    toolName: string;
    argPatterns?: Record<string, RegExp[]>;
  }>;
  banks: {
    descriptive: RegExp[];
    suggestive: RegExp[];
    substitute: RegExp[];
    use: RegExp[];
  };
  pbaContextBoost?: {
    families: string[];
    boostAmount: number;
  };
  enforcement: {
    tier1: string;
    tier2: string;
    tier3: string;
    tier4: string;
  };
  threshold: number;
  severity: string;
  chainRules: Array<{
    name: string;
    description: string;
    requires?: Array<{ tool: string; withinMs?: number }>;
    forbids?: Array<{ tool: string; withinMs?: number }>;
    violation: { layerId: string; customMessage?: string };
  }>;
}

export interface LayerRegistry {
  layers: Map<string, CompiledLayer>;
  chainRules: Array<{ name: string; layerId: string; [k: string]: unknown }>;
  pbaBoosts: Array<{ layerId: string; families: string[]; boostAmount: number }>;
}

export class LoaderValidationFailedError extends Error {
  readonly missingField: string;
  constructor(missingField: string) {
    super(`LOADER_VALIDATION_FAILED: missing field '${missingField}'`);
    this.name = 'LoaderValidationFailedError';
    this.missingField = missingField;
  }
}
