// Private finance connection persistence. No provider requests or Ads fallback.
export const FINANCE_PROFILE = Object.freeze({
  partner_id: 2049333,
  shop_id: 1178167501,
  environment: 'LIVE',
  region: 'BRAZIL',
});

export class FinanceConnectionError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.name = 'FinanceConnectionError';
    this.code = code;
    this.status = status;
  }
}

const CONTEXT = 'braza-finance-payment-v1';
const STATE_TTL = 600;
const REFRESH_TTL = 60;
const MAX_TOKEN_TTL = 86400;
const IDENTITY = [FINANCE_PROFILE.partner_id, FINANCE_PROFILE.shop_id,
  FINANCE_PROFILE.environment, FINANCE_PROFILE.region, CONTEXT];
const WHERE = 'partner_id = ? AND shop_id = ? AND environment = ? AND region = ? AND profile_context = ?';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true});
const error = (code, status) => new FinanceConnectionError(code, status);
const encode = bytes => btoa(String.fromCharCode(...bytes));
const random = size => crypto.getRandomValues(new Uint8Array(size));
const opaque = () => encode(random(32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const isOpaque = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
  && /[AEIMQUYcgkosw048]$/.test(value);

function decode(value) {
  if (typeof value !== 'string' || value.length > 100000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw error('FINANCE_INVALID_ENCODING');
  }
  const bytes = Uint8Array.from(atob(value), ch => ch.charCodeAt(0));
  if (encode(bytes) !== value) throw error('FINANCE_INVALID_ENCODING');
  return bytes;
}

async function digest(value) {
  return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

function tokensFor(tokens, epoch) {
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)
    || !['access_token', 'refresh_token'].every(field => typeof tokens[field] === 'string'
      && tokens[field].length > 0 && tokens[field].length <= 8192
      && !/[\u0000-\u001f\u007f]/.test(tokens[field]))
    || !Number.isSafeInteger(tokens.expires_at) || tokens.expires_at <= epoch
    || tokens.expires_at > epoch + MAX_TOKEN_TTL) {
    throw error('FINANCE_INVALID_TOKENS', 502);
  }
  return {access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: tokens.expires_at};
}

function revisionFor(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) {
    throw error('FINANCE_INVALID_REVISION', 400);
  }
  return value;
}

function leaseFor(lease, allowZero = false) {
  if (!lease || typeof lease !== 'object' || !isOpaque(lease.owner)
    || revisionFor(lease.revision) < (allowZero ? 0 : 1)) throw error('FINANCE_INVALID_LEASE', 400);
  return lease;
}

export async function createFinanceStore(env, {now = () => Date.now()} = {}) {
  if (!env || !env.FINANCE_DB || typeof env.FINANCE_DB.prepare !== 'function'
    || typeof env.FINANCE_DB.batch !== 'function' || (env.ADMIN_DB && env.ADMIN_DB === env.FINANCE_DB)) {
    throw error('FINANCE_DATABASE_CONFIGURATION');
  }
  if (typeof now !== 'function') throw error('FINANCE_CLOCK_CONFIGURATION');
  let key;
  let keyFingerprint;
  try {
    const raw = decode(env.FINANCE_TOKEN_ENCRYPTION_KEY);
    if (raw.length !== 32) throw error('FINANCE_ENCRYPTION_CONFIGURATION');
    key = await crypto.subtle.importKey('raw', raw, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
    keyFingerprint = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)));
    raw.fill(0);
  } catch {
    throw error('FINANCE_ENCRYPTION_CONFIGURATION');
  }
  const db = env.FINANCE_DB;
  const epoch = () => {
    const milliseconds = now();
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw error('FINANCE_CLOCK_CONFIGURATION');
    return Math.floor(milliseconds / 1000);
  };
  const statement = (sql, values = []) => db.prepare(sql).bind(...values);
  const first = async (sql, values = []) => {
    try { return await statement(sql, values).first(); }
    catch { throw error('FINANCE_STORAGE_UNAVAILABLE'); }
  };
  const run = async (sql, values = []) => {
    try { return await statement(sql, values).run(); }
    catch { throw error('FINANCE_STORAGE_UNAVAILABLE'); }
  };
  const aad = (revision, expires) => encoder.encode(JSON.stringify(['AES-GCM-v1', ...IDENTITY, revision, expires]));
  const encrypt = async (tokens, revision) => {
    try {
      const iv = random(12);
      const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv,
        additionalData: aad(revision, tokens.expires_at)}, key, encoder.encode(JSON.stringify(tokens)));
      return {iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext))};
    } catch { throw error('FINANCE_ENCRYPTION_FAILED'); }
  };
  const invalidateExpiredLease = () => run(`UPDATE finance_connections SET status = 'REAUTH_REQUIRED',
    ciphertext = NULL, iv = NULL, key_fingerprint = NULL, expires_at = NULL,
    refresh_owner_hash = NULL, refresh_until = NULL, updated_at = ?
    WHERE ${WHERE} AND status IN ('REFRESHING', 'AUTHORIZING') AND refresh_until <= ?`, [epoch(), ...IDENTITY, epoch()]);
  const row = async () => {
    await invalidateExpiredLease();
    return first(`SELECT * FROM finance_connections WHERE ${WHERE}`, IDENTITY);
  };
  const invalidateCorrupt = observed => run(`UPDATE finance_connections SET status = 'REAUTH_REQUIRED',
    ciphertext = NULL, iv = NULL, key_fingerprint = NULL, expires_at = NULL,
    refresh_owner_hash = NULL, refresh_until = NULL, updated_at = ?
    WHERE ${WHERE} AND revision = ? AND status = 'CONNECTED' AND key_fingerprint = ?
    AND ciphertext IS ? AND iv IS ? AND expires_at IS ?`,
  [epoch(), ...IDENTITY, observed.revision, observed.key_fingerprint,
    observed.ciphertext, observed.iv, observed.expires_at]);

  const setup = async () => {
    try {
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS finance_oauth_states (
          state_hash TEXT PRIMARY KEY,
          browser_hash TEXT NOT NULL,
          partner_id INTEGER NOT NULL,
          shop_id INTEGER NOT NULL,
          environment TEXT NOT NULL,
          region TEXT NOT NULL,
          profile_context TEXT NOT NULL,
          issued_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS finance_connections (
          partner_id INTEGER NOT NULL,
          shop_id INTEGER NOT NULL,
          environment TEXT NOT NULL,
          region TEXT NOT NULL,
          profile_context TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK (revision >= 0),
          status TEXT NOT NULL CHECK (status IN ('CONNECTED', 'REFRESHING', 'AUTHORIZING', 'REAUTH_REQUIRED')),
          expires_at INTEGER,
          ciphertext TEXT,
          iv TEXT,
          key_fingerprint TEXT,
          refresh_owner_hash TEXT,
          refresh_until INTEGER,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (partner_id, shop_id, environment, region, profile_context)
        )`),
      ]);
    } catch { throw error('FINANCE_STORAGE_UNAVAILABLE'); }
  };
  const issueState = async () => {
    const state = opaque();
    const browser_secret = opaque();
    const issued = epoch();
    await run('DELETE FROM finance_oauth_states WHERE expires_at <= ?', [issued]);
    await run(`INSERT INTO finance_oauth_states
      (state_hash, browser_hash, partner_id, shop_id, environment, region, profile_context, issued_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [await digest(state), await digest(browser_secret), ...IDENTITY, issued, issued + STATE_TTL]);
    return {state, browser_secret, expires_at: issued + STATE_TTL};
  };
  const consumeState = async (state, browserSecret) => {
    if (!isOpaque(state) || !isOpaque(browserSecret)) throw error('FINANCE_INVALID_STATE', 400);
    const stateHash = await digest(state);
    const found = await first(`DELETE FROM finance_oauth_states WHERE state_hash = ? AND browser_hash = ?
      AND ${WHERE} AND issued_at <= ? AND expires_at > ? RETURNING issued_at, expires_at`,
    [stateHash, await digest(browserSecret), ...IDENTITY, epoch(), epoch()]);
    if (!found) throw error('FINANCE_INVALID_STATE', 400);
    return {...FINANCE_PROFILE, nonce_digest: stateHash, issued_at: found.issued_at, expires_at: found.expires_at};
  };
  const status = async () => {
    const connection = await row();
    if (connection && connection.status !== 'REAUTH_REQUIRED' && connection.key_fingerprint !== keyFingerprint) {
      // Configuration mistakes must not destroy a connection encrypted with a different key.
      throw error('FINANCE_ENCRYPTION_KEY_MISMATCH');
    }
    return {connected: !!connection && ['CONNECTED', 'REFRESHING'].includes(connection.status),
      status: connection?.status || 'DISCONNECTED', revision: connection?.revision ?? null,
      expires_at: connection?.expires_at ?? null, partner_id: FINANCE_PROFILE.partner_id, shop_id: FINANCE_PROFILE.shop_id};
  };
  const readTokens = async () => {
    const connection = await row();
    if (!connection || connection.status === 'REAUTH_REQUIRED') return null;
    if (connection.key_fingerprint !== keyFingerprint) throw error('FINANCE_ENCRYPTION_KEY_MISMATCH');
    if (connection.status === 'REFRESHING') throw error('FINANCE_REFRESH_IN_PROGRESS', 409);
    if (connection.status === 'AUTHORIZING') throw error('FINANCE_AUTHORIZATION_IN_PROGRESS', 409);
    try {
      const iv = decode(connection.iv);
      if (iv.length !== 12) throw error('FINANCE_INVALID_ENCODING');
      const plaintext = await crypto.subtle.decrypt({name: 'AES-GCM', iv,
        additionalData: aad(connection.revision, connection.expires_at)}, key, decode(connection.ciphertext));
      const tokens = JSON.parse(decoder.decode(plaintext));
      // Expired access tokens remain readable only so the caller can acquire a refresh lease.
      if (!tokens || typeof tokens.access_token !== 'string' || !tokens.access_token.length
        || tokens.access_token.length > 8192 || typeof tokens.refresh_token !== 'string'
        || !tokens.refresh_token.length || tokens.refresh_token.length > 8192
        || !Number.isSafeInteger(tokens.expires_at) || tokens.expires_at !== connection.expires_at) {
        throw error('FINANCE_INVALID_TOKENS');
      }
      return {revision: connection.revision, access_token: tokens.access_token,
        refresh_token: tokens.refresh_token, expires_at: tokens.expires_at};
    } catch {
      await invalidateCorrupt(connection);
      throw error('FINANCE_TOKEN_DECRYPT_FAILED');
    }
  };
  const saveTokens = async (value, {expectedRevision = 0} = {}) => {
    const expected = revisionFor(expectedRevision);
    const tokens = tokensFor(value, epoch());
    const revision = expected + 1;
    const sealed = await encrypt(tokens, revision);
    let saved;
    if (expected === 0) {
      saved = await first(`INSERT INTO finance_connections
        (partner_id, shop_id, environment, region, profile_context, revision, status,
         expires_at, ciphertext, iv, key_fingerprint, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, 'CONNECTED', ?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING RETURNING revision`,
      [...IDENTITY, tokens.expires_at, sealed.ciphertext, sealed.iv, keyFingerprint, epoch()]);
    } else {
      saved = await first(`UPDATE finance_connections SET revision = ?, status = 'CONNECTED',
        expires_at = ?, ciphertext = ?, iv = ?, key_fingerprint = ?,
        refresh_owner_hash = NULL, refresh_until = NULL, updated_at = ?
        WHERE ${WHERE} AND revision = ? AND status NOT IN ('REFRESHING', 'AUTHORIZING')
        AND (status = 'REAUTH_REQUIRED' OR key_fingerprint = ?) RETURNING revision`,
      [revision, tokens.expires_at, sealed.ciphertext, sealed.iv, keyFingerprint, epoch(), ...IDENTITY, expected, keyFingerprint]);
    }
    if (!saved) throw error('FINANCE_REVISION_CONFLICT', 409);
    return {revision: saved.revision};
  };
  const claimRefresh = async expectedRevision => {
    const revision = revisionFor(expectedRevision);
    if (revision < 1) throw error('FINANCE_INVALID_REVISION', 400);
    await invalidateExpiredLease();
    const owner = opaque();
    const claimed = await first(`UPDATE finance_connections SET status = 'REFRESHING',
      refresh_owner_hash = ?, refresh_until = ?, updated_at = ?
      WHERE ${WHERE} AND revision = ? AND status = 'CONNECTED' AND key_fingerprint = ? RETURNING revision`,
    [await digest(owner), epoch() + REFRESH_TTL, epoch(), ...IDENTITY, revision, keyFingerprint]);
    if (!claimed) throw error('FINANCE_REFRESH_CONFLICT', 409);
    return {owner, revision: claimed.revision};
  };
  const claimAuthorization = async (expectedRevision = 0) => {
    const revision = revisionFor(expectedRevision);
    await invalidateExpiredLease();
    const owner = opaque();
    const ownerHash = await digest(owner);
    const instant = epoch();
    let claimed;
    if (revision === 0) {
      claimed = await first(`INSERT INTO finance_connections
        (partner_id, shop_id, environment, region, profile_context, revision, status,
         key_fingerprint, refresh_owner_hash, refresh_until, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 'AUTHORIZING', ?, ?, ?, ?)
        ON CONFLICT DO NOTHING RETURNING revision`,
      [...IDENTITY, keyFingerprint, ownerHash, instant + REFRESH_TTL, instant]);
    }
    if (!claimed) {
      claimed = await first(`UPDATE finance_connections SET status = 'AUTHORIZING',
        key_fingerprint = ?, refresh_owner_hash = ?, refresh_until = ?, updated_at = ?
        WHERE ${WHERE} AND revision = ? AND status IN ('CONNECTED', 'REAUTH_REQUIRED')
        AND (status = 'REAUTH_REQUIRED' OR key_fingerprint = ?) RETURNING revision`,
      [keyFingerprint, ownerHash, instant + REFRESH_TTL, instant, ...IDENTITY, revision, keyFingerprint]);
    }
    if (!claimed) throw error('FINANCE_AUTHORIZATION_CONFLICT', 409);
    return {owner, revision: claimed.revision};
  };
  const failRefresh = async value => {
    const lease = leaseFor(value);
    const failed = await first(`UPDATE finance_connections SET status = 'REAUTH_REQUIRED',
      ciphertext = NULL, iv = NULL, key_fingerprint = NULL, expires_at = NULL,
      refresh_owner_hash = NULL, refresh_until = NULL, updated_at = ?
      WHERE ${WHERE} AND revision = ? AND status = 'REFRESHING' AND refresh_owner_hash = ? RETURNING revision`,
    [epoch(), ...IDENTITY, lease.revision, await digest(lease.owner)]);
    if (!failed) throw error('FINANCE_REFRESH_CONFLICT', 409);
    return {revision: failed.revision, status: 'REAUTH_REQUIRED'};
  };
  const completeRefresh = async (value, newTokens) => {
    const lease = leaseFor(value);
    let tokens;
    try { tokens = tokensFor(newTokens, epoch()); }
    catch (failure) {
      await failRefresh(lease);
      throw failure;
    }
    const revision = lease.revision + 1;
    const sealed = await encrypt(tokens, revision);
    await invalidateExpiredLease();
    const completed = await first(`UPDATE finance_connections SET revision = ?, status = 'CONNECTED',
      expires_at = ?, ciphertext = ?, iv = ?, key_fingerprint = ?,
      refresh_owner_hash = NULL, refresh_until = NULL, updated_at = ?
      WHERE ${WHERE} AND revision = ? AND status = 'REFRESHING' AND refresh_owner_hash = ?
      AND refresh_until > ? AND key_fingerprint = ? RETURNING revision`,
    [revision, tokens.expires_at, sealed.ciphertext, sealed.iv, keyFingerprint, epoch(), ...IDENTITY,
      lease.revision, await digest(lease.owner), epoch(), keyFingerprint]);
    if (!completed) throw error('FINANCE_REFRESH_CONFLICT', 409);
    return {revision: completed.revision};
  };
  const failAuthorization = async value => {
    const lease = leaseFor(value, true);
    const failed = await first(`UPDATE finance_connections SET status = 'REAUTH_REQUIRED',
      ciphertext = NULL, iv = NULL, key_fingerprint = NULL, expires_at = NULL,
      refresh_owner_hash = NULL, refresh_until = NULL, updated_at = ?
      WHERE ${WHERE} AND revision = ? AND status = 'AUTHORIZING' AND refresh_owner_hash = ? RETURNING revision`,
    [epoch(), ...IDENTITY, lease.revision, await digest(lease.owner)]);
    if (!failed) throw error('FINANCE_AUTHORIZATION_CONFLICT', 409);
    return {revision: failed.revision, status: 'REAUTH_REQUIRED'};
  };
  const completeAuthorization = async (value, newTokens) => {
    const lease = leaseFor(value, true);
    let tokens;
    try { tokens = tokensFor(newTokens, epoch()); }
    catch (failure) {
      await failAuthorization(lease);
      throw failure;
    }
    const revision = lease.revision + 1;
    const sealed = await encrypt(tokens, revision);
    await invalidateExpiredLease();
    const completed = await first(`UPDATE finance_connections SET revision = ?, status = 'CONNECTED',
      expires_at = ?, ciphertext = ?, iv = ?, key_fingerprint = ?,
      refresh_owner_hash = NULL, refresh_until = NULL, updated_at = ?
      WHERE ${WHERE} AND revision = ? AND status = 'AUTHORIZING' AND refresh_owner_hash = ?
      AND refresh_until > ? AND key_fingerprint = ? RETURNING revision`,
    [revision, tokens.expires_at, sealed.ciphertext, sealed.iv, keyFingerprint, epoch(), ...IDENTITY,
      lease.revision, await digest(lease.owner), epoch(), keyFingerprint]);
    if (!completed) throw error('FINANCE_AUTHORIZATION_CONFLICT', 409);
    return {revision: completed.revision};
  };
  return Object.freeze({setup, issueState, consumeState, status, readTokens,
    saveTokens, claimRefresh, completeRefresh, failRefresh,
    claimAuthorization, completeAuthorization, failAuthorization});
}
