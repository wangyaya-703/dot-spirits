import { PNG } from 'pngjs';
import { createWhitePng, drawBitmapText, drawRect, measureBitmapText } from './bitmap-font.js';
import { AGENT_TYPES } from './constants.js';

const FOOTER_HEIGHT = 24;
const PADDING_X = 10;
const PADDING_Y = 6;
const SCALE = 2;
const DASHBOARD_PADDING = 8;
const DASHBOARD_GAP = 6;
const DASHBOARD_TITLE_SCALE = 1;
const DASHBOARD_TILE_SCALE = 1;

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

export function composeFrameWithOverlay(imageBuffer, { state, stateLabel, sessionId, sessionName } = {}) {
  const sessionText = buildSessionBadge({ sessionId, sessionName });
  if (!sessionText && !stateLabel && !state) {
    return imageBuffer;
  }

  const png = PNG.sync.read(imageBuffer);
  const labelText = getStateDisplayLabel(state, stateLabel);

  const footerY = png.height - FOOTER_HEIGHT - 8;
  drawRect(png, 8, footerY, png.width - 16, FOOTER_HEIGHT, 255);
  drawRect(png, 8, footerY, png.width - 16, 1, 0);
  drawRect(png, 8, footerY + FOOTER_HEIGHT - 1, png.width - 16, 1, 0);
  drawRect(png, 8, footerY, 1, FOOTER_HEIGHT, 0);
  drawRect(png, png.width - 9, footerY, 1, FOOTER_HEIGHT, 0);

  drawBitmapText(png, labelText, 8 + PADDING_X, footerY + PADDING_Y, SCALE);

  if (sessionText) {
    const sessionWidth = measureBitmapText(sessionText, SCALE);
    const sessionX = png.width - 8 - PADDING_X - sessionWidth;
    drawBitmapText(png, sessionText, sessionX, footerY + PADDING_Y, SCALE);
  }

  return PNG.sync.write(png);
}

export function composeDashboardFrame({ sessions = [], width = 296, height = 152 } = {}) {
  const png = createWhitePng(width, height);
  const visibleSessions = sessions.slice(0, 4);
  const overflowCount = Math.max(0, sessions.length - visibleSessions.length);
  const title = sessions.length > 1 ? `AGENTS ${sessions.length}` : 'AGENT';

  drawRect(png, 0, 0, width, 1, 0);
  drawRect(png, 0, height - 1, width, 1, 0);
  drawRect(png, 0, 0, 1, height, 0);
  drawRect(png, width - 1, 0, 1, height, 0);
  drawBitmapText(png, title, DASHBOARD_PADDING, 6, DASHBOARD_TITLE_SCALE);

  const gridTop = 22;
  const gridHeight = height - gridTop - 10;
  const columns = visibleSessions.length <= 1 ? 1 : 2;
  const rows = visibleSessions.length <= 2 ? visibleSessions.length : 2;
  const tileWidth = columns === 1
    ? width - DASHBOARD_PADDING * 2
    : Math.floor((width - DASHBOARD_PADDING * 2 - DASHBOARD_GAP) / 2);
  const tileHeight = rows <= 1
    ? gridHeight
    : Math.floor((gridHeight - DASHBOARD_GAP) / 2);

  visibleSessions.forEach((session, index) => {
    const col = columns === 1 ? 0 : index % 2;
    const row = columns === 1 ? index : Math.floor(index / 2);
    const x = DASHBOARD_PADDING + col * (tileWidth + DASHBOARD_GAP);
    const y = gridTop + row * (tileHeight + DASHBOARD_GAP);
    drawSessionTile(png, session, { x, y, width: tileWidth, height: tileHeight });
  });

  if (overflowCount > 0) {
    const label = `+${overflowCount} MORE`;
    const labelWidth = measureBitmapText(label, DASHBOARD_TILE_SCALE);
    drawBitmapText(
      png,
      label,
      width - DASHBOARD_PADDING - labelWidth,
      6,
      DASHBOARD_TILE_SCALE
    );
  }

  return PNG.sync.write(png);
}

function drawSessionTile(png, session, { x, y, width, height }) {
  const urgent = session.state === 'waiting_input';
  drawRect(png, x, y, width, 1, 0);
  drawRect(png, x, y + height - 1, width, 1, 0);
  drawRect(png, x, y, 1, height, 0);
  drawRect(png, x + width - 1, y, 1, height, 0);
  if (urgent) {
    drawRect(png, x + 2, y + 2, width - 4, 1, 0);
    drawRect(png, x + 2, y + height - 3, width - 4, 1, 0);
    drawRect(png, x + 2, y + 2, 1, height - 4, 0);
    drawRect(png, x + width - 3, y + 2, 1, height - 4, 0);
  }

  const name = normalizeDashboardText(session.sessionName || session.sessionId, 10);
  const state = normalizeDashboardText(getStateDisplayLabel(session.state, session.stateLabel), 10);
  const agent = agentBadge(session.agentType);
  const id = normalizeDashboardText(session.sessionId, 6);

  drawBitmapText(png, name, x + 6, y + 6, DASHBOARD_TILE_SCALE);
  drawBitmapText(png, state, x + 6, y + 18, DASHBOARD_TILE_SCALE);
  drawBitmapText(png, `${agent}:${id}`, x + 6, y + 30, DASHBOARD_TILE_SCALE);
}

function buildSessionBadge({ sessionId, sessionName }) {
  const normalizedName = String(sessionName || '')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase();
  const normalizedId = String(sessionId || '').trim().toUpperCase();

  if (normalizedName) {
    return normalizedName.slice(0, 12);
  }

  return normalizedId ? `ID:${normalizedId}` : '';
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

function agentBadge(agentType) {
  if (agentType === AGENT_TYPES.CLAUDE_CODE) {
    return 'CLD';
  }

  return 'CDX';
}
