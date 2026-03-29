import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCodexThreadId } from '../src/lib/codex-thread-index.js';

test('extractCodexThreadId parses the Codex session id banner', () => {
  const threadId = extractCodexThreadId('session id: 019d3a9c-3177-75f3-9798-dbf53ca8207a');
  assert.equal(threadId, '019d3a9c-3177-75f3-9798-dbf53ca8207a');
});
