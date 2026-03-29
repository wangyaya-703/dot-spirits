import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { AssetStore } from '../src/lib/asset-store.js';

function createTempTheme() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-codex-theme-'));
  const stateDir = path.join(root, 'states', 'running');
  fs.mkdirSync(path.join(stateDir, 'enter'), { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'enter', 'enter-02.png'), 'b');
  fs.writeFileSync(path.join(stateDir, 'enter', 'enter-01.png'), 'a');
  fs.writeFileSync(path.join(stateDir, 'hold.png'), 'hold');
  return root;
}

test('AssetStore returns sorted enter frames followed by hold frame', () => {
  const themeRoot = createTempTheme();
  const store = new AssetStore(themeRoot);

  const frames = store.getStateSequence('running');

  assert.deepEqual(
    frames.map((frame) => path.basename(frame)),
    ['enter-01.png', 'enter-02.png', 'hold.png']
  );
});

test('AssetStore can limit enter frames before hold', () => {
  const themeRoot = createTempTheme();
  const store = new AssetStore(themeRoot);

  const frames = store.getStateSequence('running', { maxEnterFrames: 1 });

  assert.deepEqual(
    frames.map((frame) => path.basename(frame)),
    ['enter-01.png', 'hold.png']
  );
});

test('AssetStore can return ambient frames for long-running state loops', () => {
  const themeRoot = createTempTheme();
  const store = new AssetStore(themeRoot);

  const frames = store.getAmbientStateFrames('running', { variantCount: 1 });

  assert.deepEqual(
    frames.map((frame) => path.basename(frame)),
    ['enter-02.png', 'hold.png']
  );
});

test('AssetStore caches base64 data', () => {
  const themeRoot = createTempTheme();
  const store = new AssetStore(themeRoot);
  const framePath = path.join(themeRoot, 'states', 'running', 'hold.png');

  const first = store.readImageAsBase64(framePath);
  fs.writeFileSync(framePath, 'mutated');
  const second = store.readImageAsBase64(framePath);

  assert.equal(first, second);
});
