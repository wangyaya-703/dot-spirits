import { RUN_STATES, WAITING_INPUT_PATTERNS } from './constants.js';

const ANSI_ESCAPE_PATTERN = new RegExp(
  '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))',
  'g'
);
const CSI_ESCAPE_PATTERN = /\u001b\[[0-9;?<>]*[ -/]*[@-~]/g;
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

export class CodexStateDetector {
  constructor(extraWaitingInputPatterns = []) {
    this.currentState = RUN_STATES.STARTING;
    this.waitingPatterns = [
      ...WAITING_INPUT_PATTERNS,
      ...extraWaitingInputPatterns.map((pattern) => new RegExp(pattern, 'i'))
    ];
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

    if (!normalized.trim()) {
      return null;
    }

    const nextState = this.waitingPatterns.some((pattern) => pattern.test(normalized))
      ? RUN_STATES.WAITING_INPUT
      : RUN_STATES.RUNNING;

    return this.transition(nextState, 'output parsed');
  }

  markExit(exitCode, signal) {
    if (signal) {
      return this.transition(RUN_STATES.CANCELLED, `signal ${signal}`);
    }

    return this.transition(exitCode === 0 ? RUN_STATES.COMPLETED : RUN_STATES.FAILED, `exit ${exitCode}`);
  }

  markCancelled() {
    return this.transition(RUN_STATES.CANCELLED, 'cancelled by user');
  }

  transition(nextState, reason) {
    if (nextState === this.currentState) {
      return null;
    }

    const previousState = this.currentState;
    this.currentState = nextState;
    return { previousState, nextState, reason };
  }
}
