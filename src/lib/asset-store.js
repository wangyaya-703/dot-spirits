import fs from 'node:fs';
import path from 'node:path';

export class AssetStore {
  constructor(assetRoot) {
    this.assetRoot = assetRoot;
    this.base64Cache = new Map();
  }

  getThemeRoot() {
    return this.assetRoot;
  }

  getStateDir(state) {
    return path.join(this.assetRoot, 'states', state);
  }

  getHoldFrame(state) {
    const framePath = path.join(this.getStateDir(state), 'hold.png');
    this.assertFrame(framePath, state);
    return framePath;
  }

  getEnterFrames(state) {
    const enterDir = path.join(this.getStateDir(state), 'enter');
    if (!fs.existsSync(enterDir)) {
      return [];
    }

    return fs
      .readdirSync(enterDir)
      .filter((name) => name.endsWith('.png'))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      .map((name) => path.join(enterDir, name));
  }

  getStateSequence(state, { includeEnter = true, maxEnterFrames } = {}) {
    const frames = includeEnter ? this.getEnterFrames(state) : [];
    const limitedFrames = Number.isInteger(maxEnterFrames) && maxEnterFrames >= 0
      ? frames.slice(0, maxEnterFrames)
      : frames;
    return [...limitedFrames, this.getHoldFrame(state)];
  }

  readImageAsBase64(filePath) {
    if (!this.base64Cache.has(filePath)) {
      const contents = fs.readFileSync(filePath);
      this.base64Cache.set(filePath, contents.toString('base64'));
    }

    return this.base64Cache.get(filePath);
  }

  readImageBuffer(filePath) {
    return fs.readFileSync(filePath);
  }

  assertFrame(framePath, state) {
    if (!fs.existsSync(framePath)) {
      throw new Error(`Missing frame for state '${state}': ${framePath}`);
    }
  }
}
