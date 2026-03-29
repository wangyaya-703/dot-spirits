#!/usr/bin/env node
import process from 'node:process';
import { Command } from 'commander';
import { getDefaultConfigPath } from './lib/config.js';
import { tasksCommand } from './commands/tasks.js';
import { snapshotCommand } from './commands/snapshot.js';
import { pushCommand } from './commands/push.js';
import { doctorCommand } from './commands/doctor.js';
import { runCommand } from './commands/run.js';
import { daemonCommand } from './commands/daemon.js';
import { installWrapperCommand } from './commands/install-wrapper.js';

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
  .option('--session-id <id>', 'Session id badge to render on the device frame')
  .option('--session-name <name>', 'Human-readable session name to prefer over the raw id')
  .option('--state-label <label>', 'Override the rendered state label')
  .option('--runtime-root <path>', 'Runtime directory for session registry and rotator')
  .option('--rotate-interval-ms <ms>', 'How long each session stays on Dot before rotating')
  .option('--rotator-poll-ms <ms>', 'Background rotator poll interval')
  .option('--rotate-max-sessions <n>', 'Maximum recent sessions to rotate')
  .option('--terminal-session-ttl-ms <ms>', 'How long completed/failed sessions stay in the rotation')
  .option('--active-session-stale-ms <ms>', 'How long to keep a live session without heartbeat')
  .option('--result-hold-ms <ms>', 'How long to keep the latest terminal result on screen before releasing takeover')
  .option('--terminal-promotion-ms <ms>', 'How long a newly completed/failed session is treated as a promotable event')
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

program
  .command('daemon')
  .description('Run the background Dot session rotator')
  .action(async (_, command) => handleAction(() => daemonCommand(getCombinedOptions(command))));

program
  .command('sessions')
  .description('Inspect the current runtime session pool and rotator state')
  .option('--json', 'Emit machine-readable JSON instead of a table')
  .action(async (_, command) => handleAction(() => import('./commands/sessions.js').then(({ sessionsCommand }) => sessionsCommand(getCombinedOptions(command)))));

program
  .command('install-wrapper')
  .description('Install a zsh codex wrapper so typing codex auto-triggers dot-codex')
  .option('--shell <shell>', 'Shell type', 'zsh')
  .option('--real-codex-path <path>', 'Explicit path to the real codex binary')
  .action(async (_, command) => handleAction(() => installWrapperCommand(getCombinedOptions(command))));

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
