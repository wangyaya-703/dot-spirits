const STATE_DISPLAY_LABELS = Object.freeze({
  starting: 'START',
  running: 'RUNNING',
  waiting_input: 'WAIT',
  completed: 'DONE',
  failed: 'FAILED',
  cancelled: 'STOP'
});

export function normalizeDisplayText(value, { maxLength } = {}) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase();

  if (typeof maxLength === 'number' && maxLength >= 0) {
    return normalized.slice(0, maxLength);
  }

  return normalized;
}

export function getStateDisplayLabel(state, fallback, { compact = false } = {}) {
  const label = fallback
    ? normalizeDisplayText(fallback)
    : STATE_DISPLAY_LABELS[String(state || '').toLowerCase()] || normalizeDisplayText(String(state || '').replaceAll('_', ' '));

  if (!compact) {
    return label;
  }

  switch (label) {
    case 'RUNNING':
      return 'RUN';
    case 'WAIT':
    case 'WAITING-INPUT':
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
      return normalizeDisplayText(label, { maxLength: 4 });
  }
}
