import { bootstrapRuntime, printJson } from '../lib/command-helpers.js';

export async function tasksCommand(cliOptions) {
  const { config, client } = await bootstrapRuntime({ cliOptions, needsDevice: true, needsTaskKey: false });
  const tasks = await client.listTasks(config.taskType);
  printJson(tasks);
}
