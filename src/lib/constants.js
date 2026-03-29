export const API_BASE_URL = 'https://dot.mindreset.tech';
export const DEFAULT_TASK_TYPE = 'loop';
export const DEFAULT_ASSET_THEME = 'mono-bot';
export const DEFAULT_MIN_REFRESH_INTERVAL_MS = 8000;
export const DEFAULT_FRAME_INTERVAL_MS = 1500;
export const DEFAULT_RESTORE_DELAY_MS = 15000;
export const DEFAULT_LOG_LEVEL = 'info';

export const RUN_STATES = Object.freeze({
  STARTING: 'starting',
  RUNNING: 'running',
  WAITING_INPUT: 'waiting_input',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

export const TERMINAL_STATES = new Set([
  RUN_STATES.COMPLETED,
  RUN_STATES.FAILED,
  RUN_STATES.CANCELLED
]);

export const WAITING_INPUT_PATTERNS = [
  /waiting for input/i,
  /waiting for your response/i,
  /requires your approval/i,
  /trust the contents of this directory/i,
  /do you trust/i,
  /allow command/i,
  /review and confirm/i,
  /confirm (?:to )?continue/i,
  /approve(?:d| once)?/i,
  /press enter/i,
  /press any key/i,
  /select an option/i,
  /choose an option/i,
  /\b(?:y\/n|yes\/no)\b/i,
  /input required/i,
  /permission required/i,
  /waiting for confirmation/i,
  /continue\?/i,
  /^>\s*$/m
];
