import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSessionDisplayName,
  hasActiveSessions,
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
