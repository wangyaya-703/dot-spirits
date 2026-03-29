import pino from 'pino';
import { DEFAULT_LOG_LEVEL } from './constants.js';

export function createLogger(level = process.env.DOT_CODEX_LOG_LEVEL || DEFAULT_LOG_LEVEL) {
  return pino({
    level,
    transport: process.stdout.isTTY
      ? {
          target: 'pino/file',
          options: { destination: 1 }
        }
      : undefined,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime
  });
}
