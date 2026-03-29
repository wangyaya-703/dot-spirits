import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import dotenv from 'dotenv';
import { z } from 'zod';
import {
  API_BASE_URL,
  DEFAULT_ASSET_THEME,
  DEFAULT_FRAME_INTERVAL_MS,
  DEFAULT_LOG_LEVEL,
  DEFAULT_MIN_REFRESH_INTERVAL_MS,
  DEFAULT_RESTORE_DELAY_MS,
  DEFAULT_TASK_TYPE
} from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOME_DIR = process.env.HOME || process.cwd();
const DEFAULT_CONFIG_PATH = path.join(HOME_DIR, '.dot-codex', 'config.json');

const configSchema = z.object({
  apiBaseUrl: z.string().url().default(API_BASE_URL),
  apiKey: z.string().min(1).optional(),
  deviceId: z.string().min(1).optional(),
  taskType: z.string().min(1).default(DEFAULT_TASK_TYPE),
  taskKey: z.string().min(1).optional(),
  border: z.coerce.number().int().min(0).max(1).default(0),
  ditherType: z.enum(['DIFFUSION', 'ORDERED', 'NONE']).default('NONE'),
  ditherKernel: z
    .enum([
      'THRESHOLD',
      'ATKINSON',
      'BURKES',
      'FLOYD_STEINBERG',
      'SIERRA2',
      'STUCKI',
      'JARVIS_JUDICE_NINKE',
      'DIFFUSION_ROW',
      'DIFFUSION_COLUMN',
      'DIFFUSION_2D'
    ])
    .optional(),
  minRefreshIntervalMs: z.coerce.number().int().min(0).default(DEFAULT_MIN_REFRESH_INTERVAL_MS),
  frameIntervalMs: z.coerce.number().int().min(0).default(DEFAULT_FRAME_INTERVAL_MS),
  restoreMode: z.enum(['hold', 'restore']).default('hold'),
  restoreDelayMs: z.coerce.number().int().min(0).default(DEFAULT_RESTORE_DELAY_MS),
  defaultImagePath: z.string().min(1).optional(),
  assetTheme: z.string().min(1).default(DEFAULT_ASSET_THEME),
  logLevel: z.string().min(1).default(DEFAULT_LOG_LEVEL),
  extraWaitingInputPatterns: z.array(z.string()).default([])
});

function readJsonConfig(configPath) {
  if (!configPath || !fs.existsSync(configPath)) {
    return {};
  }

  const contents = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(contents);
}

function ensureEnvLoaded(configPath) {
  const candidates = Array.from(new Set([
    path.join(PROJECT_ROOT, '.env'),
    path.join(process.cwd(), '.env'),
    configPath && path.join(path.dirname(configPath), '.env')
  ].filter(Boolean)));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, override: false, quiet: true });
    }
  }
}

function buildEnvConfig() {
  return {
    apiBaseUrl: process.env.DOT_CODEX_API_BASE_URL,
    apiKey: process.env.DOT_CODEX_API_KEY,
    deviceId: process.env.DOT_CODEX_DEVICE_ID,
    taskType: process.env.DOT_CODEX_TASK_TYPE,
    taskKey: process.env.DOT_CODEX_TASK_KEY,
    border: process.env.DOT_CODEX_BORDER,
    ditherType: process.env.DOT_CODEX_DITHER_TYPE,
    ditherKernel: process.env.DOT_CODEX_DITHER_KERNEL,
    minRefreshIntervalMs: process.env.DOT_CODEX_MIN_REFRESH_INTERVAL_MS,
    frameIntervalMs: process.env.DOT_CODEX_FRAME_INTERVAL_MS,
    restoreMode: process.env.DOT_CODEX_RESTORE_MODE,
    restoreDelayMs: process.env.DOT_CODEX_RESTORE_DELAY_MS,
    defaultImagePath: process.env.DOT_CODEX_DEFAULT_IMAGE_PATH,
    assetTheme: process.env.DOT_CODEX_ASSET_THEME,
    logLevel: process.env.DOT_CODEX_LOG_LEVEL,
    extraWaitingInputPatterns: process.env.DOT_CODEX_WAITING_INPUT_PATTERNS
      ? process.env.DOT_CODEX_WAITING_INPUT_PATTERNS.split(',').map((value) => value.trim()).filter(Boolean)
      : undefined
  };
}

export function getProjectRoot() {
  return PROJECT_ROOT;
}

export function getDefaultConfigPath() {
  return DEFAULT_CONFIG_PATH;
}

export function loadConfig({ configPath = DEFAULT_CONFIG_PATH, overrides = {} } = {}) {
  ensureEnvLoaded(configPath);

  const merged = {
    ...readJsonConfig(configPath),
    ...buildEnvConfig(),
    ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined))
  };

  const parsed = configSchema.parse(merged);
  return {
    ...parsed,
    configPath,
    assetRoot: path.join(PROJECT_ROOT, 'assets', 'themes', parsed.assetTheme),
    defaultImagePath: parsed.defaultImagePath ? path.resolve(parsed.defaultImagePath) : undefined
  };
}

export function assertConfigFields(config, fields) {
  const missing = fields.filter((field) => !config[field]);
  if (missing.length > 0) {
    throw new Error(`Missing required config field(s): ${missing.join(', ')}`);
  }
}
