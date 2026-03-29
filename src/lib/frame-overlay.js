import { PNG } from 'pngjs';
import { drawBitmapText, drawRect, measureBitmapText } from './bitmap-font.js';

const FOOTER_HEIGHT = 24;
const PADDING_X = 10;
const PADDING_Y = 6;
const SCALE = 2;

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

export function composeFrameWithOverlay(imageBuffer, { state, stateLabel, sessionId } = {}) {
  if (!sessionId && !stateLabel && !state) {
    return imageBuffer;
  }

  const png = PNG.sync.read(imageBuffer);
  const labelText = getStateDisplayLabel(state, stateLabel);
  const sessionText = sessionId ? `ID:${String(sessionId).toUpperCase()}` : '';

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
