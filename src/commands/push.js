import fs from 'node:fs';
import { bootstrapRuntime, resolveFramePath } from '../lib/command-helpers.js';

export async function pushCommand(state, cliOptions) {
  if (!state && !cliOptions.file) {
    throw new Error('Provide a state name or --file');
  }

  const { config, client, assetStore, logger } = await bootstrapRuntime({
    cliOptions,
    needsDevice: true,
    needsTaskKey: true
  });

  const framePath = resolveFramePath({ assetStore, state, framePath: cliOptions.file });
  if (!fs.existsSync(framePath)) {
    throw new Error(`Push frame does not exist: ${framePath}`);
  }

  const imageBase64 = fs.readFileSync(framePath).toString('base64');
  await client.pushImage({
    imageBase64,
    refreshNow: cliOptions.refreshNow !== false,
    border: config.border,
    ditherType: config.ditherType,
    ditherKernel: config.ditherKernel,
    taskKey: config.taskKey
  });

  logger.info({ state, framePath }, 'Manual push completed');
}
