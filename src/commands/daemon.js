import crypto from 'node:crypto';
import { bootstrapRuntime } from '../lib/command-helpers.js';
import { composeFrameWithOverlay } from '../lib/frame-overlay.js';
import {
  SessionRegistry,
  defaultSessionLabel,
  hasActiveSessions,
  selectActiveRenderableSessions,
  selectLatestTerminalSession,
  selectRenderableSessions
} from '../lib/session-registry.js';
import { RUN_STATES } from '../lib/constants.js';

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
    sessionOrderCursor: 0
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
    rotateIntervalMs: config.rotateIntervalMs,
    rotateMaxSessions: config.rotateMaxSessions
  }, 'Dot Codex rotator started');

  while (true) {
    const now = Date.now();
    const sessions = selectRenderableSessions(registry.listSessions(), {
      now,
      rotateMaxSessions: config.rotateMaxSessions,
      activeSessionStaleMs: config.activeSessionStaleMs,
      terminalSessionTtlMs: config.terminalSessionTtlMs
    });

    if (sessions.length === 0) {
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
            runtimeState: state
          });
          state.displayedSignatureBySession.set(latestTerminal.sessionId, signature);
          state.currentSessionId = latestTerminal.sessionId;
        }
      } else {
        resetTakeoverState(state);
      }

      publishStatus({ registry, state, sessions, activeSessions, mode: 'idle' });

      await sleep(config.rotatorPollMs);
      continue;
    }

    const target = selectNextSession({ state, sessions: activeSessions, now });
    const signature = `${target.sessionId}:${target.state}:${target.sequenceVersion}`;
    const hasSeenSignature = state.displayedSignatureBySession.get(target.sessionId) === signature;
    const shouldAnimate = !hasSeenSignature;
    const isSessionSwitch = state.currentSessionId !== target.sessionId;

    if (isSessionSwitch || shouldAnimate) {
      await pushSessionFrames({
        client,
        assetStore,
        config,
        logger,
        session: target,
        includeEnter: shouldAnimate,
        runtimeState: state
      });

      state.displayedSignatureBySession.set(target.sessionId, signature);
      state.currentSessionId = target.sessionId;
      state.currentSlotEndsAt = Date.now() + config.rotateIntervalMs;
    }

    publishStatus({ registry, state, sessions, activeSessions, mode: 'takeover' });

    await sleep(config.rotatorPollMs);
  }
}

function resetTakeoverState(state) {
  state.currentSessionId = null;
  state.currentSlotEndsAt = 0;
}

function selectNextSession({ state, sessions, now }) {
  if (sessions.length === 1) {
    state.sessionOrderCursor = 0;
    return sessions[0];
  }

  const currentIndex = sessions.findIndex((session) => session.sessionId === state.currentSessionId);
  if (currentIndex === -1) {
    state.sessionOrderCursor = 0;
    return sessions[0];
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

async function pushSessionFrames({ client, assetStore, config, logger, session, includeEnter, runtimeState }) {
  const frames = assetStore.getStateSequence(session.state, { includeEnter });
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
    if (fingerprint === runtimeState.lastFingerprint) {
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
      frame: frames[index]
    }, 'Rotator pushed frame to Quote/0');
  }
}

function publishStatus({ registry, state, sessions, activeSessions, mode }) {
  registry.writeStatus({
    updatedAt: Date.now(),
    mode,
    currentSessionId: state.currentSessionId,
    currentSlotEndsAt: state.currentSlotEndsAt,
    renderableSessionIds: sessions.map((session) => session.sessionId),
    activeSessionIds: activeSessions.map((session) => session.sessionId),
    lastFingerprint: state.lastFingerprint
  });
}
