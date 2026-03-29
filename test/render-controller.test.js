import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { RenderController } from '../src/lib/render-controller.js';
import { AssetStore } from '../src/lib/asset-store.js';
import { RUN_STATES } from '../src/lib/constants.js';

function createThemeForStates(states) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-codex-render-'));
  for (const state of states) {
    const stateDir = path.join(root, 'states', state);
    fs.mkdirSync(path.join(stateDir, 'enter'), { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'enter', 'enter-01.png'), createPngBuffer(24));
    fs.writeFileSync(path.join(stateDir, 'enter', 'enter-02.png'), createPngBuffer(64));
    fs.writeFileSync(path.join(stateDir, 'hold.png'), createPngBuffer(128));
  }
  return root;
}

function createPngBuffer(offset) {
  const png = new PNG({ width: 296, height: 152 });
  png.data.fill(255);
  for (let y = 20; y < 60; y += 1) {
    for (let x = offset; x < offset + 24; x += 1) {
      const idx = (png.width * y + x) << 2;
      png.data[idx] = 0;
      png.data[idx + 1] = 0;
      png.data[idx + 2] = 0;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

test('RenderController plays enter frames then hold frame for a new state', async () => {
  const themeRoot = createThemeForStates([RUN_STATES.RUNNING]);
  const assetStore = new AssetStore(themeRoot);
  const pushes = [];
  const client = {
    async pushImage(payload) {
      pushes.push(payload.imageBase64);
    }
  };

  const controller = new RenderController({
    client,
    assetStore,
    config: {
      border: 0,
      ditherType: 'NONE',
      ditherKernel: undefined,
      taskKey: 'image_task_1',
      minRefreshIntervalMs: 0,
      frameIntervalMs: 0,
      restoreMode: 'hold',
      restoreDelayMs: 0
    },
    logger: {
      debug() {},
      info() {},
      warn() {}
    }
  });

  await controller.setState(RUN_STATES.RUNNING);

  assert.equal(pushes.length, 3);
});

test('RenderController restores previous content in restore mode', async () => {
  const themeRoot = createThemeForStates([RUN_STATES.COMPLETED]);
  const assetStore = new AssetStore(themeRoot);
  const pushes = [];
  const client = {
    async pushImage(payload) {
      pushes.push(payload.imageBase64);
    }
  };

  const controller = new RenderController({
    client,
    assetStore,
    config: {
      border: 0,
      ditherType: 'NONE',
      ditherKernel: undefined,
      taskKey: 'image_task_1',
      minRefreshIntervalMs: 0,
      frameIntervalMs: 0,
      restoreMode: 'restore',
      restoreDelayMs: 0
    },
    restoreSnapshot: {
      source: 'test',
      imageBase64: 'restore-frame',
      border: 0,
      ditherType: 'NONE',
      ditherKernel: undefined,
      taskKey: 'image_task_1'
    },
    logger: {
      debug() {},
      info() {},
      warn() {}
    }
  });

  await controller.finalize(RUN_STATES.COMPLETED);

  assert.equal(pushes.at(-1), 'restore-frame');
  assert.equal(pushes.length, 4);
});
