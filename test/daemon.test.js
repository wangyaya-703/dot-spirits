import test from 'node:test';
import assert from 'node:assert/strict';
import { RUN_STATES } from '../src/lib/constants.js';
import {
  selectNextSession,
  shouldReclaimTakeover,
  shouldDeferRapidActiveStatePush,
  shouldDeferStartingDisplay
} from '../src/commands/daemon.js';

test('selectNextSession keeps the sole active session instead of reviving terminal content', () => {
  const state = {
    currentSessionId: 'A',
    currentSlotEndsAt: 10_000,
    displayedSignatureBySession: new Map(),
    sessionOrderCursor: 0
  };
  const sessions = [
    { sessionId: 'A', state: RUN_STATES.RUNNING, sequenceVersion: 1 }
  ];

  const target = selectNextSession({
    state,
    sessions,
    focusedActive: null,
    now: 1_000
  });

  assert.equal(target.sessionId, 'A');
});

test('selectNextSession jumps to a freshly changed active session before the slot expires', () => {
  const state = {
    currentSessionId: 'A',
    currentSlotEndsAt: 20_000,
    displayedSignatureBySession: new Map([
      ['A', 'A:running:1']
    ]),
    sessionOrderCursor: 0
  };
  const sessions = [
    { sessionId: 'B', state: RUN_STATES.STARTING, sequenceVersion: 1, lastStateChangeAt: 9_000, updatedAt: 9_000 },
    { sessionId: 'A', state: RUN_STATES.RUNNING, sequenceVersion: 1, lastStateChangeAt: 1_000, updatedAt: 1_000 }
  ];

  const target = selectNextSession({
    state,
    sessions,
    focusedActive: sessions[0],
    now: 10_000
  });

  assert.equal(target.sessionId, 'B');
});

test('selectNextSession preempts to waiting_input before other active sessions', () => {
  const state = {
    currentSessionId: 'A',
    currentSlotEndsAt: 20_000,
    displayedSignatureBySession: new Map([['A', 'A:running:1']]),
    sessionOrderCursor: 0
  };
  const sessions = [
    { sessionId: 'A', state: RUN_STATES.RUNNING, sequenceVersion: 1, updatedAt: 1_000 },
    { sessionId: 'B', state: RUN_STATES.WAITING_INPUT, sequenceVersion: 1, updatedAt: 2_000 },
    { sessionId: 'C', state: RUN_STATES.RUNNING, sequenceVersion: 1, updatedAt: 3_000 }
  ];

  const target = selectNextSession({
    state,
    sessions,
    focusedActive: sessions[2],
    now: 10_000
  });

  assert.equal(target.sessionId, 'B');
});

test('selectNextSession keeps current session when its signature changed', () => {
  const state = {
    currentSessionId: 'A',
    currentSlotEndsAt: 20_000,
    displayedSignatureBySession: new Map([['A', 'A:running:1']]),
    sessionOrderCursor: 0
  };
  const sessions = [
    { sessionId: 'A', state: RUN_STATES.RUNNING, sequenceVersion: 2, updatedAt: 2_000 },
    { sessionId: 'B', state: RUN_STATES.RUNNING, sequenceVersion: 1, updatedAt: 3_000 }
  ];

  const target = selectNextSession({
    state,
    sessions,
    focusedActive: null,
    now: 10_000
  });

  assert.equal(target.sessionId, 'A');
});

test('selectNextSession rotates when the current slot expires', () => {
  const state = {
    currentSessionId: 'A',
    currentSlotEndsAt: 5_000,
    displayedSignatureBySession: new Map([['A', 'A:running:1']]),
    sessionOrderCursor: 0
  };
  const sessions = [
    { sessionId: 'A', state: RUN_STATES.RUNNING, sequenceVersion: 1, updatedAt: 1_000 },
    { sessionId: 'B', state: RUN_STATES.RUNNING, sequenceVersion: 1, updatedAt: 2_000 },
    { sessionId: 'C', state: RUN_STATES.RUNNING, sequenceVersion: 1, updatedAt: 3_000 }
  ];

  const target = selectNextSession({
    state,
    sessions,
    focusedActive: null,
    now: 10_000
  });

  assert.equal(target.sessionId, 'B');
});

test('selectNextSession wraps around during round-robin rotation', () => {
  const state = {
    currentSessionId: 'C',
    currentSlotEndsAt: 5_000,
    displayedSignatureBySession: new Map([['C', 'C:running:1']]),
    sessionOrderCursor: 2
  };
  const sessions = [
    { sessionId: 'A', state: RUN_STATES.RUNNING, sequenceVersion: 1, updatedAt: 1_000 },
    { sessionId: 'B', state: RUN_STATES.RUNNING, sequenceVersion: 1, updatedAt: 2_000 },
    { sessionId: 'C', state: RUN_STATES.RUNNING, sequenceVersion: 1, updatedAt: 3_000 }
  ];

  const target = selectNextSession({
    state,
    sessions,
    focusedActive: null,
    now: 10_000
  });

  assert.equal(target.sessionId, 'A');
});

test('shouldDeferRapidActiveStatePush coalesces rapid active-state churn on the same session', () => {
  const deferred = shouldDeferRapidActiveStatePush({
    runtimeState: {
      currentSessionId: 'A',
      lastSessionState: RUN_STATES.STARTING,
      lastPushAt: 7_000
    },
    target: {
      sessionId: 'A',
      state: RUN_STATES.RUNNING
    },
    isSessionSwitch: false,
    shouldAnimate: true,
    now: 10_000,
    config: {
      stateChangeSettleMs: 5_000
    }
  });

  assert.equal(deferred, true);
});

test('shouldDeferRapidActiveStatePush never delays waiting_input', () => {
  const deferred = shouldDeferRapidActiveStatePush({
    runtimeState: {
      currentSessionId: 'A',
      lastSessionState: RUN_STATES.RUNNING,
      lastPushAt: 7_000
    },
    target: {
      sessionId: 'A',
      state: RUN_STATES.WAITING_INPUT
    },
    isSessionSwitch: false,
    shouldAnimate: true,
    now: 10_000,
    config: {
      stateChangeSettleMs: 5_000
    }
  });

  assert.equal(deferred, false);
});

test('shouldDeferRapidActiveStatePush does not defer after a session switch', () => {
  const deferred = shouldDeferRapidActiveStatePush({
    runtimeState: {
      currentSessionId: 'A',
      lastSessionState: RUN_STATES.STARTING,
      lastPushAt: 7_000
    },
    target: {
      sessionId: 'B',
      state: RUN_STATES.RUNNING
    },
    isSessionSwitch: true,
    shouldAnimate: true,
    now: 10_000,
    config: {
      stateChangeSettleMs: 5_000
    }
  });

  assert.equal(deferred, false);
});

test('shouldDeferRapidActiveStatePush does not defer after settle window expires', () => {
  const deferred = shouldDeferRapidActiveStatePush({
    runtimeState: {
      currentSessionId: 'A',
      lastSessionState: RUN_STATES.STARTING,
      lastPushAt: 1_000
    },
    target: {
      sessionId: 'A',
      state: RUN_STATES.RUNNING
    },
    isSessionSwitch: false,
    shouldAnimate: true,
    now: 10_000,
    config: {
      stateChangeSettleMs: 5_000
    }
  });

  assert.equal(deferred, false);
});

test('shouldDeferStartingDisplay hides starting artwork during the warm-up window', () => {
  const deferred = shouldDeferStartingDisplay({
    target: {
      sessionId: 'A',
      state: RUN_STATES.STARTING,
      lastStateChangeAt: 8_000
    },
    shouldAnimate: true,
    now: 10_000,
    config: {
      startingDisplayDelayMs: 4_000
    }
  });

  assert.equal(deferred, true);
});

test('shouldDeferStartingDisplay stops deferring once the warm-up window is over', () => {
  const deferred = shouldDeferStartingDisplay({
    target: {
      sessionId: 'A',
      state: RUN_STATES.STARTING,
      lastStateChangeAt: 4_000
    },
    shouldAnimate: true,
    now: 10_000,
    config: {
      startingDisplayDelayMs: 4_000
    }
  });

  assert.equal(deferred, false);
});

test('shouldReclaimTakeover skips API calls until the reclaim interval elapses', async () => {
  const client = {
    calls: 0,
    async getStatus() {
      this.calls += 1;
      return {
        renderInfo: {
          current: {
            image: ['https://example.com/current.png']
          }
        }
      };
    }
  };
  const runtimeState = {
    lastOwnedImageUrl: 'https://example.com/owned.png',
    lastReclaimCheckAt: 1_000
  };
  const logger = { debug() {}, info() {} };

  const skipped = await shouldReclaimTakeover({
    client,
    runtimeState,
    logger,
    now: 1_100,
    minCheckIntervalMs: 500
  });
  const checked = await shouldReclaimTakeover({
    client,
    runtimeState,
    logger,
    now: 1_600,
    minCheckIntervalMs: 500
  });

  assert.equal(skipped, false);
  assert.equal(checked, true);
  assert.equal(client.calls, 1);
});

test('shouldDeferStartingDisplay bypasses non-starting states', () => {
  const deferred = shouldDeferStartingDisplay({
    target: {
      sessionId: 'A',
      state: RUN_STATES.RUNNING,
      lastStateChangeAt: 8_000
    },
    shouldAnimate: true,
    now: 10_000,
    config: {
      startingDisplayDelayMs: 4_000
    }
  });

  assert.equal(deferred, false);
});

test('shouldDeferStartingDisplay disables itself when delay is zero', () => {
  const deferred = shouldDeferStartingDisplay({
    target: {
      sessionId: 'A',
      state: RUN_STATES.STARTING,
      lastStateChangeAt: 9_500
    },
    shouldAnimate: true,
    now: 10_000,
    config: {
      startingDisplayDelayMs: 0
    }
  });

  assert.equal(deferred, false);
});
