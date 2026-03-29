import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { ACTIVE_STATES, RUN_STATES, TERMINAL_STATES } from './constants.js';
import { getProjectRoot } from './config.js';

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
    sessionName
  }) {
    const now = Date.now();
    const current = this.readSession(sessionId);
    const stateChanged = current?.state !== state;
    const payload = {
      sessionId,
      sessionName: sessionName || current?.sessionName || null,
      state,
      stateLabel: stateLabel || null,
      command,
      args,
      cwd,
      pid,
      terminal: TERMINAL_STATES.has(state),
      startedAt: current?.startedAt || now,
      updatedAt: now,
      heartbeatAt: now,
      lastStateChangeAt: stateChanged ? now : (current?.lastStateChangeAt || now),
      sequenceVersion: stateChanged ? (current?.sequenceVersion || 0) + 1 : (current?.sequenceVersion || 1),
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
  terminalSessionTtlMs
}) {
  const filtered = sessions
    .filter((session) => session?.sessionId && session?.state)
    .filter((session) => {
      if (!TERMINAL_STATES.has(session.state)) {
        return now - (session.heartbeatAt || session.updatedAt || 0) <= activeSessionStaleMs;
      }

      return now - (session.updatedAt || 0) <= terminalSessionTtlMs;
    })
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
    .slice(0, rotateMaxSessions);

  return filtered;
}

export function selectActiveRenderableSessions(sessions, {
  now = Date.now(),
  rotateMaxSessions,
  activeSessionStaleMs
}) {
  return sessions
    .filter((session) => session?.sessionId && session?.state)
    .filter((session) =>
      ACTIVE_STATES.has(session.state) &&
      now - (session.heartbeatAt || session.updatedAt || 0) <= activeSessionStaleMs
    )
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
    .slice(0, rotateMaxSessions);
}

export function hasActiveSessions(sessions, { now = Date.now(), activeSessionStaleMs }) {
  return sessions.some((session) =>
    ACTIVE_STATES.has(session.state) && now - (session.heartbeatAt || session.updatedAt || 0) <= activeSessionStaleMs
  );
}

export function selectLatestTerminalSession(sessions) {
  return sessions
    .filter((session) => TERMINAL_STATES.has(session.state))
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))[0] || null;
}

export function defaultSessionLabel(state) {
  switch (state) {
    case RUN_STATES.STARTING:
      return 'START';
    case RUN_STATES.RUNNING:
      return 'RUNNING';
    case RUN_STATES.WAITING_INPUT:
      return 'WAIT';
    case RUN_STATES.COMPLETED:
      return 'DONE';
    case RUN_STATES.FAILED:
      return 'FAILED';
    case RUN_STATES.CANCELLED:
      return 'STOP';
    default:
      return String(state || '').toUpperCase();
  }
}

export function getSessionDisplayName(session, { maxLength = 12 } = {}) {
  const preferred = session?.sessionName || session?.sessionId || '';
  const normalized = String(preferred)
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase();

  if (!normalized) {
    return session?.sessionId ? String(session.sessionId).toUpperCase() : '';
  }

  if (!session?.sessionName || normalized === String(session.sessionId || '').toUpperCase()) {
    return normalized.slice(0, maxLength);
  }

  const suffix = String(session.sessionId || '').toUpperCase();
  const combined = suffix ? `${normalized}-${suffix}` : normalized;
  return combined.slice(0, maxLength);
}
