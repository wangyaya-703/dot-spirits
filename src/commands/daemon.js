import crypto from 'node:crypto';
import { bootstrapRuntime } from '../lib/command-helpers.js';
import { composeFrameWithOverlay } from '../lib/frame-overlay.js';
import {
  SessionRegistry,
  defaultSessionLabel,
  hasActiveSessions,
  pruneExpiredSessions,
  selectActiveRenderableSessions,
  selectFocusedActiveSession,
  selectLatestTerminalSession,
  selectRenderableSessions
} from '../lib/session-registry.js';
import { ACTIVE_STATES, RUN_STATES } from '../lib/constants.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function daemonCommand(cliOptions) {
  const { config, client, assetStore, logger } = await bootstrapRuntime({
    cliOptions,
    needsDevice: true,
    needsTaskKey: true
  });

  const registry = new SessionRegistry({ runtimeRoot: config.runtimeRoot, logger });
  registry.writePid();

  const state = {
    currentSessionId: null,
    currentSlotEndsAt: 0,
    displayedSignatureBySession: new Map(),
    lastPushAt: 0,
    lastFingerprint: null,
    lastOwnedImageUrl: null,
    runningFrameIndexBySession: new Map(),
    sessionOrderCursor: 0,
    lastSessionState: null
  };

  const cleanup = () => {
    registry.clearPid();
    registry.clearStatus();
  };
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
  process.once('exit', cleanup);

  logger.info({
    runtimeRoot: config.runtimeRoot,
    logFilePath: config.logFilePath,
    rotateIntervalMs: config.rotateIntervalMs,
    rotateMaxSessions: config.rotateMaxSessions,
    minRefreshIntervalMs: config.minRefreshIntervalMs,
    frameIntervalMs: config.frameIntervalMs,
    maxEnterFrames: config.maxEnterFrames,
    activeSessionFocusMs: config.activeSessionFocusMs,
    startingDisplayDelayMs: config.startingDisplayDelayMs,
    stateChangeSettleMs: config.stateChangeSettleMs,
    runningFrameCycleMs: config.runningFrameCycleMs,
    takeoverReassertMs: config.takeoverReassertMs
  }, 'Dot Codex rotator started');

  while (true) {
    const now = Date.now();
    const terminalRetentionMs = Math.max(config.resultHoldMs, config.terminalPromotionMs);
    const snapshotSessions = registry.listSessions();
    pruneExpiredSessions(registry, snapshotSessions, {
      now,
      activeSessionStaleMs: config.activeSessionStaleMs,
      terminalRetentionMs
    });

    const sessions = selectRenderableSessions(registry.listSessions(), {
      now,
      rotateMaxSessions: config.rotateMaxSessions,
      activeSessionStaleMs: config.activeSessionStaleMs,
      terminalSessionTtlMs: terminalRetentionMs
    });

    if (sessions.length === 0) {
      if (state.currentSessionId || state.lastOwnedImageUrl) {
        logger.info({
          previousSessionId: state.currentSessionId,
          lastOwnedImageUrl: state.lastOwnedImageUrl
        }, 'No renderable sessions remain; releasing Dot takeover state');
      }
      resetTakeoverState(state);
      await sleep(config.rotatorPollMs);
      continue;
    }

    const active = hasActiveSessions(sessions, {
      now,
      activeSessionStaleMs: config.activeSessionStaleMs
    });
    const activeSessions = active
      ? selectActiveRenderableSessions(sessions, {
          now,
          rotateMaxSessions: config.rotateMaxSessions,
          activeSessionStaleMs: config.activeSessionStaleMs
        })
      : [];
    const focusedActive = active
      ? selectFocusedActiveSession(activeSessions, {
          now,
          activeSessionFocusMs: config.activeSessionFocusMs
        })
      : null;

    if (!active) {
      const latestTerminal = selectLatestTerminalSession(sessions);
      if (
        latestTerminal &&
        now - (latestTerminal.updatedAt || 0) <= config.resultHoldMs
      ) {
        const signature = `${latestTerminal.sessionId}:${latestTerminal.state}:${latestTerminal.sequenceVersion}`;
        const hasSeenSignature = state.displayedSignatureBySession.get(latestTerminal.sessionId) === signature;
        if (!hasSeenSignature || state.currentSessionId !== latestTerminal.sessionId) {
          await pushSessionFrames({
            client,
            assetStore,
            config,
            logger,
            session: latestTerminal,
            includeEnter: !hasSeenSignature,
            reason: hasSeenSignature ? 'latest_terminal_reassert' : 'latest_terminal_result',
            runtimeState: state
          });
          state.displayedSignatureBySession.set(latestTerminal.sessionId, signature);
          state.currentSessionId = latestTerminal.sessionId;
          state.lastSessionState = latestTerminal.state;
        }
      } else {
        if (state.currentSessionId) {
          logger.info({
            previousSessionId: state.currentSessionId
          }, 'Latest terminal result expired; releasing Dot takeover state');
        }
        resetTakeoverState(state);
      }

      publishStatus({ registry, state, sessions, activeSessions, mode: 'idle' });

      await sleep(config.rotatorPollMs);
      continue;
    }

    const target = selectNextSession({ state, sessions: activeSessions, focusedActive, now });
    const signature = `${target.sessionId}:${target.state}:${target.sequenceVersion}`;
    const hasSeenSignature = state.displayedSignatureBySession.get(target.sessionId) === signature;
    const shouldAnimate = !hasSeenSignature;
    const isSessionSwitch = state.currentSessionId !== target.sessionId;
    const dueForReassert = (
      config.takeoverReassertMs > 0 &&
      !isSessionSwitch &&
      !shouldAnimate &&
      state.currentSessionId === target.sessionId &&
      now - state.lastPushAt >= config.takeoverReassertMs
    );
    const shouldReassert = dueForReassert
      ? await shouldReclaimTakeover({ client, runtimeState: state, logger })
      : false;
    const shouldCycleRunningFrame = (
      target.state === RUN_STATES.RUNNING &&
      !isSessionSwitch &&
      !shouldAnimate &&
      !shouldReassert &&
      config.runningFrameCycleMs > 0 &&
      now - state.lastPushAt >= config.runningFrameCycleMs
    );
    const shouldDeferActiveStatePush = shouldDeferRapidActiveStatePush({
      runtimeState: state,
      target,
      isSessionSwitch,
      shouldAnimate,
      now,
      config
    });
    const shouldDeferStartingPush = shouldDeferStartingDisplay({
      target,
      shouldAnimate,
      now,
      config
    });

    if (shouldDeferStartingPush) {
      logger.info({
        sessionId: target.sessionId,
        state: target.state,
        lastStateChangeAt: target.lastStateChangeAt || target.updatedAt,
        startingDisplayDelayMs: config.startingDisplayDelayMs
      }, 'Deferring starting artwork while the session is still warming up');
      publishStatus({ registry, state, sessions, activeSessions, promotedTerminal: null, mode: 'takeover' });
      await sleep(config.rotatorPollMs);
      continue;
    }

    if (shouldDeferActiveStatePush) {
      logger.info({
        sessionId: target.sessionId,
        previousState: state.lastSessionState,
        nextState: target.state,
        lastPushAt: state.lastPushAt,
        stateChangeSettleMs: config.stateChangeSettleMs
      }, 'Deferring rapid active-state repaint');
      publishStatus({ registry, state, sessions, activeSessions, promotedTerminal: null, mode: 'takeover' });
      await sleep(config.rotatorPollMs);
      continue;
    }

    if (isSessionSwitch || shouldAnimate || shouldReassert || shouldCycleRunningFrame) {
      await pushSessionFrames({
        client,
        assetStore,
        config,
        logger,
        session: target,
        includeEnter: shouldAnimate,
        runningLoopOnly: shouldCycleRunningFrame,
        forceDuplicateHold: shouldReassert,
        reason: summarizePushReason({ isSessionSwitch, shouldAnimate, shouldReassert, shouldCycleRunningFrame }),
        runtimeState: state
      });

      state.displayedSignatureBySession.set(target.sessionId, signature);
      state.currentSessionId = target.sessionId;
      state.lastSessionState = target.state;
      if (isSessionSwitch || shouldAnimate) {
        state.currentSlotEndsAt = Date.now() + config.rotateIntervalMs;
      }
    }

    publishStatus({ registry, state, sessions, activeSessions, promotedTerminal: null, mode: 'takeover' });

    await sleep(config.rotatorPollMs);
  }
}

function resetTakeoverState(state) {
  state.currentSessionId = null;
  state.currentSlotEndsAt = 0;
  state.lastOwnedImageUrl = null;
}

export function selectNextSession({ state, sessions, focusedActive = null, now }) {
  if (sessions.length === 1) {
    state.sessionOrderCursor = 0;
    return sessions[0];
  }

  const currentIndex = sessions.findIndex((session) => session.sessionId === state.currentSessionId);
  if (currentIndex === -1) {
    const fallback = focusedActive || sessions[0];
    state.sessionOrderCursor = sessions.findIndex((session) => session.sessionId === fallback.sessionId);
    return fallback;
  }

  const current = sessions[currentIndex];
  const currentSignature = `${current.sessionId}:${current.state}:${current.sequenceVersion}`;
  const seenSignature = state.displayedSignatureBySession.get(current.sessionId);
  const currentChanged = currentSignature !== seenSignature;

  const urgent = sessions.find((session) =>
    session.state === RUN_STATES.WAITING_INPUT && session.sessionId !== current.sessionId
  );
  if (urgent) {
    state.sessionOrderCursor = sessions.findIndex((session) => session.sessionId === urgent.sessionId);
    return urgent;
  }

  if (focusedActive && focusedActive.sessionId !== current.sessionId) {
    state.sessionOrderCursor = sessions.findIndex((session) => session.sessionId === focusedActive.sessionId);
    return focusedActive;
  }

  if (currentChanged) {
    state.sessionOrderCursor = currentIndex;
    return current;
  }

  if (now < state.currentSlotEndsAt) {
    state.sessionOrderCursor = currentIndex;
    return current;
  }

  const nextIndex = (currentIndex + 1) % sessions.length;
  state.sessionOrderCursor = nextIndex;
  return sessions[nextIndex];
}

export function shouldDeferRapidActiveStatePush({ runtimeState, target, isSessionSwitch, shouldAnimate, now, config }) {
  if (!shouldAnimate || isSessionSwitch) {
    return false;
  }

  if (!config.stateChangeSettleMs || config.stateChangeSettleMs <= 0) {
    return false;
  }

  if (!runtimeState.currentSessionId || runtimeState.currentSessionId !== target.sessionId) {
    return false;
  }

  if (!ACTIVE_STATES.has(target.state) || !ACTIVE_STATES.has(runtimeState.lastSessionState)) {
    return false;
  }

  if (target.state === RUN_STATES.WAITING_INPUT || runtimeState.lastSessionState === RUN_STATES.WAITING_INPUT) {
    return false;
  }

  return now - runtimeState.lastPushAt < config.stateChangeSettleMs;
}

export function shouldDeferStartingDisplay({ target, shouldAnimate, now, config }) {
  if (!shouldAnimate || target?.state !== RUN_STATES.STARTING) {
    return false;
  }

  if (!config.startingDisplayDelayMs || config.startingDisplayDelayMs <= 0) {
    return false;
  }

  const stateStartedAt = target.lastStateChangeAt || target.updatedAt || 0;
  return now - stateStartedAt < config.startingDisplayDelayMs;
}

function summarizePushReason({ isSessionSwitch, shouldAnimate, shouldReassert, shouldCycleRunningFrame }) {
  if (shouldReassert) {
    return 'takeover_reassert';
  }
  if (shouldCycleRunningFrame) {
    return 'running_cycle';
  }
  if (isSessionSwitch && shouldAnimate) {
    return 'session_switch_with_state_change';
  }
  if (isSessionSwitch) {
    return 'session_switch';
  }
  if (shouldAnimate) {
    return 'state_change';
  }
  return 'steady_state';
}

async function pushSessionFrames({ client, assetStore, config, logger, session, includeEnter, runningLoopOnly = false, forceDuplicateHold = false, reason = 'unspecified', runtimeState }) {
  const frames = runningLoopOnly
    ? getRunningLoopFrames({ assetStore, session, runtimeState })
    : assetStore.getStateSequence(session.state, {
        includeEnter,
        maxEnterFrames: config.maxEnterFrames
      });
  for (let index = 0; index < frames.length; index += 1) {
    const buffer = assetStore.readImageBuffer(frames[index]);
    const rendered = composeFrameWithOverlay(buffer, {
      state: session.state,
      stateLabel: session.stateLabel || defaultSessionLabel(session.state),
      sessionId: session.sessionId,
      sessionName: session.sessionName
    });

    const minIntervalMs = index === 0 ? config.minRefreshIntervalMs : config.frameIntervalMs;
    const delta = Date.now() - runtimeState.lastPushAt;
    if (delta < minIntervalMs) {
      await sleep(minIntervalMs - delta);
    }

    const imageBase64 = rendered.toString('base64');
    const fingerprint = crypto.createHash('sha1').update(imageBase64).digest('hex');
    const forcePush = forceDuplicateHold && index === frames.length - 1;
    if (!forcePush && fingerprint === runtimeState.lastFingerprint) {
      logger.debug({
        sessionId: session.sessionId,
        state: session.state,
        frame: frames[index],
        reason
      }, 'Skipping duplicate rotator frame push');
      continue;
    }

    await client.pushImage({
      imageBase64,
      refreshNow: true,
      border: config.border,
      ditherType: config.ditherType,
      ditherKernel: config.ditherKernel,
      taskKey: config.taskKey
    });

    runtimeState.lastPushAt = Date.now();
    runtimeState.lastFingerprint = fingerprint;
    logger.info({
      sessionId: session.sessionId,
      state: session.state,
      reason,
      frameIndex: index + 1,
      frameCount: frames.length,
      frame: frames[index]
    }, 'Rotator pushed frame to Quote/0');
  }

  await refreshOwnedRender({ client, runtimeState, logger });
}

function getRunningLoopFrames({ assetStore, session, runtimeState }) {
  const frames = assetStore.getAmbientStateFrames(session.state, { variantCount: 1 });
  if (frames.length <= 1) {
    return frames;
  }

  const currentIndex = runtimeState.runningFrameIndexBySession.get(session.sessionId) ?? (frames.length - 1);
  const nextIndex = (currentIndex + 1) % frames.length;
  runtimeState.runningFrameIndexBySession.set(session.sessionId, nextIndex);
  return [frames[nextIndex]];
}

function publishStatus({ registry, state, sessions, activeSessions, promotedTerminal, mode }) {
  registry.writeStatus({
    updatedAt: Date.now(),
    mode,
    currentSessionId: state.currentSessionId,
    currentSlotEndsAt: state.currentSlotEndsAt,
    renderableSessionIds: sessions.map((session) => session.sessionId),
    activeSessionIds: activeSessions.map((session) => session.sessionId),
    promotedTerminalSessionId: promotedTerminal?.sessionId || null,
    lastFingerprint: state.lastFingerprint,
    lastOwnedImageUrl: state.lastOwnedImageUrl
  });
}

async function refreshOwnedRender({ client, runtimeState, logger }) {
  try {
    const status = await client.getStatus();
    runtimeState.lastOwnedImageUrl = status?.renderInfo?.current?.image?.[0] || null;
    logger.debug?.({
      lastOwnedImageUrl: runtimeState.lastOwnedImageUrl
    }, 'Refreshed last owned Dot render info');
  } catch (error) {
    logger.debug?.({ err: error }, 'Unable to refresh owned Dot render info after push');
  }
}

async function shouldReclaimTakeover({ client, runtimeState, logger }) {
  if (!runtimeState.lastOwnedImageUrl) {
    return false;
  }

  try {
    const status = await client.getStatus();
    const currentImageUrl = status?.renderInfo?.current?.image?.[0] || null;
    const shouldReclaim = Boolean(currentImageUrl && currentImageUrl !== runtimeState.lastOwnedImageUrl);
    if (shouldReclaim) {
      logger.info({
        currentImageUrl,
        lastOwnedImageUrl: runtimeState.lastOwnedImageUrl
      }, 'Dot render no longer matches last owned image; reclaiming takeover');
    } else {
      logger.debug?.({
        currentImageUrl,
        lastOwnedImageUrl: runtimeState.lastOwnedImageUrl
      }, 'Dot render still matches current takeover image');
    }

    return shouldReclaim;
  } catch (error) {
    logger.debug?.({ err: error }, 'Unable to verify Dot current image; skipping smart takeover reclaim');
    return false;
  }
}
