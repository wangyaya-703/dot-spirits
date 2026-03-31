import path from 'node:path';
import { bootstrapRuntime, printJson } from '../lib/command-helpers.js';
import { readRuntimeStatus } from '../lib/runtime-status.js';

export async function sessionsCommand(cliOptions) {
  const { config, logger } = await bootstrapRuntime({
    cliOptions,
    needsDevice: false,
    needsTaskKey: false
  });
  const payload = readRuntimeStatus({ config, logger });

  if (cliOptions.json) {
    printJson(payload);
    return;
  }

  printTable(payload);
}

function printTable(payload) {
  process.stdout.write(`Runtime: ${payload.runtimeRoot}\n`);
  process.stdout.write(`Rotator PID: ${payload.rotator.pid || '-'}\n`);
  process.stdout.write(
    `Mode: ${payload.rotator.status?.mode || 'idle'}  Current: ${payload.rotator.status?.currentSessionId || '-'}  Promoted: ${payload.summary.promotedTerminalSessionId || '-'}  TakeoverLocked: ${payload.summary.takeoverLocked}\n`
  );
  process.stdout.write(
    `Summary: total=${payload.summary.totalSessions} renderable=${payload.summary.renderableSessions} active=${payload.summary.activeSessions} summary_board=${payload.summary.summaryBoardActive} latest_terminal=${payload.summary.latestTerminalSessionId || '-'}\n\n`
  );

  const rows = payload.sessions.map((session) => ({
    NAME: session.displayName || '-',
    ID: session.sessionId,
    AGENT: session.agentType || '-',
    STATE: session.state,
    THREAD: session.codexThreadId ? session.codexThreadId.slice(0, 8) : '-',
    UPDATED: formatAge(session.updatedAt),
    CWD: path.basename(session.cwd || '') || session.cwd || '-'
  }));

  if (rows.length === 0) {
    process.stdout.write('No sessions.\n');
    return;
  }

  const headers = Object.keys(rows[0]);
  const widths = Object.fromEntries(headers.map((header) => [
    header,
    Math.max(header.length, ...rows.map((row) => String(row[header]).length))
  ]));

  const headerLine = headers.map((header) => pad(String(header), widths[header])).join('  ');
  const divider = headers.map((header) => '-'.repeat(widths[header])).join('  ');
  process.stdout.write(`${headerLine}\n${divider}\n`);
  for (const row of rows) {
    process.stdout.write(`${headers.map((header) => pad(String(row[header]), widths[header])).join('  ')}\n`);
  }
}

function formatAge(timestamp) {
  if (!timestamp) {
    return '-';
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s`;
  }

  if (deltaSeconds < 3600) {
    return `${Math.floor(deltaSeconds / 60)}m`;
  }

  return `${Math.floor(deltaSeconds / 3600)}h`;
}

function pad(value, width) {
  return value.padEnd(width, ' ');
}
