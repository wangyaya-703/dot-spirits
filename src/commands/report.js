import path from 'node:path';
import process from 'node:process';
import { loadConfig } from '../lib/config.js';
import { createLogger } from '../lib/logger.js';
import { SessionRegistry, ensureRotatorRunning } from '../lib/session-registry.js';
import { AGENT_TYPES, RUN_STATES } from '../lib/constants.js';

export async function reportCommand(cliOptions) {
  const config = loadConfig({ overrides: cliOptions });
  const logger = createLogger({
    level: config.logLevel,
    logFilePath: config.logFilePath,
    stdout: false
  });
  const hookInput = await readHookInput();
  const descriptor = buildReportDescriptor({ cliOptions, hookInput, config });
  const registry = new SessionRegistry({ runtimeRoot: config.runtimeRoot, logger });

  recordReportEvent({
    registry,
    descriptor,
    config,
    logger
  });
}

export function buildReportDescriptor({ cliOptions = {}, hookInput = {}, config }) {
  const agentType = normalizeAgentType(cliOptions.agent || hookInput.agent_type || AGENT_TYPES.CLAUDE_CODE);
  const eventName = cliOptions.event || hookInput.hook_event_name || hookInput.event;
  if (!eventName) {
    throw new Error('Missing report event. Pass --event or provide hook_event_name on stdin.');
  }

  const sessionId = cliOptions.sessionId || hookInput.session_id;
  if (!sessionId) {
    throw new Error('Missing report session id. Pass --session-id or provide session_id on stdin.');
  }

  const cwd = cliOptions.cwd || hookInput.cwd || process.cwd();
  const stopReason = cliOptions.stopReason || hookInput.stop_reason || hookInput.reason || '';
  const sequenceVersion = normalizeSequence(cliOptions.sequence ?? hookInput.sequence_version ?? hookInput.sequence);
  const sessionName = cliOptions.sessionName || hookInput.session_name || path.basename(cwd) || sessionId;

  return {
    agentType,
    heartbeatMode: 'event-driven',
    sessionId,
    sessionName,
    state: mapReportEventToState({ eventName, stopReason }),
    cwd,
    sequenceVersion,
    stopReason,
    command: 'dot-codex report',
    args: buildCommandArgs({ agentType, eventName, sessionId, sequenceVersion }),
    hookSessionTtlMs: config.hookSessionTtlMs
  };
}

export function recordReportEvent({ registry, descriptor, config, logger }) {
  const session = registry.upsertSession({
    sessionId: descriptor.sessionId,
    state: descriptor.state,
    command: descriptor.command,
    args: descriptor.args,
    cwd: descriptor.cwd,
    pid: null,
    sessionName: descriptor.sessionName,
    agentType: descriptor.agentType,
    heartbeatMode: descriptor.heartbeatMode,
    lastEventAt: Date.now(),
    hookSessionTtlMs: descriptor.hookSessionTtlMs,
    sequenceVersion: descriptor.sequenceVersion
  });

  if (session && config.apiKey && config.deviceId) {
    ensureRotatorRunning({ config, logger });
  }

  return session;
}

export function mapReportEventToState({ eventName, stopReason = '' }) {
  const normalized = String(eventName).trim().toLowerCase();
  switch (normalized) {
    case 'sessionstart':
    case 'start':
    case 'startup':
      return RUN_STATES.STARTING;
    case 'userpromptsubmit':
    case 'pretooluse':
    case 'posttooluse':
    case 'posttoolusefailure':
    case 'subagentstart':
    case 'subagentstop':
    case 'running':
      return RUN_STATES.RUNNING;
    case 'permissionrequest':
    case 'waiting_input':
    case 'waiting-input':
    case 'wait':
      return RUN_STATES.WAITING_INPUT;
    case 'failed':
    case 'crash':
    case 'error':
      return RUN_STATES.FAILED;
    case 'stop':
      return /cancel|interrupt|abort/i.test(String(stopReason))
        ? RUN_STATES.CANCELLED
        : RUN_STATES.COMPLETED;
    default:
      throw new Error(`Unsupported report event: ${eventName}`);
  }
}

async function readHookInput() {
  if (process.stdin.isTTY) {
    return {};
  }

  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk.toString();
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Failed to parse hook JSON from stdin: ${error.message}`);
  }
}

function normalizeAgentType(agentType) {
  const normalized = String(agentType || '').trim().toLowerCase();
  if (normalized === AGENT_TYPES.CODEX || normalized === AGENT_TYPES.CLAUDE_CODE) {
    return normalized;
  }

  throw new Error(`Unsupported agent type: ${agentType}`);
}

function normalizeSequence(value) {
  if (value === undefined || value === null || value === '') {
    return Date.now();
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Invalid report sequence: ${value}`);
  }

  return Math.trunc(numeric);
}

function buildCommandArgs({ agentType, eventName, sessionId, sequenceVersion }) {
  return [
    '--agent',
    agentType,
    '--event',
    eventName,
    '--session-id',
    sessionId,
    '--sequence',
    String(sequenceVersion)
  ];
}
