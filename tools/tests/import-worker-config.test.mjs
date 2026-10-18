import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {importWorkerConfig, createFinanceConfig} from '../import_worker_config.mjs';
import {PROJECT_ROOT, TARGETS, sha256, stableJson} from '../worker_project.mjs';

const authSource = readFileSync(resolve(PROJECT_ROOT, 'web/cloudflare/auth-worker.mjs'));
const appSource = readFileSync(resolve(PROJECT_ROOT, 'web/cloudflare/app-worker.mjs'));
const ADMIN_ID = '12345678-1234-1234-1234-123456789abc';
const FINANCE_ID = '87654321-4321-4321-4321-cba987654321';
const secret = 'FIXTURE_SECRET_MUST_NEVER_ENTER_IMPORTED_OUTPUT';
const authExport = () => ({name: TARGETS.auth.name, main: 'src/index.js', account_id: 'a'.repeat(32),
  compatibility_date: '2026-09-01', compatibility_flags: ['nodejs_compat'], workers_dev: true, preview_urls: true,
  routes: [{pattern: 'auth.brazacommerce.com.br', custom_domain: true, zone_name: 'brazacommerce.com.br'}],
  vars: {GATEWAY_SHARED_SECRET: secret, REVIEW_USERNAME: 'fixture reviewer'}, secrets: [{name: secret, value: secret}]});
const appExport = () => ({...authExport(), name: TARGETS.app.name,
  d1_databases: [{binding: 'ADMIN_DB', database_id: ADMIN_ID, database_name: 'existing-admin'}],
  triggers: {crons: ['17 * * * *']}, kv_namespaces: [{binding: 'CACHE', id: 'b'.repeat(32)}],
  r2_buckets: [{binding: 'FILES', bucket_name: 'existing-files'}],
  services: [{binding: 'EXISTING_HELPER', service: 'existing-helper', entrypoint: 'API'}],
  placement: {mode: 'smart'}, limits: {cpu_ms: 50}, observability: {enabled: true, head_sampling_rate: 0.25},
  logpush: false, tail_consumers: [{service: 'existing-tail'}]});
const rejectsCode = (fn, code) => assert.throws(fn, failure => failure.code === code && failure.message === code);

test('existing App import preserves resource configuration and strips all dashboard variable/secret data', () => {
  const before = appExport();
  const {config, snapshot} = importWorkerConfig('app', before, appSource);
  for (const field of ['account_id', 'compatibility_date', 'compatibility_flags', 'workers_dev', 'preview_urls',
    'routes', 'triggers', 'd1_databases', 'kv_namespaces', 'r2_buckets', 'services', 'placement', 'limits',
    'observability', 'logpush', 'tail_consumers']) assert.deepEqual(config[field], before[field]);
  assert.equal(config.main, TARGETS.app.main);
  assert.equal(config.keep_vars, true);
  assert.equal(Object.hasOwn(config, 'vars'), false);
  assert.equal(Object.hasOwn(config, 'secrets'), false);
  assert.equal(JSON.stringify({config, snapshot}).includes(secret), false);
  assert.equal(JSON.stringify({config, snapshot}).includes('REVIEW_USERNAME'), false);
  assert.equal(JSON.stringify({config, snapshot}).includes('GATEWAY_SHARED_SECRET'), false);
  assert.equal(snapshot.source_sha256, sha256(appSource));
  assert.equal(snapshot.recognized_source_sha256, sha256(appSource));
  assert.equal(snapshot.config_sha256, sha256(Buffer.from(stableJson(config))));
  assert.deepEqual(snapshot.captured_config, config);
  assert.notEqual(snapshot.captured_config, config);
  assert.equal(snapshot.mode, 'existing');
  assert.deepEqual(before.vars.GATEWAY_SHARED_SECRET, secret);
});

test('Auth import adds only its isolated financial service and preserves an unrelated service', () => {
  const input = authExport();
  input.services = [{binding: 'OTHER', service: 'other-worker'}];
  const {config} = importWorkerConfig('auth', input, authSource);
  assert.deepEqual(config.services, [{binding: 'OTHER', service: 'other-worker'},
    {binding: 'SHOPEE_FINANCE_SERVICE', service: 'brazacommerce-finance'}]);
  assert.equal(input.services.length, 1);
  const again = importWorkerConfig('auth', config, authSource);
  assert.deepEqual(again.config, config);
});

test('an existing financial service to a different target, environment or entrypoint is rejected', () => {
  for (const service of [{binding: 'SHOPEE_FINANCE_SERVICE', service: 'wrong-worker'},
    {binding: 'SHOPEE_FINANCE_SERVICE', service: 'brazacommerce-finance', environment: 'staging'},
    {binding: 'SHOPEE_FINANCE_SERVICE', service: 'brazacommerce-finance', entrypoint: 'Other'}]) {
    rejectsCode(() => importWorkerConfig('auth', {...authExport(), services: [service]}, authSource), 'WORKER_FINANCE_SERVICE_CONFLICT');
  }
});

test('unsupported resource types never disappear silently from an imported export', () => {
  for (const field of ['assets', 'unsafe', 'queues', 'durable_objects', 'env', 'secrets_store_secrets', 'build', 'migrations']) {
    rejectsCode(() => importWorkerConfig('auth', {...authExport(), [field]: {value: secret}}, authSource), 'WORKER_CONFIG_UNSUPPORTED');
  }
});

test('unknown source is rejected without disclosing source text or dashboard values', () => {
  rejectsCode(() => importWorkerConfig('auth', authExport(), Buffer.from('export default ' + secret)), 'WORKER_SOURCE_UNRECOGNIZED');
  rejectsCode(() => importWorkerConfig('auth', authExport(), Buffer.from([0xff])), 'WORKER_SOURCE_INVALID');
});

test('CRLF downloads retain their raw digest and match the reviewed LF source', () => {
  const downloaded = Buffer.from(authSource.toString('utf8').replace(/\n/g, '\r\n'));
  const {snapshot} = importWorkerConfig('auth', authExport(), downloaded);
  assert.notEqual(snapshot.source_sha256, snapshot.recognized_source_sha256);
  assert.equal(snapshot.source_sha256, sha256(downloaded));
  assert.equal(snapshot.recognized_source_sha256, sha256(authSource));
});

test('App requires a real ADMIN_DB and rejects placeholder or zero database IDs', () => {
  for (const id of ['REPLACE_WITH_REAL_D1_ID', '', '00000000-0000-0000-0000-000000000000']) {
    rejectsCode(() => importWorkerConfig('app', {...appExport(), d1_databases: [{binding: 'ADMIN_DB', database_id: id}]}, appSource), 'WORKER_D1_ID_REQUIRED');
  }
  rejectsCode(() => importWorkerConfig('app', {...appExport(), d1_databases: []}, appSource), 'WORKER_ADMIN_DB_REQUIRED');
});

test('duplicate resource binding names are rejected instead of changing their type', () => {
  rejectsCode(() => importWorkerConfig('app', {...appExport(), services: [{binding: 'ADMIN_DB', service: 'other'}]}, appSource), 'WORKER_BINDING_INVALID');
});

test('wrong Worker identity and invalid compatibility dates block import', () => {
  rejectsCode(() => importWorkerConfig('auth', {...authExport(), name: 'brazacommerce-app'}, authSource), 'WORKER_CONFIG_IDENTITY');
  const missingDate = authExport();
  delete missingDate.compatibility_date;
  rejectsCode(() => importWorkerConfig('auth', missingDate, authSource), 'WORKER_COMPATIBILITY_REQUIRED');
  for (const compatibility_date of ['latest', '2026-02-30']) {
    rejectsCode(() => importWorkerConfig('auth', {...authExport(), compatibility_date}, authSource), 'WORKER_COMPATIBILITY_REQUIRED');
  }
  rejectsCode(() => importWorkerConfig('unknown', authExport(), authSource), 'WORKER_TARGET_INVALID');
});

test('new Finance config is private and contains no secret values or activation variable', t => {
  const root = mkdtempSync(resolve(tmpdir(), 'braza-finance-import-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const {config, snapshot} = createFinanceConfig({databaseId: FINANCE_ID, databaseName: 'private-finance', accountId: 'c'.repeat(32)}, {root});
  assert.deepEqual(config.d1_databases, [{binding: 'FINANCE_DB', database_name: 'private-finance', database_id: FINANCE_ID}]);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.keep_vars, true);
  assert.equal(Object.hasOwn(config, 'vars'), false);
  assert.equal(snapshot.mode, 'new');
  assert.equal(snapshot.source_sha256, null);
  assert.equal(snapshot.recognized_source_sha256, null);
  assert.equal(snapshot.config_sha256, sha256(Buffer.from(stableJson(config))));
});

test('new Finance database cannot reuse any App D1 binding', t => {
  const root = mkdtempSync(resolve(tmpdir(), 'braza-finance-isolation-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(resolve(root, 'workers/app'), {recursive: true});
  writeFileSync(resolve(root, 'workers/app/wrangler.json'), stableJson({d1_databases: [{binding: 'ADMIN_DB', database_id: ADMIN_ID}]}));
  rejectsCode(() => createFinanceConfig({databaseId: ADMIN_ID.toUpperCase(), databaseName: 'private-finance'}, {root}), 'WORKER_FINANCE_DB_MUST_BE_PRIVATE');
  assert.equal(createFinanceConfig({databaseId: FINANCE_ID, databaseName: 'private-finance'}, {root}).config.name, TARGETS.finance.name);
});

test('new Finance rejects placeholders, invalid names and invalid account IDs', t => {
  const root = mkdtempSync(resolve(tmpdir(), 'braza-finance-input-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  rejectsCode(() => createFinanceConfig({databaseId: secret, databaseName: 'finance'}, {root}), 'WORKER_D1_ID_REQUIRED');
  rejectsCode(() => createFinanceConfig({databaseId: FINANCE_ID, databaseName: secret + '\n'}, {root}), 'WORKER_D1_NAME_INVALID');
  rejectsCode(() => createFinanceConfig({databaseId: FINANCE_ID, databaseName: 'finance', accountId: secret}, {root}), 'WORKER_ACCOUNT_INVALID');
});

function cliFixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'braza-import-cli-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(resolve(root, 'tools'), {recursive: true});
  writeFileSync(resolve(root, 'tools/import_worker_config.mjs'), readFileSync(resolve(PROJECT_ROOT, 'tools/import_worker_config.mjs')));
  // Keep CLI writes in an isolated repository. The same shared functions are
  // copied verbatim; only their PROJECT_ROOT resolves to this temporary tree.
  writeFileSync(resolve(root, 'tools/worker_project.mjs'), readFileSync(resolve(PROJECT_ROOT, 'tools/worker_project.mjs')));
  symlinkSync(resolve(PROJECT_ROOT, 'node_modules'), resolve(root, 'node_modules'), 'dir');
  const input = resolve(root, 'export.jsonc');
  const source = resolve(root, 'downloaded-worker.mjs');
  writeFileSync(input, '// Download fixture, with private dashboard vars.\n' + JSON.stringify(authExport(), null, 2).replace(/\n}$/, ',\n}'));
  writeFileSync(source, authSource);
  const run = args => spawnSync(process.execPath, [resolve(root, 'tools/import_worker_config.mjs'), ...args], {encoding: 'utf8', cwd: root});
  return {root, input, source, run};
}

test('CLI imports JSONC privately, repeats idempotently and requires explicit replacement', t => {
  const f = cliFixture(t);
  const args = ['auth', f.input, f.source];
  for (let i = 0; i < 2; i++) {
    const result = f.run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'WORKER_CONFIG_IMPORTED auth\n');
    assert.equal((result.stdout + result.stderr).includes(secret), false);
  }
  const file = resolve(f.root, 'workers/auth/wrangler.json');
  const initial = readFileSync(file, 'utf8');
  assert.equal(initial.includes(secret), false);
  const changed = {...authExport(), compatibility_flags: []};
  writeFileSync(f.input, stableJson(changed));
  const denied = f.run(args);
  assert.equal(denied.status, 1);
  assert.equal(denied.stderr, 'WORKER_IMPORT_REPLACE_REQUIRED\n');
  assert.equal(readFileSync(file, 'utf8'), initial);
  const approved = f.run([...args, '--replace']);
  assert.equal(approved.status, 0, approved.stderr);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).compatibility_flags, []);
});

test('CLI invalid source never writes partial configuration or prints input values', t => {
  const f = cliFixture(t);
  writeFileSync(f.source, secret);
  const result = f.run(['auth', f.input, f.source]);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'WORKER_SOURCE_UNRECOGNIZED\n');
  assert.equal((result.stdout + result.stderr).includes(secret), false);
  assert.equal(existsSync(resolve(f.root, 'workers/auth/wrangler.json')), false);
  assert.equal(existsSync(resolve(f.root, 'workers/auth/migration.json')), false);
});

test('CLI new-Finance mode emits only the selected private database metadata', t => {
  const f = cliFixture(t);
  const result = f.run(['finance', '--new-d1', FINANCE_ID, '--database-name', 'private-finance']);
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(readFileSync(resolve(f.root, 'workers/finance/wrangler.json'), 'utf8'));
  const snapshot = JSON.parse(readFileSync(resolve(f.root, 'workers/finance/migration.json'), 'utf8'));
  assert.equal(config.d1_databases[0].database_id, FINANCE_ID);
  assert.equal(config.workers_dev, false);
  assert.equal(snapshot.mode, 'new');
  assert.equal(snapshot.config_sha256, sha256(Buffer.from(stableJson(config))));
});
