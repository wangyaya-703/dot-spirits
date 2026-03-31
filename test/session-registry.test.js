import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SessionRegistry,
  getSessionDisplayName,
  hasActiveSessions,
  pruneExpiredSessions,
  selectActiveRenderableSessions,
  selectFocusedActiveSession,
  selectLatestTerminalSession,
  selectPromotableTerminalSession,
  selectRenderableSessions
} from '../src/lib/session-registry.js';

test('selectRenderableSessions keeps most recent sessions within limits', () => {
  const now = 1_000_000;
  const sessions = [
    { sessionId: 'A', state: 'running', updatedAt: now - 1000, heartbeatAt: now - 1000 },
    { sessionId: 'B', state: 'completed', updatedAt: now - 2000, heartbeatAt: now - 2000 },
    { sessionId: 'C', state: 'running', updatedAt: now - 3000, heartbeatAt: now - 3000 }
  ];

  const renderable = selectRenderableSessions(sessions, {
    now,
    rotateMaxSessions: 2,
    activeSessionStaleMs: 90_000,
    terminalSessionTtlMs: 1_800_000
  });

  assert.deepEqual(renderable.map((session) => session.sessionId), ['A', 'B']);
});

test('hasActiveSessions only returns true for fresh active states', () => {
  const now = 1_000_000;
  assert.equal(hasActiveSessions([
    { sessionId: 'A', state: 'completed', updatedAt: now - 1000, heartbeatAt: now - 1000 }
  ], {
    now,
    activeSessionStaleMs: 90_000
  }), false);

  assert.equal(hasActiveSessions([
    { sessionId: 'A', state: 'running', updatedAt: now - 1000, heartbeatAt: now - 1000 }
  ], {
    now,
    activeSessionStaleMs: 90_000
  }), true);
});

test('selectLatestTerminalSession returns the newest terminal state', () => {
  const terminal = selectLatestTerminalSession([
    { sessionId: 'A', state: 'completed', updatedAt: 10 },
    { sessionId: 'B', state: 'running', updatedAt: 20 },
    { sessionId: 'C', state: 'failed', updatedAt: 30 }
  ]);

  assert.equal(terminal.sessionId, 'C');
  assert.equal(terminal.state, 'failed');
});

test('selectActiveRenderableSessions excludes terminal sessions while active work exists', () => {
  const now = 1_000_000;
  const sessions = [
    { sessionId: 'A', state: 'running', updatedAt: now - 1000, heartbeatAt: now - 1000 },
    { sessionId: 'B', state: 'completed', updatedAt: now - 500, heartbeatAt: now - 500 },
    { sessionId: 'C', state: 'waiting_input', updatedAt: now - 2000, heartbeatAt: now - 2000 }
  ];

  const activeRenderable = selectActiveRenderableSessions(sessions, {
    now,
    rotateMaxSessions: 5,
    activeSessionStaleMs: 90_000
  });

  assert.deepEqual(activeRenderable.map((session) => session.sessionId), ['A', 'C']);
});

test('getSessionDisplayName prefers session name over raw id', () => {
  assert.equal(
    getSessionDisplayName({ sessionId: '99E1', sessionName: 'demo-project' }),
    'DEMO-PROJECT'
  );
  assert.equal(
    getSessionDisplayName({ sessionId: '99E1', sessionName: '工作台' }),
    'GZT'
  );
  assert.equal(
    getSessionDisplayName({ sessionId: '99E1', sessionName: null }),
    '99E1'
  );
});

test('selectPromotableTerminalSession returns only fresh unseen terminal events', () => {
  const now = 1_000_000;
  const session = selectPromotableTerminalSession([
    { sessionId: 'A', state: 'completed', updatedAt: now - 2000, lastStateChangeAt: now - 2000, sequenceVersion: 3 },
    { sessionId: 'B', state: 'running', updatedAt: now - 1000, lastStateChangeAt: now - 1000, sequenceVersion: 2 },
    { sessionId: 'C', state: 'failed', updatedAt: now - 500, lastStateChangeAt: now - 500, sequenceVersion: 4 }
  ], {
    now,
    terminalPromotionMs: 5_000,
    displayedSignatureBySession: new Map([['A', 'A:completed:3']])
  });

  assert.equal(session.sessionId, 'C');
});

test('selectFocusedActiveSession prefers the freshest active change and waiting_input', () => {
  const now = 1_000_000;
  const session = selectFocusedActiveSession([
    { sessionId: 'A', state: 'running', updatedAt: now - 3_000, lastStateChangeAt: now - 3_000 },
    { sessionId: 'B', state: 'waiting_input', updatedAt: now - 4_000, lastStateChangeAt: now - 4_000 },
    { sessionId: 'C', state: 'running', updatedAt: now - 1_000, lastStateChangeAt: now - 1_000 }
  ], {
    now,
    activeSessionFocusMs: 5_000
  });

  assert.equal(session.sessionId, 'B');
});

test('SessionRegistry upsertSession tracks state changes and sequence versions', () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-codex-session-registry-'));
  const registry = new SessionRegistry({ runtimeRoot });

  const first = registry.upsertSession({
    sessionId: 'A1',
    state: 'starting',
    command: 'codex',
    args: [],
    cwd: '/tmp/demo',
    pid: 123
  });
  const second = registry.upsertSession({
    sessionId: 'A1',
    state: 'starting',
    command: 'codex',
    args: [],
    cwd: '/tmp/demo',
    pid: 123
  });
  const third = registry.upsertSession({
    sessionId: 'A1',
    state: 'running',
    command: 'codex',
    args: [],
    cwd: '/tmp/demo',
    pid: 123
  });

  assert.equal(first.sequenceVersion, 1);
  assert.equal(second.sequenceVersion, 1);
  assert.equal(third.sequenceVersion, 2);
  assert.equal(third.lastStateChangeAt >= second.lastStateChangeAt, true);
});

test('SessionRegistry heartbeat refreshes timestamps', async () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-codex-session-registry-'));
  const registry = new SessionRegistry({ runtimeRoot });

  registry.upsertSession({
    sessionId: 'A1',
    state: 'running',
    command: 'codex',
    args: [],
    cwd: '/tmp/demo',
    pid: 123
  });

  await new Promise((resolve) => setTimeout(resolve, 5));
  const refreshed = registry.heartbeat('A1');

  assert.equal(Boolean(refreshed), true);
  assert.equal(refreshed.updatedAt >= refreshed.startedAt, true);
  assert.equal(refreshed.heartbeatAt >= refreshed.startedAt, true);
});

test('pruneExpiredSessions removes stale terminal sessions and dead active sessions', () => {
  const removed = [];
  const registry = {
    removeSession(sessionId) {
      removed.push(sessionId);
    }
  };
  const now = Date.now();

  const result = pruneExpiredSessions(registry, [
    {
      sessionId: 'TERM',
      state: 'completed',
      updatedAt: now - 10_000
    },
    {
      sessionId: 'LIVE',
      state: 'running',
      heartbeatAt: now - 1_000,
      updatedAt: now - 1_000,
      pid: process.pid
    },
    {
      sessionId: 'STALE',
      state: 'running',
      heartbeatAt: now - 10_000,
      updatedAt: now - 10_000,
      pid: 999999
    }
  ], {
    now,
    activeSessionStaleMs: 5_000,
    terminalRetentionMs: 5_000
  });

  assert.deepEqual(result.sort(), ['STALE', 'TERM']);
  assert.deepEqual(removed.sort(), ['STALE', 'TERM']);
});
