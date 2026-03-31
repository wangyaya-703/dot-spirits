import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { ACTIVE_STATES, AGENT_TYPES, RUN_STATES, TERMINAL_STATES } from './constants.js';
import { getProjectRoot } from './config.js';
import { getStateDisplayLabel, normalizeDisplayText } from './display-format.js';

export class SessionRegistry {
  constructor({ runtimeRoot, logger }) {
    this.runtimeRoot = runtimeRoot;
    this.logger = logger;
    this.sessionsRoot = path.join(runtimeRoot, 'sessions');
    this.pidFile = path.join(runtimeRoot, 'rotator.pid');
    this.statusFile = path.join(runtimeRoot, 'status.json');
    fs.mkdirSync(this.sessionsRoot, { recursive: true });
  }

  getSessionPath(sessionId) {
    return path.join(this.sessionsRoot, `${sessionId}.json`);
  }

  writeSession(sessionId, payload) {
    const target = this.getSessionPath(sessionId);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    fs.renameSync(tmp, target);
  }

  readSession(sessionId) {
    const file = this.getSessionPath(sessionId);
    if (!fs.existsSync(file)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  removeSession(sessionId) {
    const file = this.getSessionPath(sessionId);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  listSessions() {
    return fs.readdirSync(this.sessionsRoot)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        const file = path.join(this.sessionsRoot, name);
        try {
          return JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (error) {
          this.logger?.warn({ err: error, file }, 'Failed to parse session file');
          return null;
        }
      })
      .filter(Boolean);
  }

  upsertSession({
    sessionId,
    state,
    command,
    args,
    cwd,
    pid,
    stateLabel,
    sessionName,
    codexThreadId,
    agentType = AGENT_TYPES.CODEX,
    heartbeatMode = 'periodic',
    lastEventAt,
    hookSessionTtlMs,
    sequenceVersion
  }) {
    const now = Date.now();
    const current = this.readSession(sessionId);
    if (Number.isInteger(sequenceVersion) && Number.isInteger(current?.sequenceVersion) && sequenceVersion <= current.sequenceVersion) {
      this.logger?.debug?.({
        sessionId,
        currentSequenceVersion: current.sequenceVersion,
        incomingSequenceVersion: sequenceVersion
      }, 'Ignoring stale session upsert with non-monotonic sequenceVersion');
      return current;
    }

    const stateChanged = current?.state !== state;
    const resolvedHeartbeatMode = heartbeatMode || current?.heartbeatMode || 'periodic';
    const resolvedSequenceVersion = Number.isInteger(sequenceVersion)
      ? sequenceVersion
      : (stateChanged ? (current?.sequenceVersion || 0) + 1 : (current?.sequenceVersion || 1));
    const payload = {
      sessionId,
      sessionName: sessionName || current?.sessionName || null,
      codexThreadId: codexThreadId || current?.codexThreadId || null,
      agentType: agentType || current?.agentType || AGENT_TYPES.CODEX,
      heartbeatMode: resolvedHeartbeatMode,
      state,
      stateLabel: stateLabel || null,
      command,
      args,
      cwd,
      pid,
      terminal: TERMINAL_STATES.has(state),
      startedAt: current?.startedAt || now,
      updatedAt: now,
      heartbeatAt: resolvedHeartbeatMode === 'periodic' ? now : (current?.heartbeatAt || null),
      lastEventAt: resolvedHeartbeatMode === 'event-driven' ? (lastEventAt || now) : (current?.lastEventAt || null),
      hookSessionTtlMs: hookSessionTtlMs || current?.hookSessionTtlMs || null,
      lastStateChangeAt: stateChanged ? now : (current?.lastStateChangeAt || now),
      sequenceVersion: resolvedSequenceVersion,
      exitedAt: TERMINAL_STATES.has(state) ? now : (current?.exitedAt || null)
    };
    this.writeSession(sessionId, payload);
    return payload;
  }

  heartbeat(sessionId) {
    const current = this.readSession(sessionId);
    if (!current) {
      return null;
    }

    if (current.heartbeatMode === 'event-driven') {
      return current;
    }

    const next = {
      ...current,
      updatedAt: Date.now(),
      heartbeatAt: Date.now()
    };
    this.writeSession(sessionId, next);
    return next;
  }

  writePid(pid = process.pid) {
    fs.mkdirSync(this.runtimeRoot, { recursive: true });
    fs.writeFileSync(this.pidFile, JSON.stringify({ pid, updatedAt: Date.now() }, null, 2));
  }

  clearPid(expectedPid = process.pid) {
    if (!fs.existsSync(this.pidFile)) {
      return;
    }

    try {
      const payload = JSON.parse(fs.readFileSync(this.pidFile, 'utf8'));
      if (!expectedPid || payload.pid === expectedPid) {
        fs.unlinkSync(this.pidFile);
      }
    } catch {
      fs.unlinkSync(this.pidFile);
    }
  }

  readPid() {
    if (!fs.existsSync(this.pidFile)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(this.pidFile, 'utf8'));
    } catch {
      return null;
    }
  }

  writeStatus(payload) {
    fs.mkdirSync(this.runtimeRoot, { recursive: true });
    const tmp = `${this.statusFile}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    fs.renameSync(tmp, this.statusFile);
  }

  readStatus() {
    if (!fs.existsSync(this.statusFile)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(this.statusFile, 'utf8'));
    } catch {
      return null;
    }
  }

  clearStatus() {
    if (fs.existsSync(this.statusFile)) {
      fs.unlinkSync(this.statusFile);
    }
  }
}

export function isPidRunning(pid) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function ensureRotatorRunning({ config, logger }) {
  const registry = new SessionRegistry({ runtimeRoot: config.runtimeRoot, logger });
  const pidInfo = registry.readPid();
  if (pidInfo?.pid && isPidRunning(pidInfo.pid)) {
    return { started: false, pid: pidInfo.pid };
  }

  registry.clearPid();
  const child = spawn(process.execPath, [path.join(getProjectRoot(), 'src', 'cli.js'), 'daemon'], {
    cwd: getProjectRoot(),
    detached: true,
    stdio: 'ignore',
    env: process.env
  });
  child.unref();
  return { started: true, pid: child.pid };
}

export function selectRenderableSessions(sessions, {
  now = Date.now(),
  rotateMaxSessions,
  activeSessionStaleMs,
  terminalSessionTtlMs,
  hookSessionTtlMs
}) {
  const filtered = sessions
    .filter((session) => session?.sessionId && session?.state)
    .filter((session) => isSessionFresh(session, {
      now,
      activeSessionStaleMs,
      terminalSessionTtlMs,
      hookSessionTtlMs
    }))
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
    .slice(0, rotateMaxSessions);

  return filtered;
}

export function selectActiveRenderableSessions(sessions, {
  now = Date.now(),
  rotateMaxSessions,
  activeSessionStaleMs,
  hookSessionTtlMs
}) {
  return sessions
    .filter((session) => session?.sessionId && session?.state)
    .filter((session) =>
      ACTIVE_STATES.has(session.state) &&
      isSessionFresh(session, {
        now,
        activeSessionStaleMs,
        terminalSessionTtlMs: 0,
        hookSessionTtlMs
      })
    )
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
    .slice(0, rotateMaxSessions);
}

export function hasActiveSessions(sessions, { now = Date.now(), activeSessionStaleMs, hookSessionTtlMs }) {
  return sessions.some((session) =>
    ACTIVE_STATES.has(session.state) &&
    isSessionFresh(session, {
      now,
      activeSessionStaleMs,
      terminalSessionTtlMs: 0,
      hookSessionTtlMs
    })
  );
}

export function selectFocusedActiveSession(sessions, {
  now = Date.now(),
  activeSessionFocusMs = 0
} = {}) {
  if (!activeSessionFocusMs || activeSessionFocusMs <= 0) {
    return null;
  }

  return sessions
    .filter((session) => ACTIVE_STATES.has(session?.state))
    .filter((session) => now - (session.lastStateChangeAt || session.updatedAt || 0) <= activeSessionFocusMs)
    .sort((left, right) => {
      if (left.state === RUN_STATES.WAITING_INPUT && right.state !== RUN_STATES.WAITING_INPUT) {
        return -1;
      }
      if (right.state === RUN_STATES.WAITING_INPUT && left.state !== RUN_STATES.WAITING_INPUT) {
        return 1;
      }
      return (right.lastStateChangeAt || right.updatedAt || 0) - (left.lastStateChangeAt || left.updatedAt || 0);
    })[0] || null;
}

export function selectLatestTerminalSession(sessions) {
  return sessions
    .filter((session) => TERMINAL_STATES.has(session.state))
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))[0] || null;
}

export function selectPromotableTerminalSession(sessions, {
  now = Date.now(),
  terminalPromotionMs,
  displayedSignatureBySession = new Map()
} = {}) {
  return sessions
    .filter((session) => TERMINAL_STATES.has(session.state))
    .filter((session) => now - (session.lastStateChangeAt || session.updatedAt || 0) <= terminalPromotionMs)
    .filter((session) => {
      const signature = `${session.sessionId}:${session.state}:${session.sequenceVersion}`;
      return displayedSignatureBySession.get(session.sessionId) !== signature;
    })
    .sort((left, right) => (right.lastStateChangeAt || right.updatedAt || 0) - (left.lastStateChangeAt || left.updatedAt || 0))[0] || null;
}

export function defaultSessionLabel(state) {
  return getStateDisplayLabel(state);
}

export function pruneExpiredSessions(registry, sessions, {
  now = Date.now(),
  activeSessionStaleMs,
  terminalRetentionMs,
  hookSessionTtlMs
}) {
  const removed = [];

  for (const session of sessions) {
    const updatedAt = session.updatedAt || 0;
    const livenessAt = getSessionLivenessTimestamp(session);

    if (TERMINAL_STATES.has(session.state)) {
      if (now - updatedAt > terminalRetentionMs) {
        registry.removeSession(session.sessionId);
        removed.push(session.sessionId);
      }
      continue;
    }

    if (session.heartbeatMode === 'event-driven') {
      const eventTtlMs = session.hookSessionTtlMs || hookSessionTtlMs || activeSessionStaleMs;
      if (now - livenessAt > eventTtlMs) {
        registry.removeSession(session.sessionId);
        removed.push(session.sessionId);
      }
      continue;
    }

    if (now - livenessAt > activeSessionStaleMs && !isPidRunning(session.pid)) {
      registry.removeSession(session.sessionId);
      removed.push(session.sessionId);
    }
  }

  return removed;
}

function getSessionLivenessTimestamp(session) {
  if (session?.heartbeatMode === 'event-driven') {
    return session.lastEventAt || session.updatedAt || 0;
  }

  return session.heartbeatAt || session.updatedAt || 0;
}

function isSessionFresh(session, {
  now,
  activeSessionStaleMs,
  terminalSessionTtlMs,
  hookSessionTtlMs
}) {
  if (TERMINAL_STATES.has(session.state)) {
    return now - (session.updatedAt || 0) <= terminalSessionTtlMs;
  }

  if (session.heartbeatMode === 'event-driven') {
    const ttlMs = session.hookSessionTtlMs || hookSessionTtlMs || activeSessionStaleMs;
    return now - getSessionLivenessTimestamp(session) <= ttlMs;
  }

  return now - getSessionLivenessTimestamp(session) <= activeSessionStaleMs;
}

export function getSessionDisplayName(session, { maxLength = 12 } = {}) {
  const preferred = session?.sessionName || session?.sessionId || '';
  const normalized = normalizeDisplayText(preferred);

  if (!normalized) {
    return session?.sessionId ? String(session.sessionId).toUpperCase() : '';
  }

  return normalized.slice(0, maxLength);
}
