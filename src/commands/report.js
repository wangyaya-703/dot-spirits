import path from 'node:path';
import process from 'node:process';
import { loadConfig } from '../lib/config.js';
import { createLogger } from '../lib/logger.js';
import { SessionRegistry, ensureRotatorRunning } from '../lib/session-registry.js';
import { AGENT_TYPES, RUN_STATES } from '../lib/constants.js';

const DEFAULT_HOOK_INPUT_TIMEOUT_MS = 5000;
let fallbackSequenceSeed = 0;

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
    throw new Error('Missing report session id. Pass --session-id or ensure the hook JSON includes session_id on stdin.');
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

export async function readHookInput({ stdin = process.stdin, timeoutMs = DEFAULT_HOOK_INPUT_TIMEOUT_MS } = {}) {
  if (stdin.isTTY) {
    return {};
  }

  return new Promise((resolve, reject) => {
    let raw = '';
    let settled = false;
    let timer = null;

    const cleanup = () => {
      stdin.off?.('data', onData);
      stdin.off?.('end', onEnd);
      stdin.off?.('error', onError);
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback(value);
    };

    const onData = (chunk) => {
      raw += chunk.toString();
    };

    const onEnd = () => {
      const trimmed = raw.trim();
      if (!trimmed) {
        finish(resolve, {});
        return;
      }

      try {
        finish(resolve, JSON.parse(trimmed));
      } catch (error) {
        finish(reject, new Error(`Failed to parse hook JSON from stdin: ${error.message}`));
      }
    };

    const onError = (error) => {
      finish(reject, error);
    };

    timer = setTimeout(() => {
      finish(resolve, {});
    }, timeoutMs);

    stdin.on('data', onData);
    stdin.once('end', onEnd);
    stdin.once('error', onError);
    stdin.resume?.();
  });
}

function normalizeAgentType(agentType) {
  const normalized = String(agentType || '').trim().toLowerCase();
  if (normalized === AGENT_TYPES.CODEX || normalized === AGENT_TYPES.CLAUDE_CODE) {
    return normalized;
  }

  throw new Error(`Unsupported agent type: ${agentType}`);
}

export function normalizeSequence(value) {
  if (value === undefined || value === null || value === '') {
    return generateFallbackSequence();
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Invalid report sequence: ${value}`);
  }

  return Math.trunc(numeric);
}

export function generateFallbackSequence(now = Date.now()) {
  const subMillisecond = Number(process.hrtime.bigint() % 1000n);
  const candidate = (now * 1000) + subMillisecond;
  fallbackSequenceSeed = Math.max(candidate, fallbackSequenceSeed + 1);
  return fallbackSequenceSeed;
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
