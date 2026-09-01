import { describe, expect, it } from 'bun:test';
import { CheckpointGate, isCheckpointPath, isSaveIntent, CHECKPOINT_GATE_ERRORS } from '../checkpoint-gate.ts';

describe('THE CHECKPOINT FIREWALL (W-PB3 — the L2 spec §2.1)', () => {
  it('the isCheckpointPath lexicon matches ALL the /checkpoints variants', () => {
    const variants = [
      '/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/Checkpoints/pending-ship-approval/src',
      'Checkpoints/pending-ship-approval/dist/index.js',
      './Checkpoints/pending-ship-approval/new-file.ts',
      'checkpoints/foo.ts',
      'CHECKPOINTS/foo.ts',
      'checkpoint/foo.ts',
      'CheckPoint/foo.ts',
      'Checkpoints/subdir/deep.ts',
    ];
    for (const v of variants) {
      expect(isCheckpointPath(v)).toBe(true);
    }
  });

  it('the isCheckpointPath does NOT match a non-checkpoint path', () => {
    expect(isCheckpointPath('/home/leviathan/src/foo.ts')).toBe(false);
    expect(isCheckpointPath('/tmp/foo.ts')).toBe(false);
    expect(isCheckpointPath('src/audit-engine/index.ts')).toBe(false);
  });

  it('the isSaveIntent lexicon matches the save signals', () => {
    expect(isSaveIntent('save the checkpoint')).toBe(true);
    expect(isSaveIntent('save checkpoint now')).toBe(true);
    expect(isSaveIntent('sync the checkpoint')).toBe(true);
    expect(isSaveIntent('save the baseline')).toBe(true);
    expect(isSaveIntent('checkpoint save')).toBe(true);
  });

  it('the isSaveIntent rejects the noise', () => {
    expect(isSaveIntent('run the build')).toBe(false);
    expect(isSaveIntent('update the docs')).toBe(false);
  });

  it('the LOCKED state blocks a checkpoint write with the hard throw', () => {
    const gate = new CheckpointGate();
    expect(() => gate.gateWrite('Checkpoints/pending-ship-approval/src')).toThrow(/CHECKPOINT_GATE_LOCKED/);
  });

  it('the save intent → UNLOCKING — the write blocks demanding the skill', () => {
    const gate = new CheckpointGate();
    gate.onChatMessage('save the checkpoint');
    expect(gate.getState()).toBe('UNLOCKING');
    expect(() => gate.gateWrite('Checkpoints/pending-ship-approval/src')).toThrow(/saving-checkpoints/);
  });

  it('the skill load → UNLOCKED — the write is allowed within the 15-min window', () => {
    const gate = new CheckpointGate();
    gate.onChatMessage('save the checkpoint');
    gate.onSkillLoaded('saving-checkpoints');
    expect(gate.getState()).toBe('UNLOCKED');
    expect(() => gate.gateWrite('Checkpoints/pending-ship-approval/src')).not.toThrow();
  });

  it('the command-level detector blocks a cp/mv/rm into a checkpoint dir while LOCKED', () => {
    const gate = new CheckpointGate();
    expect(() => gate.gateCommand('cp -r src Checkpoints/pending-ship-approval/src')).toThrow(/CHECKPOINT_GATE/);
    expect(() => gate.gateCommand('cp dist/index.js Checkpoints/pending-ship-approval/dist/index.js')).toThrow(/CHECKPOINT_GATE/);
    expect(() => gate.gateCommand('rm -rf Checkpoints/pending-ship-approval/src')).toThrow(/CHECKPOINT_GATE/);
    expect(() => gate.gateCommand('mv src Checkpoints/pending-ship-approval/')).toThrow(/CHECKPOINT_GATE/);
  });

  it('the non-checkpoint command passes', () => {
    const gate = new CheckpointGate();
    expect(() => gate.gateCommand('cp src/foo.ts /tmp/')).not.toThrow();
    expect(() => gate.gateCommand('bun build src/index.ts --outdir dist')).not.toThrow();
  });

  it('the THE-REPLAY-FIXTURES: the ACTUAL unauthorized sync commands from the session are blocked', () => {
    const gate = new CheckpointGate();
    const violations = [
      'cp -r src Checkpoints/pending-ship-approval/src',
      'cp dist/index.js Checkpoints/pending-ship-approval/dist/index.js',
      'rm -rf Checkpoints/pending-ship-approval/src',
      'mv src Checkpoints/pending-ship-approval/',
      'write Checkpoints/pending-ship-approval/new-file.ts',
      'write ./Checkpoints/pending-ship-approval/new-file.ts',
    ];
    for (const v of violations) {
      expect(() => gate.gateCommand(v)).toThrow(/CHECKPOINT_GATE/);
    }
  });

  it('the named errors are the constant surface', () => {
    expect(CHECKPOINT_GATE_ERRORS.LOCKED).toBe('CHECKPOINT_GATE_LOCKED');
    expect(CHECKPOINT_GATE_ERRORS.SKILL_REQUIRED).toBe('CHECKPOINT_GATE_SKILL_REQUIRED');
    expect(CHECKPOINT_GATE_ERRORS.TIMEOUT_LOCKED).toBe('CHECKPOINT_GATE_TIMEOUT_LOCKED');
  });
});
