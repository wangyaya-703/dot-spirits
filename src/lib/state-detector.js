import { RUN_STATES, WAITING_INPUT_PATTERNS } from './constants.js';

const ANSI_ESCAPE_PATTERN = new RegExp(
  '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))',
  'g'
);
const CSI_ESCAPE_PATTERN = /\u001b\[[0-9;?<>]*[ -/]*[@-~]/g;
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B-\u001F\u007F]/g;
const NOISE_LINE_PATTERNS = [
  /^openai codex v/i,
  /^--------$/,
  /^workdir:/i,
  /^model:/i,
  /^provider:/i,
  /^approval:/i,
  /^sandbox:/i,
  /^reasoning effort:/i,
  /^reasoning summaries:/i,
  /^session id:/i,
  /^user$/i,
  /^codex$/i,
  /^tokens used$/i
];

export class CodexStateDetector {
  constructor(extraWaitingInputPatterns = [], { runningIdleMs = 9000, completedToIdleMs = 12000 } = {}) {
    this.currentState = RUN_STATES.STARTING;
    this.waitingPatterns = [
      ...WAITING_INPUT_PATTERNS,
      ...extraWaitingInputPatterns.map((pattern) => new RegExp(pattern, 'i'))
    ];
    this.runningIdleMs = runningIdleMs;
    this.completedToIdleMs = completedToIdleMs;
    this.lastMeaningfulOutputAt = null;
    this.lastStateChangeAt = Date.now();
  }

  getState() {
    return this.currentState;
  }

  markStarted() {
    return this.transition(RUN_STATES.STARTING, 'session started');
  }

  ingest(chunk) {
    if (!chunk) {
      return null;
    }

    const normalized = chunk
      .replace(CSI_ESCAPE_PATTERN, '')
      .replace(ANSI_ESCAPE_PATTERN, '')
      .replace(CONTROL_CHAR_PATTERN, '');

    const trimmed = normalized.trim();
    if (!trimmed) {
      return null;
    }

    if (isNoiseOnlyOutput(trimmed)) {
      return null;
    }

    this.lastMeaningfulOutputAt = Date.now();

    const nextState = this.waitingPatterns.some((pattern) => pattern.test(trimmed))
      ? RUN_STATES.WAITING_INPUT
      : RUN_STATES.RUNNING;

    return this.transition(nextState, 'output parsed');
  }

  markExit(exitCode, signal) {
    if (signal) {
      if (this.currentState === RUN_STATES.IDLE) {
        return null;
      }
      return this.transition(RUN_STATES.CANCELLED, `signal ${signal}`);
    }

    if (exitCode === 0) {
      if ([RUN_STATES.RUNNING, RUN_STATES.WAITING_INPUT, RUN_STATES.STARTING].includes(this.currentState)) {
        return this.transition(RUN_STATES.COMPLETED, `exit ${exitCode}`);
      }
      return null;
    }

    return this.transition(RUN_STATES.FAILED, `exit ${exitCode}`);
  }

  markCancelled() {
    return this.transition(RUN_STATES.CANCELLED, 'cancelled by user');
  }

  poll(now = Date.now()) {
    if (this.currentState === RUN_STATES.STARTING && now - this.lastStateChangeAt >= this.runningIdleMs) {
      return this.transition(RUN_STATES.IDLE, 'startup settled without active task output');
    }

    if (
      this.currentState === RUN_STATES.RUNNING &&
      this.lastMeaningfulOutputAt &&
      now - this.lastMeaningfulOutputAt >= this.runningIdleMs
    ) {
      return this.transition(RUN_STATES.COMPLETED, 'task output settled');
    }

    if (
      this.currentState === RUN_STATES.COMPLETED &&
      now - this.lastStateChangeAt >= this.completedToIdleMs
    ) {
      return this.transition(RUN_STATES.IDLE, 'done window elapsed');
    }

    return null;
  }

  transition(nextState, reason) {
    if (nextState === this.currentState) {
      return null;
    }

    const previousState = this.currentState;
    this.currentState = nextState;
    this.lastStateChangeAt = Date.now();
    return { previousState, nextState, reason };
  }
}

function isNoiseOnlyOutput(normalized) {
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return true;
  }

  return lines.every((line) => NOISE_LINE_PATTERNS.some((pattern) => pattern.test(line)));
}
