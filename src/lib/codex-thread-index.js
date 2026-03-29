import fs from 'node:fs';
import path from 'node:path';

const CODEX_HOME = path.join(process.env.HOME || process.cwd(), '.codex');
const SESSION_INDEX_PATH = path.join(CODEX_HOME, 'session_index.jsonl');
const SESSION_ID_PATTERN = /session id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function extractCodexThreadId(outputChunk) {
  const match = String(outputChunk || '').match(SESSION_ID_PATTERN);
  return match?.[1] || null;
}

export function readCodexThreadName(threadId) {
  if (!threadId || !fs.existsSync(SESSION_INDEX_PATH)) {
    return null;
  }

  const lines = fs.readFileSync(SESSION_INDEX_PATH, 'utf8').trim().split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const entry = JSON.parse(lines[index]);
      if (entry.id === threadId && entry.thread_name) {
        return String(entry.thread_name).trim() || null;
      }
    } catch {
      continue;
    }
  }

  return null;
}
