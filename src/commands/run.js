import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { spawn as spawnProcess } from 'node:child_process';
import { spawn as spawnPty } from 'node-pty';
import { bootstrapRuntime } from '../lib/command-helpers.js';
import { getProjectRoot } from '../lib/config.js';
import { CodexStateDetector } from '../lib/state-detector.js';
import { RUN_STATES } from '../lib/constants.js';
import { SessionRegistry, ensureRotatorRunning } from '../lib/session-registry.js';

export async function runCommand(childArgs, cliOptions) {
  const { config, logger } = await bootstrapRuntime({
    cliOptions,
    needsDevice: true,
    needsTaskKey: true
  });

  const [command = 'codex', ...args] = childArgs.length > 0 ? childArgs : ['codex'];
  const detector = new CodexStateDetector(config.extraWaitingInputPatterns);
  const sessionId = cliOptions.sessionId || createSessionId();
  const registry = new SessionRegistry({ runtimeRoot: config.runtimeRoot, logger });
  const rotator = ensureRotatorRunning({ config, logger });

  logger.debug({ command, args, sessionId, rotatorPid: rotator.pid }, 'Starting wrapped Codex session');
  registry.upsertSession({
    sessionId,
    state: RUN_STATES.STARTING,
    command,
    args,
    cwd: process.cwd(),
    pid: process.pid
  });

  const wrappedProcess = spawnWrappedProcess({ command, args, logger });
  const heartbeat = setInterval(() => {
    registry.heartbeat(sessionId);
  }, 5000);

  let signalSent = null;
  const cleanupInput = wireInput(wrappedProcess);
  const cleanupResize = wireResize(wrappedProcess);

  wrappedProcess.onOutput((data, stream) => {
    if (!wrappedProcess.outputAlreadyVisible) {
      if (stream === 'stderr') {
        process.stderr.write(data);
      } else {
        process.stdout.write(data);
      }
    }

    const transition = detector.ingest(data);
    if (transition) {
      logger.debug(transition, 'Codex state transition detected');
      registry.upsertSession({
        sessionId,
        state: transition.nextState,
        command,
        args,
        cwd: process.cwd(),
        pid: process.pid
      });
    }
  });

  const exitCode = await new Promise((resolve, reject) => {
    const handleSignal = (signal) => {
      signalSent = signal;
      detector.markCancelled();
      wrappedProcess.kill(signal);
    };

    process.once('SIGINT', handleSignal);
    process.once('SIGTERM', handleSignal);

    wrappedProcess.onExit(async ({ exitCode: code, signal }) => {
      process.removeListener('SIGINT', handleSignal);
      process.removeListener('SIGTERM', handleSignal);
      clearInterval(heartbeat);
      cleanupInput();
      cleanupResize();

      const transition = detector.markExit(code, signalSent || signal);
      if (transition) {
        logger.debug(transition, 'Applying final render state');
      }

      try {
        registry.upsertSession({
          sessionId,
          state: transition?.nextState || (code === 0 ? RUN_STATES.COMPLETED : RUN_STATES.FAILED),
          command,
          args,
          cwd: process.cwd(),
          pid: process.pid
        });
        resolve(code);
      } catch (error) {
        reject(error);
      }
    });
  });

  process.exitCode = exitCode;
}

function createSessionId() {
  return crypto.randomBytes(2).toString('hex').toUpperCase();
}

function wireInput(wrappedProcess) {
  if (!wrappedProcess.requiresManualInput) {
    return () => {};
  }

  process.stdin.resume();
  if (process.stdin.isTTY) {
    process.stdin.setRawMode?.(true);
  }

  const onData = (chunk) => {
    wrappedProcess.write(chunk.toString('utf8'));
  };

  process.stdin.on('data', onData);
  return () => {
    process.stdin.off('data', onData);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode?.(false);
    }
    process.stdin.pause();
  };
}

function wireResize(wrappedProcess) {
  const onResize = () => {
    wrappedProcess.resize(process.stdout.columns || 120, process.stdout.rows || 40);
  };

  process.stdout.on('resize', onResize);
  return () => {
    process.stdout.off('resize', onResize);
  };
}

function spawnWrappedProcess({ command, args, logger }) {
  const resolvedCommand = resolveExecutable(command);

  try {
    const pty = spawnPty(resolvedCommand, args, {
      name: 'xterm-color',
      cols: process.stdout.columns || 120,
      rows: process.stdout.rows || 40,
      cwd: process.cwd(),
      env: process.env
    });

    return {
      outputAlreadyVisible: false,
      requiresManualInput: true,
      onOutput(handler) {
        pty.onData((data) => handler(data, 'stdout'));
      },
      onExit(handler) {
        pty.onExit(handler);
      },
      write(data) {
        pty.write(data);
      },
      kill(signal) {
        pty.kill(signal);
      },
      resize(cols, rows) {
        pty.resize(cols, rows);
      }
    };
  } catch (error) {
    logger.debug({ err: error, command: resolvedCommand }, 'PTY spawn failed, falling back to Python pseudo terminal bridge');

    try {
      return spawnPythonPtyProcess(resolvedCommand, args);
    } catch (pythonError) {
      logger.debug({ err: pythonError, command: resolvedCommand }, 'Python pseudo terminal failed, falling back to script-based pseudo terminal');

      try {
        return spawnScriptProcess(resolvedCommand, args);
      } catch (scriptError) {
        logger.debug({ err: scriptError, command: resolvedCommand }, 'script pseudo terminal failed, falling back to plain child_process spawn');
        return spawnFallbackProcess(resolvedCommand, args);
      }
    }
  }
}

function spawnPythonPtyProcess(command, args) {
  const bridgePath = path.join(getProjectRoot(), 'scripts', 'pty-bridge.py');
  if (!fs.existsSync(bridgePath)) {
    throw new Error(`Missing Python PTY bridge: ${bridgePath}`);
  }

  const child = spawnProcess('python3', [bridgePath, command, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DOT_CODEX_PTY_COLS: String(process.stdout.columns || 120),
      DOT_CODEX_PTY_ROWS: String(process.stdout.rows || 40)
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  return {
    outputAlreadyVisible: false,
    requiresManualInput: true,
    onOutput(handler) {
      child.stdout.on('data', (chunk) => handler(chunk.toString('utf8'), 'stdout'));
      child.stderr.on('data', (chunk) => handler(chunk.toString('utf8'), 'stderr'));
    },
    onExit(handler) {
      child.on('exit', (exitCode, signal) => handler({ exitCode, signal }));
    },
    write(data) {
      if (!child.stdin.destroyed) {
        child.stdin.write(data);
      }
    },
    kill(signal) {
      child.kill(signal);
    },
    resize() {}
  };
}

function spawnScriptProcess(command, args) {
  const scriptPath = '/usr/bin/script';
  const logFile = path.join(
    os.tmpdir(),
    `dot-codex-script-${Date.now()}-${Math.random().toString(16).slice(2)}.log`
  );

  const child = spawnProcess(scriptPath, ['-q', logFile, command, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  });

  let onOutput = null;
  let offset = 0;
  const pump = () => {
    if (!onOutput || !fs.existsSync(logFile)) {
      return;
    }

    const stat = fs.statSync(logFile);
    if (stat.size <= offset) {
      return;
    }

    const fd = fs.openSync(logFile, 'r');
    const buffer = Buffer.alloc(stat.size - offset);
    fs.readSync(fd, buffer, 0, buffer.length, offset);
    fs.closeSync(fd);
    offset = stat.size;
    onOutput(buffer.toString('utf8'), 'stdout');
  };

  const interval = setInterval(pump, 200);

  return {
    outputAlreadyVisible: true,
    requiresManualInput: false,
    onOutput(handler) {
      onOutput = handler;
    },
    onExit(handler) {
      child.on('exit', (exitCode, signal) => {
        clearInterval(interval);
        pump();
        fs.rmSync(logFile, { force: true });
        handler({ exitCode, signal });
      });
    },
    write() {},
    kill(signal) {
      child.kill(signal);
    },
    resize() {}
  };
}

function spawnFallbackProcess(command, args) {
  const child = spawnProcess(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  return {
    outputAlreadyVisible: false,
    requiresManualInput: true,
    onOutput(handler) {
      child.stdout.on('data', (chunk) => handler(chunk.toString('utf8'), 'stdout'));
      child.stderr.on('data', (chunk) => handler(chunk.toString('utf8'), 'stderr'));
    },
    onExit(handler) {
      child.on('exit', (exitCode, signal) => handler({ exitCode, signal }));
    },
    write(data) {
      if (!child.stdin.destroyed) {
        child.stdin.write(data);
      }
    },
    kill(signal) {
      child.kill(signal);
    },
    resize() {}
  };
}

function resolveExecutable(command) {
  if (command.includes(path.sep)) {
    return command;
  }

  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, command);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return command;
}
