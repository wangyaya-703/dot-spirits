import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { DEFAULT_LOG_LEVEL } from './constants.js';

export function createLogger({
  level = process.env.DOT_CODEX_LOG_LEVEL || DEFAULT_LOG_LEVEL,
  logFilePath,
  stdout = true
} = {}) {
  const streams = [];
  if (stdout) {
    streams.push({ stream: process.stdout });
  }
  if (logFilePath) {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    streams.push({
      stream: pino.destination({
        dest: logFilePath,
        mkdir: true,
        sync: false
      })
    });
  }

  return pino({
    level,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime
  }, pino.multistream(streams.length > 0 ? streams : [{ stream: process.stderr }]));
}
