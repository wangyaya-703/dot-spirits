import { bootstrapRuntime, printJson } from '../lib/command-helpers.js';
import { resolveImageTaskKey } from '../lib/device-service.js';
import { readRuntimeStatus } from '../lib/runtime-status.js';

export async function doctorCommand(cliOptions) {
  const { config, client, assetStore } = await bootstrapRuntime({
    cliOptions,
    needsDevice: true,
    needsTaskKey: false
  });

  const status = await client.getStatus();
  const tasks = await client.listTasks(config.taskType);
  const imageTasks = tasks.filter((task) => task.type === 'IMAGE_API');
  const runtime = readRuntimeStatus({ config, logger: null });
  let selectedTaskKey = config.taskKey || null;
  let taskResolution = null;

  try {
    taskResolution = await resolveImageTaskKey(client, {
      taskType: config.taskType,
      configuredTaskKey: config.taskKey,
      logger: null
    });
    selectedTaskKey = taskResolution.taskKey;
  } catch (error) {
    selectedTaskKey = null;
  }

  const summary = {
    config: {
      deviceId: config.deviceId,
      taskType: config.taskType,
      taskKey: selectedTaskKey,
      restoreMode: config.restoreMode,
      assetTheme: config.assetTheme,
      assetRoot: assetStore.getThemeRoot()
    },
    device: {
      current: status?.status?.current ?? null,
      description: status?.status?.description ?? null,
      battery: status?.status?.battery ?? null,
      wifi: status?.status?.wifi ?? null,
      lastRender: status?.renderInfo?.last ?? null,
      nextRender: status?.renderInfo?.next ?? null
    },
    tasks: {
      total: tasks.length,
      imageApiTasks: imageTasks.length,
      selectedTaskKey,
      selectedTaskKeySource: taskResolution?.source ?? null
    },
    runtime: {
      rotatorPid: runtime.rotator.pid,
      mode: runtime.rotator.status?.mode || 'idle',
      currentSessionId: runtime.rotator.status?.currentSessionId || null,
      activeSessions: runtime.summary.activeSessions,
      takeoverLocked: runtime.summary.takeoverLocked,
      summaryBoardActive: runtime.summary.summaryBoardActive
    },
    checks: {
      apiKeyConfigured: Boolean(config.apiKey),
      deviceIdConfigured: Boolean(config.deviceId),
      hasImageApiTask: imageTasks.length > 0,
      canResolveTaskKey: Boolean(selectedTaskKey),
      hasCurrentRenderImage: Boolean(status?.renderInfo?.current?.image?.length),
      rotatorRunning: Boolean(runtime.rotator.pid),
      takeoverLocked: runtime.summary.takeoverLocked
    }
  };

  printJson(summary);
}
