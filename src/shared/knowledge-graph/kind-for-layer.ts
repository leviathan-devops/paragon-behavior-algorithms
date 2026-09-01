export function kindForLayer(layerId: string): string {
  const low = layerId.toLowerCase();
  if (low.includes('r28')) return 'Gate';
  if (low.includes('r29')) return 'File';
  if (low.includes('r30')) return 'File';
  if (low.includes('r31')) return 'Container';
  if (low.includes('lexicon')) return 'Lexicon';
  if (low.includes('actor')) return 'Actor';
  if (low.includes('state-machine') || low.includes('state_machine')) return 'Machine';
  if (low.includes('engine')) return 'Engine';
  if (low.includes('adapter')) return 'Adapter';
  if (low.includes('contract')) return 'Contract';
  if (low.includes('oracle')) return 'Threshold';
  if (low.includes('stage')) return 'Gate';
  if (low.includes('provenance')) return 'SpecClause';
  if (low.includes('mpse')) return 'Threshold';
  if (low.includes('sro') || low.includes('graph') || low.includes('path') || low.includes('dead') || low.includes('cycle')) return 'Gate';
  return 'Threshold';
}
