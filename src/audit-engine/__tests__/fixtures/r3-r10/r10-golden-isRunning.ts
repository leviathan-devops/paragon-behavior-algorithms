// R10 GOLDEN — must STAY SILENT: isRunning guard referenced only by xstate machine transition (FORENSIC §2.7)
export function isRunning(): boolean { return true; }
export const machine = {
  states: { idle: { on: { START: { target: 'running', guard: isRunning } } } },
  guards: { isRunning },
};
