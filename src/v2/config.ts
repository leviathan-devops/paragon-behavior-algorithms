// src/v2/config.ts — THE ENFORCEMENT DIAL (spec §2.9)
// DEAD CODE DELETED per CM4 (2026-08-26): resolveV2Level / verbsAvailable had zero callers (grep-verified).
// V2Level remains as the canonical level type; the live dial lives in shared-state.ts (TRIDENT_V2_LEVEL).
export type V2Level = 'OFF' | 'STEER' | 'FULL';
