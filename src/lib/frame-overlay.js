import { PNG } from 'pngjs';
import { createWhitePng, drawBitmapText, drawRect, measureBitmapText } from './bitmap-font.js';
import { AGENT_TYPES } from './constants.js';

const SCALE = 2;
const DASHBOARD_TILE_SCALE = 1;
const DASHBOARD_COLUMN_WIDTH = 80;
const DASHBOARD_COLUMN_X = 8;
const DASHBOARD_TOP_Y = 8;
const DASHBOARD_ROW_HEIGHT = 15;
const DASHBOARD_ROW_GAP = 3;
const DASHBOARD_HEADER_HEIGHT = 14;
const DASHBOARD_MAX_SESSIONS_PER_AGENT = 4;

const STATE_LABELS = Object.freeze({
  starting: 'START',
  running: 'RUNNING',
  waiting_input: 'WAIT',
  completed: 'DONE',
  failed: 'FAILED',
  cancelled: 'STOP'
});

export function getStateDisplayLabel(state, fallback) {
  if (fallback) {
    return String(fallback).toUpperCase();
  }

  return STATE_LABELS[state] || String(state || '').replaceAll('_', ' ').toUpperCase();
}

export function composeFrameWithOverlay(imageBuffer, { state, stateLabel, sessionId, sessionName, agentType } = {}) {
  const tag = buildSingleSessionTag({ state, stateLabel, sessionId, sessionName, agentType });
  if (!tag) {
    return imageBuffer;
  }

  const png = PNG.sync.read(imageBuffer);
  const width = DASHBOARD_COLUMN_WIDTH;
  const x = png.width - DASHBOARD_COLUMN_X - width;
  const y = DASHBOARD_TOP_Y;

  drawLabeledBox(png, {
    x,
    y,
    width,
    height: DASHBOARD_HEADER_HEIGHT,
    text: tag.agent
  });
  drawLabeledBox(png, {
    x,
    y: y + DASHBOARD_HEADER_HEIGHT + DASHBOARD_ROW_GAP,
    width,
    height: DASHBOARD_ROW_HEIGHT,
    text: tag.detail,
    urgent: state === 'waiting_input'
  });

  return PNG.sync.write(png);
}

export function composeDashboardFrame({ imageBuffer = null, sessions = [], width = 296, height = 152 } = {}) {
  const png = imageBuffer ? PNG.sync.read(imageBuffer) : createWhitePng(width, height);
  const grouped = groupDashboardSessions(sessions);
  const leftX = DASHBOARD_COLUMN_X;
  const rightX = png.width - DASHBOARD_COLUMN_X - DASHBOARD_COLUMN_WIDTH;

  drawDashboardColumn(png, {
    x: leftX,
    y: DASHBOARD_TOP_Y,
    title: 'CODEX',
    sessions: grouped.codex
  });
  drawDashboardColumn(png, {
    x: rightX,
    y: DASHBOARD_TOP_Y,
    title: 'CLAUDE',
    sessions: grouped.claude
  });

  return PNG.sync.write(png);
}

function drawDashboardColumn(png, { x, y, title, sessions }) {
  const width = DASHBOARD_COLUMN_WIDTH;
  const visibleSessions = sessions.slice(0, DASHBOARD_MAX_SESSIONS_PER_AGENT);
  const hiddenCount = Math.max(0, sessions.length - visibleSessions.length);

  drawLabeledBox(png, {
    x,
    y,
    width,
    height: DASHBOARD_HEADER_HEIGHT,
    text: `${title} ${sessions.length}`
  });

  let cursorY = y + DASHBOARD_HEADER_HEIGHT + DASHBOARD_ROW_GAP;
  for (const session of visibleSessions) {
    const text = `${normalizeDashboardText(session.sessionName || session.sessionId, 4)}:${compactStateLabel(session.state, session.stateLabel)}`;
    drawLabeledBox(png, {
      x,
      y: cursorY,
      width,
      height: DASHBOARD_ROW_HEIGHT,
      text,
      urgent: session.state === 'waiting_input'
    });
    cursorY += DASHBOARD_ROW_HEIGHT + DASHBOARD_ROW_GAP;
  }

  if (hiddenCount > 0) {
    drawLabeledBox(png, {
      x,
      y: cursorY,
      width,
      height: DASHBOARD_ROW_HEIGHT,
      text: `+${hiddenCount} MORE`
    });
  }
}

function drawLabeledBox(png, { x, y, width, height, text, urgent = false }) {
  drawRect(png, x, y, width, height, 255);
  drawRect(png, x, y, width, 1, 0);
  drawRect(png, x, y + height - 1, width, 1, 0);
  drawRect(png, x, y, 1, height, 0);
  drawRect(png, x + width - 1, y, 1, height, 0);

  if (urgent) {
    drawRect(png, x + 2, y + 2, 3, height - 4, 0);
  }

  const textWidth = measureBitmapText(text, DASHBOARD_TILE_SCALE);
  const leftInset = urgent ? 7 : 3;
  const textX = Math.max(x + leftInset, x + Math.floor((width - textWidth) / 2));
  drawBitmapText(png, text, textX, y + 4, DASHBOARD_TILE_SCALE);
}

function groupDashboardSessions(sessions) {
  const grouped = {
    codex: [],
    claude: []
  };

  for (const session of sessions) {
    if (session.agentType === AGENT_TYPES.CLAUDE_CODE) {
      grouped.claude.push(session);
      continue;
    }

    grouped.codex.push(session);
  }

  return grouped;
}

function normalizeDashboardText(value, maxLength) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase()
    .slice(0, maxLength);
}

function compactStateLabel(state, fallback) {
  const label = getStateDisplayLabel(state, fallback);
  switch (label) {
    case 'RUNNING':
      return 'RUN';
    case 'WAIT':
    case 'WAITING INPUT':
      return 'WAIT';
    case 'DONE':
    case 'COMPLETED':
      return 'DONE';
    case 'FAILED':
      return 'FAIL';
    case 'START':
    case 'STARTING':
      return 'STRT';
    case 'STOP':
    case 'CANCELLED':
      return 'STOP';
    default:
      return normalizeDashboardText(label, 4);
  }
}

function buildSingleSessionTag({ state, stateLabel, sessionId, sessionName, agentType }) {
  if (!sessionId && !sessionName && !agentType && !state && !stateLabel) {
    return null;
  }
  const agent = agentType === AGENT_TYPES.CLAUDE_CODE ? 'CLAUDE' : 'CODEX';
  const name = normalizeDashboardText(sessionName || sessionId, 4);
  const compactState = compactStateLabel(state, stateLabel);
  return {
    agent,
    detail: name ? `${name}:${compactState}` : compactState
  };
}
