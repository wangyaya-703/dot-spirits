import test from 'node:test';
import assert from 'node:assert/strict';
import { getStateDisplayLabel, normalizeDisplayText } from '../src/lib/display-format.js';
import { defaultSessionLabel } from '../src/lib/session-registry.js';

test('normalizeDisplayText normalizes names consistently across overlays and session tables', () => {
  assert.equal(
    normalizeDisplayText(' demo project / branch ', { maxLength: 12 }),
    'DEMO-PROJECT'
  );
});

test('normalizeDisplayText transliterates Chinese names into stable ASCII initials', () => {
  assert.equal(
    normalizeDisplayText('工作台', { maxLength: 4 }),
    'GZT'
  );
  assert.equal(
    normalizeDisplayText('字节跳动-app', { maxLength: 6 }),
    'ZJTD-A'
  );
});

test('compact and default state labels come from the same source mapping', () => {
  assert.equal(defaultSessionLabel('starting'), 'START');
  assert.equal(getStateDisplayLabel('starting', null, { compact: true }), 'STRT');
  assert.equal(defaultSessionLabel('running'), 'RUNNING');
  assert.equal(getStateDisplayLabel('running', null, { compact: true }), 'RUN');
  assert.equal(defaultSessionLabel('completed'), 'DONE');
  assert.equal(getStateDisplayLabel('completed', null, { compact: true }), 'DONE');
});
