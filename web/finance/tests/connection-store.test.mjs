import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {FINANCE_PROFILE, FinanceConnectionError, createFinanceStore} from '../src/connection-store.mjs';

const KEY = Buffer.alloc(32, 41).toString('base64');
const START = 1792324800000;
const safeError = (code, status = 503) => exception => {
  assert.ok(exception instanceof FinanceConnectionError);
  assert.equal(exception.code, code);
  assert.equal(exception.message, code);
  assert.equal(exception.status, status);
  return true;
};
async function fixture() {
  const db = new D1();
  let clock = START;
  const env = {FINANCE_DB: db, FINANCE_TOKEN_ENCRYPTION_KEY: KEY};
  const store = await createFinanceStore(env, {now: () => clock});
  await store.setup();
  return {db, env, store, advance: seconds => {clock += seconds * 1000;},
    tokens: (suffix = 'one', expires = 3600) => ({access_token: `private-access-${suffix}`,
      refresh_token: `private-refresh-${suffix}`, expires_at: Math.floor(clock / 1000) + expires})};
}

test('fixed live Brazil finance identity cannot be configured as Ads or mutated', async () => {
  assert.deepEqual(FINANCE_PROFILE, {partner_id: 2049333, shop_id: 1178167501, environment: 'LIVE', region: 'BRAZIL'});
  assert.throws(() => {FINANCE_PROFILE.partner_id = 2047569;}, TypeError);
  const {env, db} = await fixture();
  const store = await createFinanceStore({...env, FINANCE_PARTNER_ID: 2047569, SHOPEE_PARTNER_ID: 2047569},
    {profile: {partner_id: 2047569}, now: () => START});
  await store.saveTokens({access_token: 'a', refresh_token: 'r', expires_at: START / 1000 + 1});
  assert.equal((await store.status()).partner_id, 2049333);
  assert.equal(db.db.prepare('SELECT partner_id FROM finance_connections').get().partner_id, 2049333);
});

test('invalid/missing database or shared admin database is rejected', async () => {
  for (const env of [{}, {FINANCE_DB: {}}, {FINANCE_DB: {prepare() {}}}]) {
    await assert.rejects(createFinanceStore(env), safeError('FINANCE_DATABASE_CONFIGURATION'));
  }
  const {env} = await fixture();
  await assert.rejects(createFinanceStore({...env, ADMIN_DB: env.FINANCE_DB}), safeError('FINANCE_DATABASE_CONFIGURATION'));
});

test('encryption key must be canonical base64 of exactly 32 bytes', async () => {
  const {env} = await fixture();
  for (const key of [undefined, '', `${KEY}\n`, KEY.slice(0, -1), Buffer.alloc(31).toString('base64'),
    KEY.slice(0, -2) + 'F=']) {
    await assert.rejects(createFinanceStore({...env, FINANCE_TOKEN_ENCRYPTION_KEY: key}), safeError('FINANCE_ENCRYPTION_CONFIGURATION'));
  }
});

test('setup is idempotent and creates only the two private tables', async () => {
  const {db, store} = await fixture();
  await store.setup();
  assert.deepEqual(db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row => row.name),
    ['finance_connections', 'finance_oauth_states']);
  assert.deepEqual(await store.status(), {connected: false, status: 'DISCONNECTED', revision: null,
    expires_at: null, partner_id: 2049333, shop_id: 1178167501});
  assert.equal(await store.readTokens(), null);
});

test('OAuth stores only independent state/browser hashes, with ten-minute lifetime', async () => {
  const {db, store} = await fixture();
  const issued = await store.issueState();
  assert.match(issued.state, /^[A-Za-z0-9_-]{43}$/);
  assert.match(issued.browser_secret, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(issued.state, issued.browser_secret);
  assert.equal(issued.expires_at, START / 1000 + 600);
  const stored = JSON.stringify(db.db.prepare('SELECT * FROM finance_oauth_states').all());
  assert.ok(!stored.includes(issued.state));
  assert.ok(!stored.includes(issued.browser_secret));
  const consumed = await store.consumeState(issued.state, issued.browser_secret);
  assert.equal(consumed.partner_id, 2049333);
  assert.equal(consumed.issued_at, START / 1000);
  assert.equal(consumed.expires_at, issued.expires_at);
  assert.ok(!JSON.stringify(consumed).includes(issued.state));
});

test('OAuth browser mismatch, state replay, expiry and malformed values fail closed', async () => {
  const {store, advance} = await fixture();
  const first = await store.issueState();
  const second = await store.issueState();
  await assert.rejects(store.consumeState(first.state, second.browser_secret), safeError('FINANCE_INVALID_STATE', 400));
  await store.consumeState(first.state, first.browser_secret);
  await assert.rejects(store.consumeState(first.state, first.browser_secret), safeError('FINANCE_INVALID_STATE', 400));
  advance(600);
  await assert.rejects(store.consumeState(second.state, second.browser_secret), safeError('FINANCE_INVALID_STATE', 400));
  for (const value of ['', null, 'state-with-private-data', second.state + '=']) {
    await assert.rejects(store.consumeState(value, second.browser_secret), safeError('FINANCE_INVALID_STATE', 400));
  }
});

test('OAuth state is consumed atomically by exactly one concurrent callback', async () => {
  const {store} = await fixture();
  const state = await store.issueState();
  const results = await Promise.allSettled(Array.from({length: 6}, () => store.consumeState(state.state, state.browser_secret)));
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter(item => item.status === 'rejected' && item.reason.code === 'FINANCE_INVALID_STATE').length, 5);
});

test('OAuth states from a different region or profile cannot be exchanged', async () => {
  const {store, db} = await fixture();
  for (const [field, value] of [['partner_id', 2047569], ['shop_id', 1], ['environment', 'SANDBOX'],
    ['region', 'GLOBAL'], ['profile_context', 'other-context']]) {
    const state = await store.issueState();
    db.db.prepare(`UPDATE finance_oauth_states SET ${field} = ?`).run(value);
    await assert.rejects(store.consumeState(state.state, state.browser_secret), safeError('FINANCE_INVALID_STATE', 400));
    db.db.prepare('DELETE FROM finance_oauth_states').run();
  }
});

test('tokens are encrypted at rest and status contains only public metadata', async () => {
  const {store, db, tokens} = await fixture();
  const value = tokens();
  assert.deepEqual(await store.saveTokens(value), {revision: 1});
  const stored = JSON.stringify(db.db.prepare('SELECT * FROM finance_connections').all());
  assert.ok(!stored.includes(value.access_token));
  assert.ok(!stored.includes(value.refresh_token));
  assert.ok(!stored.includes(KEY));
  assert.deepEqual(await store.readTokens(), {revision: 1, ...value});
  const status = await store.status();
  assert.deepEqual(Object.keys(status).sort(), ['connected', 'expires_at', 'partner_id', 'revision', 'shop_id', 'status']);
  assert.equal(status.connected, true);
  assert.equal(status.status, 'CONNECTED');
  assert.ok(!JSON.stringify(status).includes('private-'));
});

test('fresh random GCM IV is used for each persisted revision', async () => {
  const {store, db, tokens} = await fixture();
  await store.saveTokens(tokens());
  const first = db.db.prepare('SELECT ciphertext, iv FROM finance_connections').get();
  await store.saveTokens(tokens(), {expectedRevision: 1});
  const second = db.db.prepare('SELECT ciphertext, iv FROM finance_connections').get();
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(Buffer.from(first.iv, 'base64').length, 12);
});

test('maximum-length Unicode token strings survive encryption and decoding', async () => {
  const {store, tokens} = await fixture();
  const value = {...tokens(), access_token: '界'.repeat(8192), refresh_token: '文'.repeat(8192)};
  await store.saveTokens(value);
  assert.deepEqual(await store.readTokens(), {revision: 1, ...value});
});

test('wrong encryption key is detected without destroying the original ciphertext', async () => {
  const {store, env, db, tokens} = await fixture();
  await store.saveTokens(tokens());
  const before = db.db.prepare('SELECT ciphertext FROM finance_connections').get().ciphertext;
  const wrong = await createFinanceStore({...env, FINANCE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64')});
  await assert.rejects(wrong.readTokens(), safeError('FINANCE_ENCRYPTION_KEY_MISMATCH'));
  await assert.rejects(wrong.status(), safeError('FINANCE_ENCRYPTION_KEY_MISMATCH'));
  assert.equal(db.db.prepare('SELECT ciphertext FROM finance_connections').get().ciphertext, before);
  assert.ok(await store.readTokens());
});

test('a store configured with the wrong key cannot overwrite or claim an existing connection', async () => {
  const {store, env, db, tokens} = await fixture();
  await store.saveTokens(tokens());
  const before = {...db.db.prepare('SELECT * FROM finance_connections').get()};
  const wrong = await createFinanceStore({...env, FINANCE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64')},
    {now: () => START});
  await assert.rejects(wrong.claimAuthorization(1), safeError('FINANCE_AUTHORIZATION_CONFLICT', 409));
  await assert.rejects(wrong.saveTokens(tokens('must-not-overwrite'), {expectedRevision: 1}),
    safeError('FINANCE_REVISION_CONFLICT', 409));
  assert.deepEqual({...db.db.prepare('SELECT * FROM finance_connections').get()}, before);
  assert.deepEqual(await store.readTokens(), {revision: 1, ...tokens()});
});

test('a delayed decrypt failure cannot erase a newer authorization or refresh lease', async t => {
  for (const operation of ['Authorization', 'Refresh']) {
    const {store, tokens} = await fixture();
    await store.saveTokens(tokens());
    let signalStarted;
    let releaseFailure;
    const started = new Promise(resolve => {signalStarted = resolve;});
    const held = new Promise(resolve => {releaseFailure = resolve;});
    const decrypt = t.mock.method(crypto.subtle, 'decrypt', async () => {
      signalStarted();
      await held;
      throw new Error('private provider payload that must not be exposed');
    });
    const readFailure = assert.rejects(store.readTokens(), safeError('FINANCE_TOKEN_DECRYPT_FAILED'));
    await started;
    const lease = await store[`claim${operation}`](1);
    releaseFailure();
    await readFailure;
    decrypt.mock.restore();
    assert.equal((await store.status()).status, operation === 'Authorization' ? 'AUTHORIZING' : 'REFRESHING');
    assert.deepEqual(await store[`complete${operation}`](lease, tokens('new-owner')), {revision: 2});
    assert.equal((await store.readTokens()).refresh_token, 'private-refresh-new-owner');
  }
});

test('GCM corruption, IV corruption and metadata tampering invalidate tokens safely', async () => {
  for (const [column, mutation] of [['ciphertext', row => row.ciphertext.slice(0, -4) + 'AAAA'],
    ['iv', () => Buffer.alloc(12).toString('base64')], ['expires_at', row => row.expires_at + 100],
    ['revision', row => row.revision + 1]]) {
    const {store, db, tokens} = await fixture();
    await store.saveTokens(tokens());
    const before = db.db.prepare('SELECT * FROM finance_connections').get();
    db.db.prepare(`UPDATE finance_connections SET ${column} = ?`).run(mutation(before));
    await assert.rejects(store.readTokens(), safeError('FINANCE_TOKEN_DECRYPT_FAILED'));
    assert.equal(await store.readTokens(), null);
    assert.equal((await store.status()).status, 'REAUTH_REQUIRED');
    const row = db.db.prepare('SELECT ciphertext, iv, expires_at FROM finance_connections').get();
    assert.equal(row.ciphertext, null);
    assert.equal(row.iv, null);
    assert.equal(row.expires_at, null);
  }
});

test('a stored connection under a different identity is never selected', async () => {
  const {store, db, tokens} = await fixture();
  await store.saveTokens(tokens());
  db.db.prepare('UPDATE finance_connections SET partner_id = 2047569').run();
  assert.equal(await store.readTokens(), null);
  assert.equal((await store.status()).status, 'DISCONNECTED');
});

test('CAS prevents stale, duplicate creation and parallel token writes', async () => {
  const {store, tokens} = await fixture();
  await assert.rejects(store.saveTokens(tokens(), {expectedRevision: 1}), safeError('FINANCE_REVISION_CONFLICT', 409));
  await store.saveTokens(tokens());
  await assert.rejects(store.saveTokens(tokens()), safeError('FINANCE_REVISION_CONFLICT', 409));
  const results = await Promise.allSettled([store.saveTokens(tokens('two'), {expectedRevision: 1}),
    store.saveTokens(tokens('three'), {expectedRevision: 1})]);
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal((await store.readTokens()).revision, 2);
  await assert.rejects(store.saveTokens(tokens(), {expectedRevision: 1}), safeError('FINANCE_REVISION_CONFLICT', 409));
});

test('token normalization rejects missing, oversized, expired, invalid and overlong lifetime values', async () => {
  const {store, tokens} = await fixture();
  const valid = tokens();
  for (const value of [null, {}, {...valid, access_token: ''}, {...valid, refresh_token: 'r'.repeat(8193)},
    {...valid, access_token: 'a\nprivate'}, {...valid, expires_at: START / 1000},
    {...valid, expires_at: START / 1000 + 86401}, {...valid, expires_at: 1.1}]) {
    await assert.rejects(store.saveTokens(value), safeError('FINANCE_INVALID_TOKENS', 502));
  }
  for (const revision of [-1, 1.1, NaN, '1', Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(store.saveTokens(valid, {expectedRevision: revision}), safeError('FINANCE_INVALID_REVISION', 400));
  }
  await store.saveTokens({...valid, ignored_upstream_field: 'not persisted'});
  assert.equal((await store.readTokens()).ignored_upstream_field, undefined);
});

test('one refresh owner wins, competing readers and writers cannot reuse refresh tokens', async () => {
  const {store, db, tokens} = await fixture();
  await store.saveTokens(tokens());
  const results = await Promise.allSettled([store.claimRefresh(1), store.claimRefresh(1)]);
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
  const lease = results.find(value => value.status === 'fulfilled').value;
  assert.ok(!JSON.stringify(db.db.prepare('SELECT * FROM finance_connections').all()).includes(lease.owner));
  await assert.rejects(store.readTokens(), safeError('FINANCE_REFRESH_IN_PROGRESS', 409));
  await assert.rejects(store.saveTokens(tokens('b'), {expectedRevision: 1}), safeError('FINANCE_REVISION_CONFLICT', 409));
  assert.deepEqual(await store.completeRefresh(lease, tokens('rotated')), {revision: 2});
  assert.equal((await store.readTokens()).refresh_token, 'private-refresh-rotated');
  await assert.rejects(store.completeRefresh(lease, tokens('replay')), safeError('FINANCE_REFRESH_CONFLICT', 409));
});

test('expired access token can be read for refresh, but expired refresh lease cannot be taken over', async () => {
  const {store, tokens, advance, db} = await fixture();
  await store.saveTokens(tokens('old', 1));
  advance(2);
  assert.equal((await store.readTokens()).access_token, 'private-access-old');
  const lease = await store.claimRefresh(1);
  advance(60);
  await assert.rejects(store.claimRefresh(1), safeError('FINANCE_REFRESH_CONFLICT', 409));
  await assert.rejects(store.completeRefresh(lease, tokens('late')), safeError('FINANCE_REFRESH_CONFLICT', 409));
  assert.equal((await store.status()).status, 'REAUTH_REQUIRED');
  assert.equal(db.db.prepare('SELECT ciphertext FROM finance_connections').get().ciphertext, null);
  assert.equal(await store.readTokens(), null);
});

test('refresh failure, malformed rotation and forged owner fail closed', async () => {
  const {store, tokens} = await fixture();
  await store.saveTokens(tokens());
  const lease = await store.claimRefresh(1);
  const unrelated = await store.issueState();
  await assert.rejects(store.failRefresh({...lease, owner: unrelated.state}), safeError('FINANCE_REFRESH_CONFLICT', 409));
  assert.equal((await store.status()).status, 'REFRESHING');
  await assert.rejects(store.completeRefresh(lease, {}), safeError('FINANCE_INVALID_TOKENS', 502));
  assert.equal((await store.status()).status, 'REAUTH_REQUIRED');
  assert.equal(await store.readTokens(), null);
  await assert.rejects(store.claimRefresh(1), safeError('FINANCE_REFRESH_CONFLICT', 409));
  await store.saveTokens(tokens('reauthorized'), {expectedRevision: 1});
  const secondLease = await store.claimRefresh(2);
  await store.failRefresh(secondLease);
  assert.equal(await store.readTokens(), null);
});

test('two valid OAuth states cannot start concurrent provider exchanges', async () => {
  const {store, tokens} = await fixture();
  const states = await Promise.all([store.issueState(), store.issueState()]);
  await Promise.all(states.map(value => store.consumeState(value.state, value.browser_secret)));
  const claims = await Promise.allSettled([store.claimAuthorization(0), store.claimAuthorization(0)]);
  assert.equal(claims.filter(value => value.status === 'fulfilled').length, 1);
  const lease = claims.find(value => value.status === 'fulfilled').value;
  assert.equal((await store.status()).status, 'AUTHORIZING');
  assert.equal((await store.status()).connected, false);
  await assert.rejects(store.readTokens(), safeError('FINANCE_AUTHORIZATION_IN_PROGRESS', 409));
  assert.deepEqual(await store.completeAuthorization(lease, tokens('new-authorization')), {revision: 1});
  assert.equal((await store.readTokens()).access_token, 'private-access-new-authorization');
  await assert.rejects(store.completeAuthorization(lease, tokens('replayed')), safeError('FINANCE_AUTHORIZATION_CONFLICT', 409));
});

test('authorization and refresh share a mutually exclusive lease', async () => {
  const {store, tokens} = await fixture();
  await store.saveTokens(tokens());
  const refreshing = await store.claimRefresh(1);
  await assert.rejects(store.claimAuthorization(1), safeError('FINANCE_AUTHORIZATION_CONFLICT', 409));
  await store.completeRefresh(refreshing, tokens('rotated'));
  const authorizing = await store.claimAuthorization(2);
  await assert.rejects(store.claimRefresh(2), safeError('FINANCE_REFRESH_CONFLICT', 409));
  await assert.rejects(store.saveTokens(tokens(), {expectedRevision: 2}), safeError('FINANCE_REVISION_CONFLICT', 409));
  await store.completeAuthorization(authorizing, tokens('authorized'));
  assert.equal((await store.readTokens()).revision, 3);
});

test('failed/expired authorization cannot reuse prior tokens or late provider result', async () => {
  const {store, tokens, advance} = await fixture();
  const first = await store.claimAuthorization(0);
  await store.failAuthorization(first);
  assert.equal((await store.status()).status, 'REAUTH_REQUIRED');
  assert.equal(await store.readTokens(), null);
  const second = await store.claimAuthorization(0);
  await store.completeAuthorization(second, tokens());
  const third = await store.claimAuthorization(1);
  advance(60);
  await assert.rejects(store.completeAuthorization(third, tokens('late')), safeError('FINANCE_AUTHORIZATION_CONFLICT', 409));
  assert.equal((await store.status()).status, 'REAUTH_REQUIRED');
  assert.equal(await store.readTokens(), null);
  await assert.rejects(store.claimAuthorization(0), safeError('FINANCE_AUTHORIZATION_CONFLICT', 409));
});

test('database exceptions are sanitized rather than exposing data or query errors', async () => {
  const db = {prepare() {throw new Error('private-access-secret SQL including credentials');}, batch() {throw new Error('secret');}};
  const store = await createFinanceStore({FINANCE_DB: db, FINANCE_TOKEN_ENCRYPTION_KEY: KEY});
  await assert.rejects(store.setup(), safeError('FINANCE_STORAGE_UNAVAILABLE'));
  await assert.rejects(store.status(), safeError('FINANCE_STORAGE_UNAVAILABLE'));
  await assert.rejects(store.issueState(), safeError('FINANCE_STORAGE_UNAVAILABLE'));
});
