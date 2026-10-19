import {FinanceConnectionError} from './connection-store.mjs';

const MAX_BODY_BYTES = 64 * 1024;

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
      try { response?.body?.cancel().catch(() => {}); } catch {}
      const failure = error('UPSTREAM_HTTP');
      if (response instanceof Response && Number.isInteger(response.status)
          && response.status >= 100 && response.status <= 599) {
        Object.defineProperty(failure, 'upstream_status', {value: response.status, enumerable: true});
      }
      throw failure;
    }
    const contentType = response.headers.get('content-type');
    if (typeof contentType !== 'string' ||
        !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(contentType)) {
      try { response.body?.cancel().catch(() => {}); } catch {}
      throw error('UPSTREAM_CONTENT_TYPE');
    }
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
