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
  const buildCommand = (event) =>
    `SEQ="$(date +%s%N)"; "${nodePath}" "${cliPath}" report --agent claude-code --event ${event} --sequence "$SEQ"`;

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
    '- `dot-codex report` reads the hook JSON from stdin automatically.',
    '- The daemon auto-starts when the first hook event arrives and device config is present.',
    '- The `date +%s%N` sequence is used to prevent out-of-order hook events from regressing state.'
  ].join('\n');
}
