import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClaudeHooksSnippet } from '../src/commands/install-hooks.js';

test('buildClaudeHooksSnippet includes the expected Claude lifecycle hooks', () => {
  const snippet = buildClaudeHooksSnippet();

  assert.match(snippet, /SessionStart/);
  assert.match(snippet, /UserPromptSubmit/);
  assert.match(snippet, /PreToolUse/);
  assert.match(snippet, /PermissionRequest/);
  assert.match(snippet, /Stop/);
  assert.match(snippet, /report --agent claude-code --event start/);
  assert.match(snippet, /report --agent claude-code --event waiting_input/);
  assert.match(snippet, /date \+%s%N/);
});
