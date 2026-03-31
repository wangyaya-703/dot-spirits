import {
  SessionRegistry,
  getSessionDisplayName,
  hasActiveSessions,
  pruneExpiredSessions,
  selectActiveRenderableSessions,
  selectLatestTerminalSession,
  selectPromotableTerminalSession,
  selectRenderableSessions
} from './session-registry.js';

export function readRuntimeStatus({ config, logger }) {
  const registry = new SessionRegistry({ runtimeRoot: config.runtimeRoot, logger });
  const now = Date.now();
  const terminalRetentionMs = Math.max(config.resultHoldMs, config.terminalPromotionMs);
  pruneExpiredSessions(registry, registry.listSessions(), {
    now,
    activeSessionStaleMs: config.activeSessionStaleMs,
    terminalRetentionMs,
    hookSessionTtlMs: config.hookSessionTtlMs
  });

  const allSessions = registry.listSessions()
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
  const renderableSessions = selectRenderableSessions(allSessions, {
    now,
    rotateMaxSessions: config.rotateMaxSessions,
    activeSessionStaleMs: config.activeSessionStaleMs,
    terminalSessionTtlMs: terminalRetentionMs,
    hookSessionTtlMs: config.hookSessionTtlMs
  });
  const activeSessions = selectActiveRenderableSessions(allSessions, {
    now,
    rotateMaxSessions: config.rotateMaxSessions,
    activeSessionStaleMs: config.activeSessionStaleMs,
    hookSessionTtlMs: config.hookSessionTtlMs
  });
  const latestTerminal = selectLatestTerminalSession(renderableSessions);
  const status = registry.readStatus();
  const promotedTerminal = selectPromotableTerminalSession(renderableSessions, {
    now,
    terminalPromotionMs: config.terminalPromotionMs
  });
  const hasActive = hasActiveSessions(renderableSessions, {
    now,
    activeSessionStaleMs: config.activeSessionStaleMs,
    hookSessionTtlMs: config.hookSessionTtlMs
  });

  return {
    runtimeRoot: config.runtimeRoot,
    rotator: {
      pid: registry.readPid()?.pid || null,
      status
    },
    summary: {
      totalSessions: allSessions.length,
      renderableSessions: renderableSessions.length,
      activeSessions: activeSessions.length,
      hasActiveSessions: hasActive,
      latestTerminalSessionId: latestTerminal?.sessionId || null,
      promotedTerminalSessionId: promotedTerminal?.sessionId || null,
      takeoverLocked: Boolean(status?.mode === 'takeover' && activeSessions.length > 0),
      summaryBoardActive: status?.currentSessionId === '__SUMMARY__'
    },
    sessions: renderableSessions.map((session) => ({
      sessionId: session.sessionId,
      agentType: session.agentType || 'codex',
      codexThreadId: session.codexThreadId || null,
      sessionName: session.sessionName || null,
      displayName: getSessionDisplayName(session),
      state: session.state,
      terminal: Boolean(session.terminal),
      cwd: session.cwd,
      updatedAt: session.updatedAt,
      heartbeatAt: session.heartbeatAt,
      sequenceVersion: session.sequenceVersion
    }))
  };
}
