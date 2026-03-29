import fs from 'node:fs';

export async function resolveImageTaskKey(client, { taskType = 'loop', configuredTaskKey, logger }) {
  if (configuredTaskKey) {
    return { taskKey: configuredTaskKey, source: 'config' };
  }

  const tasks = await client.listTasks(taskType);
  const imageTask = tasks.find((task) => task.type === 'IMAGE_API' && task.key);

  if (!imageTask) {
    throw new Error('No IMAGE_API task with a key was found on the device. Add one in Dot. App first.');
  }

  logger?.debug({ taskKey: imageTask.key }, 'Resolved IMAGE_API task key from device tasks');
  return { taskKey: imageTask.key, source: 'device', tasks };
}

export async function captureRestoreSnapshot({ client, config, logger }) {
  const snapshot = {
    source: null,
    imageBase64: null,
    border: config.border,
    ditherType: config.ditherType,
    ditherKernel: config.ditherKernel,
    taskKey: config.taskKey
  };

  if (config.defaultImagePath && fs.existsSync(config.defaultImagePath)) {
    snapshot.source = 'default-image-path';
    snapshot.imageBase64 = fs.readFileSync(config.defaultImagePath).toString('base64');
    return snapshot;
  }

  try {
    const status = await client.getStatus();
    const imageUrl = status?.renderInfo?.current?.image?.[0];
    if (!imageUrl) {
      return snapshot;
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      logger?.warn({ imageUrl, status: response.status }, 'Failed to fetch current device render for restore snapshot');
      return snapshot;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    snapshot.source = 'device-render';
    snapshot.imageBase64 = buffer.toString('base64');
    snapshot.border = status?.renderInfo?.current?.border ?? snapshot.border;
    return snapshot;
  } catch (error) {
    logger?.warn({ err: error }, 'Unable to capture restore snapshot');
    return snapshot;
  }
}
