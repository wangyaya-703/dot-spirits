import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TERMINAL_STATES } from './constants.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createAbortError(message) {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function isAbortError(error) {
  return error?.name === 'AbortError' || error?.cause?.name === 'AbortError';
}

function abortableSleep(ms, signal) {
  if (!ms || ms <= 0) {
    return Promise.resolve();
  }

  if (!signal) {
    return sleep(ms);
  }

  if (signal.aborted) {
    return Promise.reject(signal.reason || createAbortError('Sleep aborted'));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason || createAbortError('Sleep aborted'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export class RenderController {
  constructor({ client, assetStore, config, logger, restoreSnapshot = null }) {
    this.client = client;
    this.assetStore = assetStore;
    this.config = config;
    this.logger = logger;
    this.restoreSnapshot = restoreSnapshot;
    this.lastPushAt = 0;
    this.lastFrameFingerprint = null;
    this.pendingState = null;
    this.renderedState = null;
    this.stateVersion = 0;
    this.stateAbortController = new AbortController();
    this.worker = null;
    this.restoreTimer = null;
  }

  async setState(state) {
    if (!state) {
      return;
    }

    if (state !== this.pendingState) {
      this.stateVersion += 1;
      this.stateAbortController.abort(createAbortError(`Superseded by ${state}`));
      this.stateAbortController = new AbortController();
    }

    this.pendingState = state;
    if (!this.worker) {
      this.worker = this.runLoop().finally(() => {
        this.worker = null;
        if (this.pendingState !== this.renderedState) {
          this.setState(this.pendingState).catch((error) => {
            this.logger.error({ err: error }, 'RenderController failed to continue after state update');
          });
        }
      });
    }

    return this.worker;
  }

  async finalize(finalState) {
    clearTimeout(this.restoreTimer);
    await this.setState(finalState);

    if (this.config.restoreMode === 'restore' && TERMINAL_STATES.has(finalState)) {
      await this.restoreAfterDelay();
    }
  }

  async runLoop() {
    while (this.pendingState && this.pendingState !== this.renderedState) {
      const targetState = this.pendingState;
      const targetVersion = this.stateVersion;
      const targetSignal = this.stateAbortController.signal;
      const includeEnter = targetState !== this.renderedState;
      const frames = this.assetStore.getStateSequence(targetState, { includeEnter });

      for (let index = 0; index < frames.length; index += 1) {
        if (!this.isCurrentTarget(targetState, targetVersion)) {
          this.logger.debug({ targetState, supersededBy: this.pendingState }, 'Aborting state animation because a newer state arrived');
          break;
        }

        try {
          await this.pushFrame(frames[index], { signal: targetSignal });
        } catch (error) {
          if (isAbortError(error) && !this.isCurrentTarget(targetState, targetVersion)) {
            this.logger.debug({ targetState, supersededBy: this.pendingState }, 'Stopped stale state push before it reached the device');
            break;
          }

          throw error;
        }

        const isLastFrame = index === frames.length - 1;
        if (!isLastFrame) {
          try {
            await abortableSleep(this.config.frameIntervalMs, targetSignal);
          } catch (error) {
            if (isAbortError(error) && !this.isCurrentTarget(targetState, targetVersion)) {
              break;
            }

            throw error;
          }
        }
      }

      if (this.isCurrentTarget(targetState, targetVersion)) {
        this.renderedState = targetState;
      }
    }
  }

  async pushFrame(framePath, options = {}) {
    if (!fs.existsSync(framePath)) {
      throw new Error(`Cannot push missing frame: ${framePath}`);
    }

    const now = Date.now();
    const delta = now - this.lastPushAt;
    if (delta < this.config.minRefreshIntervalMs) {
      await abortableSleep(this.config.minRefreshIntervalMs - delta, options.signal);
    }

    const imageBase64 = this.assetStore.readImageAsBase64(framePath);
    const fingerprint = crypto.createHash('sha1').update(imageBase64).digest('hex');
    if (!options.force && fingerprint === this.lastFrameFingerprint) {
      this.logger.debug({ framePath }, 'Skipping duplicate frame push');
      return;
    }

    await this.client.pushImage({
      imageBase64,
      refreshNow: true,
      border: this.config.border,
      ditherType: this.config.ditherType,
      ditherKernel: this.config.ditherKernel,
      taskKey: this.config.taskKey,
      signal: options.signal
    });

    this.lastPushAt = Date.now();
    this.lastFrameFingerprint = fingerprint;
    this.logger.info({ frame: path.relative(process.cwd(), framePath) }, 'Quote/0 image updated');
  }

  async pushStateHold(state) {
    const holdFrame = this.assetStore.getHoldFrame(state);
    await this.pushFrame(holdFrame, { force: true });
  }

  async restoreAfterDelay() {
    if (!this.restoreSnapshot?.imageBase64) {
      this.logger.warn('Restore mode is enabled, but there is no snapshot to restore');
      return;
    }

    await sleep(this.config.restoreDelayMs);
    await this.client.pushImage({
      imageBase64: this.restoreSnapshot.imageBase64,
      refreshNow: true,
      border: this.restoreSnapshot.border ?? this.config.border,
      ditherType: this.restoreSnapshot.ditherType ?? this.config.ditherType,
      ditherKernel: this.restoreSnapshot.ditherKernel ?? this.config.ditherKernel,
      taskKey: this.restoreSnapshot.taskKey ?? this.config.taskKey
    });

    this.logger.info({ source: this.restoreSnapshot.source }, 'Restored previous Quote/0 content');
  }

  isCurrentTarget(targetState, targetVersion) {
    return targetState === this.pendingState && targetVersion === this.stateVersion;
  }
}
