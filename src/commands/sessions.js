import { bootstrapRuntime, printJson } from '../lib/command-helpers.js';
import {
  SessionRegistry,
  getSessionDisplayName,
  hasActiveSessions,
  selectActiveRenderableSessions,
  selectLatestTerminalSession,
  selectRenderableSessions
} from '../lib/session-registry.js';

export async function sessionsCommand(cliOptions) {
  const { config, logger } = await bootstrapRuntime({
    cliOptions,
    needsDevice: false,
    needsTaskKey: false
  });

  const registry = new SessionRegistry({ runtimeRoot: config.runtimeRoot, logger });
  const now = Date.now();
  const allSessions = registry.listSessions()
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
  const renderableSessions = selectRenderableSessions(allSessions, {
    now,
    rotateMaxSessions: config.rotateMaxSessions,
    activeSessionStaleMs: config.activeSessionStaleMs,
    terminalSessionTtlMs: config.terminalSessionTtlMs
  });
  const activeSessions = selectActiveRenderableSessions(allSessions, {
    now,
    rotateMaxSessions: config.rotateMaxSessions,
    activeSessionStaleMs: config.activeSessionStaleMs
  });
  const latestTerminal = selectLatestTerminalSession(renderableSessions);
  const status = registry.readStatus();

  printJson({
    runtimeRoot: config.runtimeRoot,
    rotator: {
      pid: registry.readPid()?.pid || null,
      status
    },
    summary: {
      totalSessions: allSessions.length,
      renderableSessions: renderableSessions.length,
      activeSessions: activeSessions.length,
      hasActiveSessions: hasActiveSessions(renderableSessions, {
        now,
        activeSessionStaleMs: config.activeSessionStaleMs
      }),
      latestTerminalSessionId: latestTerminal?.sessionId || null
    },
    sessions: renderableSessions.map((session) => ({
      sessionId: session.sessionId,
      sessionName: session.sessionName || null,
      displayName: getSessionDisplayName(session),
      state: session.state,
      terminal: Boolean(session.terminal),
      cwd: session.cwd,
      updatedAt: session.updatedAt,
      heartbeatAt: session.heartbeatAt,
      sequenceVersion: session.sequenceVersion
    }))
  });
}
