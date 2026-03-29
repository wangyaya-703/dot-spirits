import test from 'node:test';
import assert from 'node:assert/strict';
import { CodexStateDetector } from '../src/lib/state-detector.js';
import { RUN_STATES } from '../src/lib/constants.js';

test('CodexStateDetector classifies running, waiting_input, and completion states', () => {
  const detector = new CodexStateDetector();

  const running = detector.ingest('Reading files and updating plan...');
  assert.equal(running.nextState, RUN_STATES.RUNNING);

  const waiting = detector.ingest('Action requires your approval. Continue? (y/n)');
  assert.equal(waiting.nextState, RUN_STATES.WAITING_INPUT);

  const completed = detector.markExit(0, null);
  assert.equal(completed.nextState, RUN_STATES.COMPLETED);
});

test('CodexStateDetector can apply additional waiting input patterns', () => {
  const detector = new CodexStateDetector(['custom prompt']);
  const waiting = detector.ingest('Custom prompt: press 1 to continue');

  assert.equal(waiting.nextState, RUN_STATES.WAITING_INPUT);
});

test('CodexStateDetector ignores ANSI escape codes around waiting prompts', () => {
  const detector = new CodexStateDetector();
  const waiting = detector.ingest('\u001b[1;1HDo you trust the contents of this directory?\u001b[0m');

  assert.equal(waiting.nextState, RUN_STATES.WAITING_INPUT);
});

test('CodexStateDetector ignores control-only terminal noise', () => {
  const detector = new CodexStateDetector();
  const transition = detector.ingest('\u001b[?2004h\u001b[>7u\u0007');

  assert.equal(transition, null);
  assert.equal(detector.getState(), RUN_STATES.STARTING);
});
