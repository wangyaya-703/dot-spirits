import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, assertConfigFields } from './config.js';
import { createLogger } from './logger.js';
import { AssetStore } from './asset-store.js';
import { Quote0Client } from './quote0-client.js';
import { resolveImageTaskKey } from './device-service.js';

export async function bootstrapRuntime({ cliOptions = {}, needsDevice = true, needsTaskKey = false } = {}) {
  const config = loadConfig({ overrides: cliOptions });
  const logger = createLogger({
    level: config.logLevel,
    logFilePath: config.logFilePath
  });

  if (needsDevice) {
    assertConfigFields(config, ['apiKey', 'deviceId']);
  }

  ensureAssetThemeExists(config.assetRoot);
  const assetStore = new AssetStore(config.assetRoot);
  const client = needsDevice
    ? new Quote0Client({
        apiBaseUrl: config.apiBaseUrl,
        apiKey: config.apiKey,
        deviceId: config.deviceId,
        logger
      })
    : null;

  if (needsTaskKey) {
    const resolution = await resolveImageTaskKey(client, {
      taskType: config.taskType,
      configuredTaskKey: config.taskKey,
      logger
    });
    config.taskKey = resolution.taskKey;
  }

  return { config, logger, client, assetStore };
}

export function ensureAssetThemeExists(assetRoot) {
  if (!fs.existsSync(assetRoot)) {
    throw new Error(`Asset theme was not found: ${assetRoot}`);
  }
}

export function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export function resolveFramePath({ assetStore, state, framePath }) {
  if (framePath) {
    return path.resolve(framePath);
  }

  return assetStore.getHoldFrame(state);
}
