import process from 'node:process';
import { getProjectRoot } from '../lib/config.js';
import { AGENT_TYPES } from '../lib/constants.js';

export async function installHooksCommand(cliOptions = {}) {
  const agentType = String(cliOptions.agent || AGENT_TYPES.CLAUDE_CODE).trim().toLowerCase();
  if (agentType !== AGENT_TYPES.CLAUDE_CODE) {
    throw new Error(`Unsupported hook template target: ${agentType}`);
  }

  process.stdout.write(`${buildClaudeHooksSnippet()}\n`);
}

export function buildClaudeHooksSnippet() {
  const nodePath = process.execPath;
  const cliPath = `${getProjectRoot()}/src/cli.js`;
  const buildCommand = (event) => [
    'HOOK_JSON="$(cat)"',
    `SESSION_ID="$(printf '%s' "$HOOK_JSON" | "${nodePath}" -e 'let raw=\"\";process.stdin.on(\"data\", (chunk) => raw += chunk).on(\"end\", () => { try { const parsed = JSON.parse(raw || \"{}\"); process.stdout.write(String(parsed.session_id || \"\")); } catch { process.stdout.write(\"\"); } });')"`,
    `SEQ="$("${nodePath}" -e 'const candidate = (Date.now() * 1000) + Number(process.hrtime.bigint() % 1000n); process.stdout.write(String(candidate));')"`,
    'if [ -n "$SESSION_ID" ]; then',
    `  printf '%s' "$HOOK_JSON" | "${nodePath}" "${cliPath}" report --agent claude-code --event ${event} --sequence "$SEQ" --session-id "$SESSION_ID"`,
    'else',
    `  printf '%s' "$HOOK_JSON" | "${nodePath}" "${cliPath}" report --agent claude-code --event ${event} --sequence "$SEQ"`,
    'fi'
  ].join('; ');

  const snippet = {
    hooks: {
      SessionStart: [
        {
          matcher: 'startup|resume|clear|compact',
          hooks: [
            {
              type: 'command',
              command: buildCommand('start')
            }
          ]
        }
      ],
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: 'command',
              command: buildCommand('running')
            }
          ]
        }
      ],
      PreToolUse: [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command: buildCommand('running')
            }
          ]
        }
      ],
      PostToolUse: [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command: buildCommand('running')
            }
          ]
        }
      ],
      PermissionRequest: [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command: buildCommand('waiting_input')
            }
          ]
        }
      ],
      Stop: [
        {
          hooks: [
            {
              type: 'command',
              command: buildCommand('stop')
            }
          ]
        }
      ]
    }
  };

  return [
    'Paste this into your Claude Code settings file, for example `.claude/settings.json`:',
    '',
    JSON.stringify(snippet, null, 2),
    '',
    'Notes:',
    '- `dot-codex report` reads the hook JSON from stdin automatically, and the generated command forwards `session_id` explicitly when present.',
    '- The daemon auto-starts when the first hook event arrives and device config is present.',
    '- The generated sequence uses Node clock + hrtime, so it stays monotonic on macOS without shell-specific nanosecond date support.'
  ].join('\n');
}
