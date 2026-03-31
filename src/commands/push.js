import fs from 'node:fs';
import { bootstrapRuntime, resolveFramePath } from '../lib/command-helpers.js';
import { composeFrameWithOverlay } from '../lib/frame-overlay.js';
import { getStateDisplayLabel } from '../lib/display-format.js';

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

  const imageBuffer = fs.readFileSync(framePath);
  const composed = composeFrameWithOverlay(imageBuffer, {
    state,
    stateLabel: cliOptions.stateLabel || getStateDisplayLabel(state),
    sessionId: cliOptions.sessionId,
    sessionName: cliOptions.sessionName,
    agentType: cliOptions.agent
  });
  const imageBase64 = composed.toString('base64');
  await client.pushImage({
    imageBase64,
    refreshNow: cliOptions.refreshNow !== false,
    border: config.border,
    ditherType: config.ditherType,
    ditherKernel: config.ditherKernel,
    taskKey: config.taskKey
  });

  logger.info({ state, framePath, sessionId: cliOptions.sessionId }, 'Manual push completed');
}
