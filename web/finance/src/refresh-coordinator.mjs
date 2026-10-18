import {createFinanceStore, FinanceConnectionError} from './connection-store.mjs';
import {buildFinanceRefreshRequest} from './refresh-request.mjs';
import {requestFinanceRefresh} from './refresh-transport.mjs';

const fail = (code, status = 503) => new FinanceConnectionError(code, status);

// Internal API only: callers receive an access token, never the rotating refresh
// token. No public route or default provider transport is installed by this file.
export async function ensureFinanceAccessToken(env, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw fail('FINANCE_REFRESH_COORDINATOR_CONFIGURATION');
  }
  const {fetchImpl, now = () => Date.now(), minValiditySeconds = 120, timeoutMs = 10000} = options;
  if (typeof now !== 'function' || !Number.isInteger(minValiditySeconds)
    || minValiditySeconds < 0 || minValiditySeconds > 14400
    || !Number.isInteger(timeoutMs) || timeoutMs < 5 || timeoutMs > 10000) {
    throw fail('FINANCE_REFRESH_COORDINATOR_CONFIGURATION');
  }
  const epoch = () => {
    let milliseconds;
    try { milliseconds = now(); } catch { throw fail('FINANCE_CLOCK_CONFIGURATION'); }
    if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0
      || Math.floor(milliseconds / 1000) > 9999999999) throw fail('FINANCE_CLOCK_CONFIGURATION');
    return Math.floor(milliseconds / 1000);
  };
  epoch();
  const store = await createFinanceStore(env, {now});
  await store.setup();
  const current = await store.readTokens();
  if (!current) throw fail('FINANCE_AUTHORIZATION_REQUIRED', 409);
  if (current.expires_at > epoch() + minValiditySeconds) {
    return {access_token: current.access_token, expires_at: current.expires_at, revision: current.revision};
  }

  // Validate local configuration before acquiring the single-use lease. A
  // missing key or transport must not discard an otherwise intact connection.
  if (typeof fetchImpl !== 'function') throw fail('FINANCE_REFRESH_TRANSPORT_UNAVAILABLE');
  const partnerKey = env.SHOPEE_FINANCE_PARTNER_KEY;
  await buildFinanceRefreshRequest({partnerKey, refreshToken: current.refresh_token, timestamp: epoch()});
  const lease = await store.claimRefresh(current.revision);
  try {
    const replacement = await requestFinanceRefresh({
      partnerKey, refreshToken: current.refresh_token, timestamp: epoch(),
    }, {fetchImpl, now, timeoutMs});
    const saved = await store.completeRefresh(lease, replacement);
    return {access_token: replacement.access_token, expires_at: replacement.expires_at, revision: saved.revision};
  } catch (failure) {
    // The provider may have consumed the refresh token, including on timeout.
    // Quarantine this lease; never retry it or overwrite another owner's result.
    try { await store.failRefresh(lease); } catch { /* CAS/expired lease or unavailable storage. */ }
    if (failure instanceof FinanceConnectionError) throw failure;
    throw fail('FINANCE_REFRESH_FAILED', 502);
  }
}
