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

test('composeDashboardFrame preserves a supplied background image above the session panel', () => {
  const base = new PNG({ width: 296, height: 152 });
  base.data.fill(255);
  for (let y = 70; y < 120; y += 1) {
    for (let x = 110; x < 170; x += 1) {
      const index = (base.width * y + x) * 4;
      base.data[index] = 0;
      base.data[index + 1] = 0;
      base.data[index + 2] = 0;
      base.data[index + 3] = 255;
    }
  }

  const composed = composeDashboardFrame({
    imageBuffer: PNG.sync.write(base),
    sessions: [
      { sessionId: 'A1', sessionName: 'alpha', state: 'running', agentType: 'codex' },
      { sessionId: 'B2', sessionName: 'beta', state: 'waiting_input', agentType: 'claude-code' }
    ]
  });

  const png = PNG.sync.read(composed);
  const centerIndex = (png.width * 90 + 130) * 4;
  assert.equal(png.data[centerIndex], 0);
  assert.equal(png.data[centerIndex + 1], 0);
  assert.equal(png.data[centerIndex + 2], 0);
});
