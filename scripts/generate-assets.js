import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const WIDTH = 296;
const HEIGHT = 152;
const ROOT = path.resolve('assets/themes/mono-bot');

const FONT = {
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  B: ['11110','10001','11110','10001','10001','10001','11110'],
  C: ['01111','10000','10000','10000','10000','10000','01111'],
  D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','11110','10000','10000','10000','11111'],
  F: ['11111','10000','11110','10000','10000','10000','10000'],
  G: ['01111','10000','10000','10011','10001','10001','01111'],
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'],
  P: ['11110','10001','10001','11110','10000','10000','10000'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'],
  W: ['10001','10001','10001','10101','10101','10101','01010'],
  '?': ['01110','10001','00010','00100','00100','00000','00100'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000']
};

const STATES = {
  starting: { label: 'START', accent: 'spinner' },
  running: { label: 'RUN', accent: 'progress' },
  waiting_input: { label: 'WAIT?', accent: 'pulse' },
  completed: { label: 'DONE', accent: 'check' },
  failed: { label: 'FAIL', accent: 'cross' },
  cancelled: { label: 'STOP', accent: 'cross' }
};

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function setPixel(png, x, y, value = 0) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) {
    return;
  }
  const idx = (WIDTH * y + x) << 2;
  png.data[idx] = value;
  png.data[idx + 1] = value;
  png.data[idx + 2] = value;
  png.data[idx + 3] = 255;
}

function drawRect(png, x, y, width, height, fill = 0) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      setPixel(png, px, py, fill);
    }
  }
}

function drawFrame(png) {
  drawRect(png, 0, 0, WIDTH, 4, 0);
  drawRect(png, 0, HEIGHT - 4, WIDTH, 4, 0);
  drawRect(png, 0, 0, 4, HEIGHT, 0);
  drawRect(png, WIDTH - 4, 0, 4, HEIGHT, 0);
}

function drawBitmapText(png, text, x, y, scale = 4) {
  let cursorX = x;
  for (const char of text.toUpperCase()) {
    const glyph = FONT[char] || FONT[' '];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] === '1') {
          drawRect(png, cursorX + col * scale, y + row * scale, scale, scale, 0);
        }
      }
    }
    cursorX += (glyph[0].length + 1) * scale;
  }
}

function blankPng() {
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  png.data.fill(255);
  return png;
}

function drawAccent(png, accent, frameIndex) {
  const centerX = 62;
  const centerY = 64;
  switch (accent) {
    case 'spinner': {
      const radius = 28;
      const positions = [
        [0, -radius],
        [radius, 0],
        [0, radius],
        [-radius, 0]
      ];
      positions.forEach(([dx, dy], index) => {
        const size = index === frameIndex ? 14 : 8;
        drawRect(png, centerX + dx - size / 2, centerY + dy - size / 2, size, size, 0);
      });
      break;
    }
    case 'progress': {
      drawRect(png, 30, 50, 68, 10, 0);
      drawRect(png, 30, 72, 68, 10, 0);
      drawRect(png, 30, 94, 68, 10, 0);
      drawRect(png, 30, 50, 18 + frameIndex * 16, 10, 255);
      drawRect(png, 30, 72, 10 + frameIndex * 14, 10, 255);
      drawRect(png, 30, 94, 6 + frameIndex * 20, 10, 255);
      break;
    }
    case 'pulse': {
      const sizes = [18, 28, 22];
      const size = sizes[frameIndex % sizes.length];
      drawRect(png, centerX - size / 2, centerY - size / 2, size, size, 0);
      drawRect(png, centerX - 6, centerY - 6, 12, 12, 255);
      break;
    }
    case 'check': {
      drawRect(png, 34, 72, 12 + frameIndex * 6, 12, 0);
      drawRect(png, 46, 84, 12 + frameIndex * 8, 12, 0);
      drawRect(png, 64, 66, 12 + frameIndex * 10, 12, 0);
      break;
    }
    case 'cross': {
      const offset = frameIndex * 4;
      drawRect(png, 34 + offset, 56, 48, 12, 0);
      drawRect(png, 34 + offset, 88, 48, 12, 0);
      drawRect(png, 52, 44 + offset, 12, 64 - offset * 2, 0);
      break;
    }
    default:
      break;
  }
}

function writePng(filePath, png) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function drawState(label, accent, frameIndex, kind) {
  const png = blankPng();
  drawFrame(png);
  drawBitmapText(png, label, 118, 28, 5);
  drawBitmapText(png, kind === 'hold' ? 'HOLD' : `F${frameIndex + 1}`, 118, 92, 4);
  drawAccent(png, accent, frameIndex);
  return png;
}

mkdirp(ROOT);
mkdirp(path.join(ROOT, 'defaults'));
writePng(path.join(ROOT, 'defaults', 'idle.png'), drawState('IDLE', 'pulse', 1, 'hold'));

for (const [state, descriptor] of Object.entries(STATES)) {
  const stateDir = path.join(ROOT, 'states', state);
  mkdirp(path.join(stateDir, 'enter'));
  for (let frameIndex = 0; frameIndex < 3; frameIndex += 1) {
    writePng(
      path.join(stateDir, 'enter', `enter-${String(frameIndex + 1).padStart(2, '0')}.png`),
      drawState(descriptor.label, descriptor.accent, frameIndex, 'enter')
    );
  }
  writePng(path.join(stateDir, 'hold.png'), drawState(descriptor.label, descriptor.accent, 2, 'hold'));
}
