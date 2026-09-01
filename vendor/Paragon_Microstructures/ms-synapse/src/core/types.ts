export interface V2Thresholds {
  fire: Record<string, number>;
  decayAlpha: number;
  refractorySeq: number;
}

export interface NeuronSnapshot {
  lambda: number;
  primed: boolean;
  lastAccumSeq: number;
  lastFireSeq: number;
  currentSeq: number;
}
