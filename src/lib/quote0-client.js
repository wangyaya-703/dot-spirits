import { URL } from 'node:url';

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text ? { raw: text } : {};
}

export class Quote0Client {
  constructor({ apiBaseUrl, apiKey, deviceId, logger }) {
    this.apiBaseUrl = apiBaseUrl;
    this.apiKey = apiKey;
    this.deviceId = deviceId;
    this.logger = logger;
  }

  buildUrl(pathname) {
    return new URL(pathname, this.apiBaseUrl).toString();
  }

  async fetchWithRetry(pathname, { method = 'GET', body, signal } = {}) {
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (signal?.aborted) {
        throw signal.reason || abortError();
      }

      const controller = new AbortController();
      const abortFromCaller = () => controller.abort(signal.reason || abortError());
      signal?.addEventListener?.('abort', abortFromCaller, { once: true });
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, DEFAULT_TIMEOUT_MS);

      try {
        const response = await fetch(this.buildUrl(pathname), {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal
        });

        clearTimeout(timeout);
        signal?.removeEventListener?.('abort', abortFromCaller);

        if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_ATTEMPTS) {
          this.logger.warn({ attempt, status: response.status, pathname }, 'Retryable Quote/0 response received');
          await sleep(backoffMs(attempt));
          continue;
        }

        return response;
      } catch (error) {
        clearTimeout(timeout);
        signal?.removeEventListener?.('abort', abortFromCaller);
        lastError = error;

        if (signal?.aborted) {
          break;
        }

        if (attempt >= MAX_ATTEMPTS) {
          break;
        }

        this.logger.warn({ attempt, err: error, pathname, timedOut }, 'Quote/0 request failed, retrying');
        await sleep(backoffMs(attempt));
      }
    }

    throw lastError;
  }

  async request(pathname, { method = 'GET', body, signal } = {}) {
    let response;

    try {
      response = await this.fetchWithRetry(pathname, { method, body, signal });
    } catch (error) {
      const wrapped = new Error(`Quote/0 request failed: ${error.message}`);
      wrapped.cause = error;
      throw wrapped;
    }

    const payload = await parseResponse(response);

    if (!response.ok) {
      const error = new Error(
        payload?.message || payload?.error || `Quote/0 request failed with status ${response.status}`
      );
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  async listTasks(taskType = 'loop') {
    return this.request(`/api/authV2/open/device/${this.deviceId}/${taskType}/list`);
  }

  async getStatus() {
    return this.request(`/api/authV2/open/device/${this.deviceId}/status`);
  }

  async pushImage({ imageBase64, refreshNow = true, link, border = 0, ditherType = 'NONE', ditherKernel, taskKey, signal }) {
    const body = {
      refreshNow,
      image: imageBase64,
      border,
      ditherType
    };

    if (link) {
      body.link = link;
    }

    if (ditherKernel) {
      body.ditherKernel = ditherKernel;
    }

    if (taskKey) {
      body.taskKey = taskKey;
    }

    this.logger.debug({ refreshNow, border, ditherType, taskKey }, 'Pushing image to Quote/0');
    return this.request(`/api/authV2/open/device/${this.deviceId}/image`, {
      method: 'POST',
      body,
      signal
    });
  }
}

function backoffMs(attempt) {
  return 300 * 2 ** (attempt - 1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function abortError() {
  const error = new Error('Quote/0 request aborted');
  error.name = 'AbortError';
  return error;
}
