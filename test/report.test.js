import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildReportDescriptor, mapReportEventToState, recordReportEvent } from '../src/commands/report.js';
import { SessionRegistry, pruneExpiredSessions } from '../src/lib/session-registry.js';
import { AGENT_TYPES, RUN_STATES } from '../src/lib/constants.js';

test('mapReportEventToState maps Claude hook events to run states', () => {
  assert.equal(mapReportEventToState({ eventName: 'SessionStart' }), RUN_STATES.STARTING);
  assert.equal(mapReportEventToState({ eventName: 'UserPromptSubmit' }), RUN_STATES.RUNNING);
  assert.equal(mapReportEventToState({ eventName: 'PermissionRequest' }), RUN_STATES.WAITING_INPUT);
  assert.equal(mapReportEventToState({ eventName: 'Stop', stopReason: 'cancelled by user' }), RUN_STATES.CANCELLED);
  assert.equal(mapReportEventToState({ eventName: 'Stop', stopReason: 'completed' }), RUN_STATES.COMPLETED);
});

test('buildReportDescriptor prefers stdin hook session id and cwd', () => {
  const descriptor = buildReportDescriptor({
    cliOptions: { agent: AGENT_TYPES.CLAUDE_CODE, event: 'running', sequence: '123' },
    hookInput: {
      session_id: 'claude-session',
      cwd: '/tmp/repo'
    },
    config: {
      hookSessionTtlMs: 60_000
    }
  });

  assert.equal(descriptor.sessionId, 'claude-session');
  assert.equal(descriptor.cwd, '/tmp/repo');
  assert.equal(descriptor.sessionName, 'repo');
  assert.equal(descriptor.sequenceVersion, 123);
});

test('recordReportEvent stores event-driven Claude sessions and ignores stale sequences', () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-codex-report-'));
  const registry = new SessionRegistry({ runtimeRoot });
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const config = { apiKey: null, deviceId: null, taskKey: null };

  const first = recordReportEvent({
    registry,
    descriptor: {
      sessionId: 'claude-session',
      sessionName: 'claude-repo',
      state: RUN_STATES.RUNNING,
      cwd: '/tmp/repo',
      sequenceVersion: 200,
      command: 'dot-codex report',
      args: [],
      agentType: AGENT_TYPES.CLAUDE_CODE,
      heartbeatMode: 'event-driven',
      hookSessionTtlMs: 30_000
    },
    config,
    logger
  });
  const stale = recordReportEvent({
    registry,
    descriptor: {
      sessionId: 'claude-session',
      sessionName: 'claude-repo',
      state: RUN_STATES.WAITING_INPUT,
      cwd: '/tmp/repo',
      sequenceVersion: 199,
      command: 'dot-codex report',
      args: [],
      agentType: AGENT_TYPES.CLAUDE_CODE,
      heartbeatMode: 'event-driven',
      hookSessionTtlMs: 30_000
    },
    config,
    logger
  });
  const fresh = recordReportEvent({
    registry,
    descriptor: {
      sessionId: 'claude-session',
      sessionName: 'claude-repo',
      state: RUN_STATES.WAITING_INPUT,
      cwd: '/tmp/repo',
      sequenceVersion: 201,
      command: 'dot-codex report',
      args: [],
      agentType: AGENT_TYPES.CLAUDE_CODE,
      heartbeatMode: 'event-driven',
      hookSessionTtlMs: 30_000
    },
    config,
    logger
  });

  assert.equal(first.state, RUN_STATES.RUNNING);
  assert.equal(stale.state, RUN_STATES.RUNNING);
  assert.equal(fresh.state, RUN_STATES.WAITING_INPUT);
  assert.equal(fresh.heartbeatMode, 'event-driven');
  assert.equal(fresh.agentType, AGENT_TYPES.CLAUDE_CODE);
});

test('event-driven sessions expire by hook ttl', () => {
  const removed = [];
  const registry = {
    removeSession(sessionId) {
      removed.push(sessionId);
    }
  };
  const now = Date.now();

  const result = pruneExpiredSessions(registry, [
    {
      sessionId: 'CLAUDE',
      state: RUN_STATES.RUNNING,
      heartbeatMode: 'event-driven',
      lastEventAt: now - 90_000,
      hookSessionTtlMs: 60_000,
      updatedAt: now - 90_000
    }
  ], {
    now,
    activeSessionStaleMs: 90_000,
    terminalRetentionMs: 15_000,
    hookSessionTtlMs: 60_000
  });

  assert.deepEqual(result, ['CLAUDE']);
  assert.deepEqual(removed, ['CLAUDE']);
});
