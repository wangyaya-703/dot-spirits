import { bootstrapRuntime, printJson } from '../lib/command-helpers.js';
import { resolveImageTaskKey } from '../lib/device-service.js';

export async function doctorCommand(cliOptions) {
  const { config, client, assetStore } = await bootstrapRuntime({
    cliOptions,
    needsDevice: true,
    needsTaskKey: false
  });

  const status = await client.getStatus();
  const tasks = await client.listTasks(config.taskType);
  const imageTasks = tasks.filter((task) => task.type === 'IMAGE_API');
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
    checks: {
      apiKeyConfigured: Boolean(config.apiKey),
      deviceIdConfigured: Boolean(config.deviceId),
      hasImageApiTask: imageTasks.length > 0,
      canResolveTaskKey: Boolean(selectedTaskKey),
      hasCurrentRenderImage: Boolean(status?.renderInfo?.current?.image?.length)
    }
  };

  printJson(summary);
}
