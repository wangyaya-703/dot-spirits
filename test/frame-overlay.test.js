import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { composeFrameWithOverlay } from '../src/lib/frame-overlay.js';

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
