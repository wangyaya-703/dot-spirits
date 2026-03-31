import { bootstrapRuntime, printJson } from '../lib/command-helpers.js';
import { readRuntimeStatus } from '../lib/runtime-status.js';

export async function snapshotCommand(cliOptions) {
  const { config, logger, client } = await bootstrapRuntime({ cliOptions, needsDevice: true, needsTaskKey: false });
  const snapshot = await client.getStatus();
  const runtime = readRuntimeStatus({ config, logger });
  printJson({
    device: snapshot,
    runtime: {
      root: runtime.runtimeRoot,
      rotatorPid: runtime.rotator.pid,
      mode: runtime.rotator.status?.mode || 'idle',
      currentSessionId: runtime.rotator.status?.currentSessionId || null,
      activeSessionIds: runtime.rotator.status?.activeSessionIds || [],
      takeoverLocked: runtime.summary.takeoverLocked,
      summaryBoardActive: runtime.summary.summaryBoardActive,
      lastOwnedImageUrl: runtime.rotator.status?.lastOwnedImageUrl || null
    }
  });
}
