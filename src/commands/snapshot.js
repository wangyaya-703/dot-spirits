import { bootstrapRuntime, printJson } from '../lib/command-helpers.js';

export async function snapshotCommand(cliOptions) {
  const { client } = await bootstrapRuntime({ cliOptions, needsDevice: true, needsTaskKey: false });
  const snapshot = await client.getStatus();
  printJson(snapshot);
}
