import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { composeDashboardFrame, composeFrameWithOverlay } from '../src/lib/frame-overlay.js';

test('composeFrameWithOverlay leaves image unchanged when no metadata is provided', () => {
  const png = new PNG({ width: 296, height: 152 });
  png.data.fill(255);
  const original = PNG.sync.write(png);
  const composed = composeFrameWithOverlay(original, {});
  assert.deepEqual(composed, original);
});

test('composeFrameWithOverlay adds footer when session metadata is provided', () => {
  const png = new PNG({ width: 296, height: 152 });
  png.data.fill(255);
  const original = PNG.sync.write(png);
  const composed = composeFrameWithOverlay(original, {
    state: 'running',
    sessionId: 'A1B2'
  });

  assert.notDeepEqual(composed, original);
});

test('composeDashboardFrame renders a multi-session summary board', () => {
  const composed = composeDashboardFrame({
    sessions: [
      { sessionId: 'A1', sessionName: 'alpha', state: 'running', agentType: 'codex' },
      { sessionId: 'B2', sessionName: 'beta', state: 'waiting_input', agentType: 'claude-code' }
    ]
  });

  const png = PNG.sync.read(composed);
  const blank = new PNG({ width: 296, height: 152 });
  blank.data.fill(255);
  assert.equal(png.width, 296);
  assert.equal(png.height, 152);
  assert.notEqual(Buffer.compare(composed, PNG.sync.write(blank)), 0);
});
