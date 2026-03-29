import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getProjectRoot } from '../lib/config.js';

const ZSH_BEGIN = '# BEGIN DOT-CODEX WRAPPER';
const ZSH_END = '# END DOT-CODEX WRAPPER';

export async function installWrapperCommand(cliOptions) {
  const shell = cliOptions.shell || 'zsh';
  if (shell !== 'zsh') {
    throw new Error(`Unsupported shell for now: ${shell}`);
  }

  const realCodexPath = cliOptions.realCodexPath || resolveRealCodexPath();
  const wrapperBinDir = path.join(os.homedir(), '.dot-codex', 'bin');
  const wrapperPath = path.join(wrapperBinDir, 'codex');
  fs.mkdirSync(wrapperBinDir, { recursive: true });

  fs.writeFileSync(wrapperPath, buildWrapperScript(realCodexPath), { mode: 0o755 });
  fs.chmodSync(wrapperPath, 0o755);

  const zshrcPath = path.join(os.homedir(), '.zshrc');
  const current = fs.existsSync(zshrcPath) ? fs.readFileSync(zshrcPath, 'utf8') : '';
  const block = buildZshBlock(realCodexPath);
  const next = upsertMarkedBlock(current, block);
  fs.writeFileSync(zshrcPath, next);

  process.stdout.write([
    `Installed wrapper script: ${wrapperPath}`,
    `Updated shell config: ${zshrcPath}`,
    'Run `source ~/.zshrc` or open a new terminal for `codex` to start using dot-codex automatically.'
  ].join('\n') + '\n');
}

function resolveRealCodexPath() {
  const output = execFileSync('which', ['-a', 'codex'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const nonWrapper = output.find((entry) => !entry.startsWith(path.join(os.homedir(), '.dot-codex', 'bin')));
  if (!nonWrapper) {
    throw new Error('Unable to locate the real codex binary');
  }

  return nonWrapper;
}

function buildWrapperScript(realCodexPath) {
  const root = getProjectRoot();
  return `#!/bin/zsh
export DOT_CODEX_ROOT="${root}"
export DOT_CODEX_REAL_CODEX="${realCodexPath}"
exec node "${root}/src/cli.js" run -- "$DOT_CODEX_REAL_CODEX" "$@"
`;
}

function buildZshBlock(realCodexPath) {
  return `${ZSH_BEGIN}
export DOT_CODEX_ROOT="${getProjectRoot()}"
export DOT_CODEX_REAL_CODEX="${realCodexPath}"
export PATH="$HOME/.dot-codex/bin:$PATH"
${ZSH_END}`;
}

function upsertMarkedBlock(current, block) {
  const pattern = new RegExp(`${escapeRegExp(ZSH_BEGIN)}[\\s\\S]*?${escapeRegExp(ZSH_END)}`, 'm');
  if (pattern.test(current)) {
    return current.replace(pattern, block);
  }

  const suffix = current.endsWith('\n') || current.length === 0 ? '' : '\n';
  return `${current}${suffix}${block}\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
