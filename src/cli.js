#!/usr/bin/env node
import process from 'node:process';
import { Command } from 'commander';
import { getDefaultConfigPath } from './lib/config.js';
import { tasksCommand } from './commands/tasks.js';
import { snapshotCommand } from './commands/snapshot.js';
import { pushCommand } from './commands/push.js';
import { doctorCommand } from './commands/doctor.js';
import { runCommand } from './commands/run.js';

const rawArgs = process.argv.slice(2);
const dashDashIndex = rawArgs.indexOf('--');
const childArgs = dashDashIndex >= 0 ? rawArgs.slice(dashDashIndex + 1) : [];
const commanderArgs = dashDashIndex >= 0 ? rawArgs.slice(0, dashDashIndex) : rawArgs;

const program = new Command();

program
  .name('dot-codex')
  .description('Bridge Codex CLI state to Quote/0 image API')
  .showHelpAfterError()
  .option('--config <path>', 'Path to config JSON', getDefaultConfigPath())
  .option('--api-base-url <url>', 'Quote/0 API base URL')
  .option('--api-key <key>', 'Dot. API key')
  .option('--device-id <id>', 'Target Quote/0 device serial number')
  .option('--task-type <type>', 'Device task type to inspect', 'loop')
  .option('--task-key <key>', 'Dedicated IMAGE_API task key')
  .option('--asset-theme <theme>', 'Asset theme directory')
  .option('--border <mode>', 'Quote/0 border mode: 0 or 1')
  .option('--dither-type <type>', 'Dot. dither type')
  .option('--dither-kernel <kernel>', 'Dot. dither kernel')
  .option('--min-refresh-interval-ms <ms>', 'Minimum interval between pushes')
  .option('--frame-interval-ms <ms>', 'Interval between enter frames')
  .option('--restore-mode <mode>', 'hold or restore')
  .option('--restore-delay-ms <ms>', 'Delay before restoring prior content')
  .option('--default-image-path <path>', 'Fallback PNG to restore after run')
  .option('--log-level <level>', 'Logger level');

program
  .command('doctor')
  .description('Inspect current Dot. / Quote/0 configuration health')
  .action(async (_, command) => handleAction(() => doctorCommand(getCombinedOptions(command))));

program
  .command('tasks')
  .description('List tasks from the configured device')
  .action(async (_, command) => handleAction(() => tasksCommand(getCombinedOptions(command))));

program
  .command('snapshot')
  .description('Read current device status and render information')
  .action(async (_, command) => handleAction(() => snapshotCommand(getCombinedOptions(command))));

program
  .command('push [state]')
  .description('Push a state hold frame or a custom PNG file')
  .option('--file <path>', 'Explicit PNG file to push')
  .option('--no-refresh-now', 'Update the task without forcing an immediate screen switch')
  .action(async (state, command) => handleAction(() => pushCommand(state, getCombinedOptions(command))));

program
  .command('run')
  .description('Wrap a Codex session and mirror state changes to Quote/0')
  .allowUnknownOption(true)
  .action(async (_, command) => handleAction(() => runCommand(childArgs, getCombinedOptions(command))));

await program.parseAsync(['node', 'dot-codex', ...commanderArgs]);

function getCombinedOptions(command) {
  return typeof command?.optsWithGlobals === 'function'
    ? command.optsWithGlobals()
    : {
        ...program.opts(),
        ...(typeof command?.opts === 'function' ? command.opts() : {})
      };
}

async function handleAction(action) {
  try {
    await action();
  } catch (error) {
    process.stderr.write(`dot-codex error: ${error.message}\n`);
    process.exitCode = 1;
  }
}
