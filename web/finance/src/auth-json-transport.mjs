import {FinanceConnectionError} from './connection-store.mjs';

const MAX_BODY_BYTES = 64 * 1024;
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i;
// Only exact provider error tokens may influence a public HTTP 403 diagnostic.
// No message, request ID, token or arbitrary provider string is retained.
const FORBIDDEN_JSON_DIAGNOSTICS = new Map([
  ['error_sign', 'JSON_SIGNATURE_REJECTED'],
  ['error_param', 'JSON_PARAMETER_REJECTED'],
  ['error_auth', 'JSON_AUTHORIZATION_REJECTED'],
  ['error_api_permission', 'JSON_PERMISSION_REJECTED'],
  ['error_partner_id', 'JSON_PARTNER_REJECTED'],
  ['error_ip', 'JSON_IP_REJECTED'],
]);

// Private, injected transport only. Importing this module never enables provider
// traffic; a production adapter must explicitly supply its own fetch function.
export async function requestFinanceAuthJson({input, options = {}, prefix, buildRequest, normalizeResponse}) {
  const error = (suffix, status = 502) => new FinanceConnectionError(prefix + '_' + suffix, status);
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw error('TRANSPORT_CONFIGURATION', 503);
  }
  let fetchImpl;
  let now;
  let timeoutMs;
  try {
    ({fetchImpl, now = () => Date.now(), timeoutMs = 10000} = options);
  } catch { throw error('TRANSPORT_CONFIGURATION', 503); }
  if (typeof fetchImpl !== 'function') throw error('TRANSPORT_UNAVAILABLE', 503);
  if (typeof now !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 5 || timeoutMs > 10000) {
    throw error('TRANSPORT_CONFIGURATION', 503);
  }
  const epoch = () => {
    let milliseconds;
    try { milliseconds = now(); }
    catch { throw new FinanceConnectionError('FINANCE_CLOCK_CONFIGURATION', 503); }
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new FinanceConnectionError('FINANCE_CLOCK_CONFIGURATION', 503);
    return Math.floor(milliseconds / 1000);
  };
  const requestedAt = epoch();
  let timestamp;
  try { timestamp = input && Object.getOwnPropertyDescriptor(input, 'timestamp')?.value; }
  catch { throw error('REQUEST_STALE', 400); }
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 ||
      timestamp > 9999999999 || Math.abs(timestamp - requestedAt) > 300) {
    throw error('REQUEST_STALE', 400);
  }

  const controller = new AbortController();
  let reader;
  const cancelReader = () => {
    try { reader?.cancel().catch(() => {}); }
    catch { /* The deadline must not depend on a stream cooperating. */ }
  };
  const checkDeadline = () => {
    if (controller.signal.aborted) throw error('TIMEOUT', 504);
  };
  controller.signal.addEventListener('abort', cancelReader, {once: true});
  let timer;
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      reject(error('TIMEOUT', 504));
      controller.abort();
    }, timeoutMs);
  });

  const readJson = async response => {
    const contentLength = response.headers.get('content-length');
    if (contentLength !== null && (!/^\d+$/.test(contentLength) ||
        !Number.isSafeInteger(Number(contentLength)) || Number(contentLength) > MAX_BODY_BYTES)) {
      try { response.body?.cancel().catch(() => {}); } catch {}
      throw error('UPSTREAM_BODY_TOO_LARGE');
    }
    if (!response.body) throw error('UPSTREAM_INVALID_JSON');
    reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
      while (true) {
        checkDeadline();
        let chunk;
        try { chunk = await reader.read(); }
        catch {
          checkDeadline();
          throw error('UPSTREAM_FAILED');
        }
        checkDeadline();
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array)) throw error('UPSTREAM_INVALID_JSON');
        length += chunk.value.byteLength;
        if (length > MAX_BODY_BYTES) {
          cancelReader();
          throw error('UPSTREAM_BODY_TOO_LARGE');
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
      reader = undefined;
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let payload;
    try { payload = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
    catch { throw error('UPSTREAM_INVALID_JSON'); }
    checkDeadline();
    return payload;
  };

  const run = async () => {
    const builtRequest = await buildRequest();
    checkDeadline();
    const request = new Request(builtRequest, {signal: controller.signal});
    let response;
    try {
      // The Request itself fixes the host, scope, body, headers and manual
      // redirect policy. There are no retries or alternate hosts.
      response = await fetchImpl(request);
    } catch {
      checkDeadline();
      throw error('UPSTREAM_FAILED');
    }
    if (controller.signal.aborted) {
      try { response?.body?.cancel().catch(() => {}); } catch {}
      checkDeadline();
    }
    if (!(response instanceof Response) || response.status !== 200 || response.redirected) {
      const failure = error('UPSTREAM_HTTP');
      if (response instanceof Response && Number.isInteger(response.status)
          && response.status >= 100 && response.status <= 599) {
        Object.defineProperty(failure, 'upstream_status', {value: response.status, enumerable: true});
      }
      if (response instanceof Response && response.status === 403 && !response.redirected) {
        const contentType = response.headers.get('content-type');
        let diagnostic;
        if (typeof contentType === 'string' && JSON_CONTENT_TYPE.test(contentType)) {
          try {
            const payload = await readJson(response);
            const providerError = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
              ? Object.getOwnPropertyDescriptor(payload, 'error')?.value : undefined;
            diagnostic = FORBIDDEN_JSON_DIAGNOSTICS.get(providerError) || 'JSON_UNRECOGNIZED';
          } catch (readFailure) {
            if (readFailure instanceof FinanceConnectionError && readFailure.code === prefix + '_UPSTREAM_INVALID_JSON') {
              diagnostic = 'JSON_INVALID';
            } else if (readFailure instanceof FinanceConnectionError && readFailure.code === prefix + '_UPSTREAM_BODY_TOO_LARGE') {
              diagnostic = 'JSON_BODY_TOO_LARGE';
            } else {
              throw readFailure;
            }
          }
        } else {
          try { response.body?.cancel().catch(() => {}); } catch {}
          diagnostic = typeof contentType === 'string' && contentType.split(';', 1)[0].trim().toLowerCase() === 'text/html'
            ? 'HTML_CONTENT_TYPE' : 'OTHER_CONTENT_TYPE';
        }
        Object.defineProperty(failure, 'upstream_diagnostic', {value: diagnostic, enumerable: true});
      } else {
        try { response?.body?.cancel().catch(() => {}); } catch {}
      }
      // A non-200 payload is diagnostic only, even if it contains valid tokens.
      throw failure;
    }
    const contentType = response.headers.get('content-type');
    if (typeof contentType !== 'string' || !JSON_CONTENT_TYPE.test(contentType)) {
      try { response.body?.cancel().catch(() => {}); } catch {}
      throw error('UPSTREAM_CONTENT_TYPE');
    }
    const payload = await readJson(response);
    return normalizeResponse(payload, {
      requestedAt,
      receivedAt: epoch(),
    });
  };

  try {
    return await Promise.race([run(), deadline]);
  } catch (failure) {
    controller.abort();
    if (failure instanceof FinanceConnectionError) throw failure;
    throw error('UPSTREAM_FAILED');
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', cancelReader);
  }
}
