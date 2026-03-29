import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasActiveSessions,
  selectLatestTerminalSession,
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
