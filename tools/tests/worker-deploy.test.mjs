import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateDeployment, deployWorker} from '../worker_deploy.mjs';
import {PROJECT_ROOT, TARGETS, stableJson, sha256} from '../worker_project.mjs';
import {BROWSER_ASSETS_CONFIG} from '../import_worker_config.mjs';
import {buildBrowserAssets, EMPTY_BROWSER_ASSET_PUBLICATION} from '../browser_assets.mjs';

const APP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FINANCE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function assertCheckedInDatabases(target, actual, original) {
  const file = path.join(PROJECT_ROOT, 'workers', target, 'commercial-account.json');
  if (!fs.existsSync(file)) {assert.deepEqual(actual, original);return original;}
  const authorization = JSON.parse(fs.readFileSync(file));
  assert.deepEqual(Object.keys(authorization).sort(), ['account_database_id', 'captured_config_sha256', 'version']);
  assert.equal(authorization.version, 1);
  const captured = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'workers', target, 'wrangler.json')));
  assert.equal(authorization.captured_config_sha256, sha256(stableJson(captured)));
  assert.match(authorization.account_database_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  const extension = {binding: 'ACCOUNT_DB', database_id: authorization.account_database_id.toLowerCase()};
  assert.deepEqual(actual.filter(row => row.binding !== 'ACCOUNT_DB'), original);
  assert.deepEqual(actual.filter(row => row.binding === 'ACCOUNT_DB'), [extension]);
  assert.deepEqual(actual, [...original, extension], 'the reviewed account binding is the only storage extension');
  return [...original, extension];
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'braza-git-deploy-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const save = (name, config) => {
    fs.mkdirSync(path.join(root, 'workers', name), {recursive: true});
    const snapshot = {version: 1, target: name, worker_name: TARGETS[name].name,
      mode: name === 'finance' ? 'new' : 'existing',
      source_sha256: name === 'finance' ? null : TARGETS[name].baselineHashes[0],
      recognized_source_sha256: name === 'finance' ? null : TARGETS[name].baselineHashes[0],
      config_sha256: sha256(stableJson(config)), captured_config: config};
    fs.writeFileSync(path.join(root, 'workers', name, 'wrangler.json'), stableJson(config));
    fs.writeFileSync(path.join(root, 'workers', name, 'migration.json'), stableJson(snapshot));
  };
  const config = name => ({name: TARGETS[name].name, main: TARGETS[name].main,
    compatibility_date: '2026-10-12', keep_vars: true,
    ...(name === 'app' ? {d1_databases: [{binding: 'ADMIN_DB', database_id: APP_ID}],
      routes: [{pattern: 'app.brazacommerce.com.br', custom_domain: true}], triggers: {crons: ['*/15 * * * *']}} : {}),
    ...(name === 'auth' ? {services: [{binding: 'SHOPEE_FINANCE_SERVICE', service: 'brazacommerce-finance'}],
      routes: [{pattern: 'auth.brazacommerce.com.br', custom_domain: true}]} : {}),
    ...(name === 'finance' ? {workers_dev: false, preview_urls: false,
      d1_databases: [{binding: 'FINANCE_DB', database_id: FINANCE_ID}]} : {}),
  });
  for (const name of Object.keys(TARGETS)) save(name, config(name));
  const calls = [];
  const automate = (name = 'app', mutation = () => {}) => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'workers', name, 'wrangler.json')));
    const automation = {version: 1, cron: '* * * * *', captured_config_sha256: sha256(stableJson(config))};
    mutation(automation);
    fs.writeFileSync(path.join(root, 'workers', name, 'automation.json'), stableJson(automation));
  };
  const run = (...args) => { calls.push(args); return 'OK'; };
  const built = [];
  const build = name => built.push(name);
  return {root, save, config, automate, run, calls, build, built};
}

test('verified targets retain the captured domain, database, cron and private profile', t => {
  const f = fixture(t);
  assert.deepEqual(validateDeployment('app', f).config.triggers.crons, ['*/15 * * * *']);
  assert.equal(validateDeployment('auth', f).config.services[0].service, 'brazacommerce-finance');
  assert.equal(validateDeployment('finance', f).config.workers_dev, false);
});

test('missing migration config never invokes the build or Wrangler', t => {
  const f = fixture(t); fs.unlinkSync(path.join(f.root, 'workers/app/migration.json'));
  assert.throws(() => deployWorker('app', f), {code: 'WORKER_MIGRATION_CONFIG_REQUIRED'});
  assert.equal(f.calls.length, 0); assert.equal(f.built.length, 0);
});

test('database or cron edits that differ from the captured config block upload', t => {
  const f = fixture(t);
  for (const change of [config => { delete config.d1_databases; }, config => { config.triggers.crons = []; }]) {
    f.save('app', f.config('app'));
    const config = f.config('app'); change(config);
    fs.writeFileSync(path.join(f.root, 'workers/app/wrangler.json'), stableJson(config));
    assert.throws(() => deployWorker('app', f), {code: 'WORKER_MIGRATION_SNAPSHOT_MISMATCH'});
  }
  assert.equal(f.calls.length, 0); assert.equal(f.built.length, 0);
});

test('Worker swaps, vars, scope changes and placeholder IDs fail before Wrangler', t => {
  const f = fixture(t);
  for (const mutation of [
    config => { config.name = 'other-worker'; },
    config => { config.main = '../../dist/auth-worker.mjs'; },
    config => { config.vars = {PRIVATE: 'fixture-private-value'}; },
    config => { config.d1_databases[0].database_id = 'REPLACE_WITH_REAL_D1_ID'; },
    config => { config.env = {preview: {}}; },
  ]) {
    const config = f.config('app'); mutation(config); f.save('app', config);
    assert.throws(() => deployWorker('app', f));
  }
  assert.equal(f.calls.length, 0); assert.equal(f.built.length, 0);
});

test('unknown deployed source and corrupt snapshot are rejected', t => {
  const f = fixture(t);
  const file = path.join(f.root, 'workers/app/migration.json');
  const snapshot = JSON.parse(fs.readFileSync(file)); snapshot.recognized_source_sha256 = 'c'.repeat(64);
  fs.writeFileSync(file, stableJson(snapshot));
  assert.throws(() => deployWorker('app', f), {code: 'WORKER_PUBLISHED_SOURCE_UNRECOGNIZED'});
  fs.writeFileSync(file, 'fixture-private-malformed-config');
  assert.throws(() => deployWorker('app', f), {code: 'WORKER_MIGRATION_CONFIG_REQUIRED'});
  assert.equal(f.calls.length, 0);
});

test('Auth requires the intended service and the Finance migration before upload', t => {
  const f = fixture(t);
  const config = f.config('auth'); config.services[0].service = 'brazacommerce-app'; f.save('auth', config);
  assert.throws(() => deployWorker('auth', f), {code: 'WORKER_FINANCE_SERVICE_REQUIRED'});
  f.save('auth', f.config('auth'));
  fs.unlinkSync(path.join(f.root, 'workers/finance/migration.json'));
  assert.throws(() => deployWorker('auth', f), {code: 'WORKER_MIGRATION_CONFIG_REQUIRED'});
  assert.equal(f.calls.length, 0); assert.equal(f.built.length, 0);
});

test('Finance refuses shared ADMIN_DB, public routes, cron and public previews', t => {
  const f = fixture(t);
  for (const mutation of [
    config => { config.d1_databases[0].database_id = APP_ID; },
    config => { config.workers_dev = true; },
    config => { config.preview_urls = true; },
    config => { config.routes = [{pattern: 'finance.brazacommerce.com.br', custom_domain: true}]; },
    config => { config.triggers = {crons: ['*/15 * * * *']}; },
    config => { config.services = [{binding: 'OTHER', service: 'brazacommerce-auth'}]; },
  ]) {
    const config = f.config('finance'); mutation(config); f.save('finance', config);
    assert.throws(() => deployWorker('finance', f));
  }
  assert.equal(f.calls.length, 0); assert.equal(f.built.length, 0);
});

test('valid deployment builds one target and calls pinned Wrangler once with explicit config', t => {
  const f = fixture(t);
  assert.equal(deployWorker('finance', {...f, dryRun: true}), 'OK');
  assert.deepEqual(f.built, ['finance']); assert.equal(f.calls.length, 1);
  const [node, args, options] = f.calls[0];
  assert.equal(node, process.execPath);
  assert.deepEqual(args, [path.join(f.root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--config',
    path.join(f.root, 'workers/finance/wrangler.json'), '--dry-run']);
  assert.equal(options.cwd, f.root);
});

test('App automation deploys the authorized effective cron and preserves the migration capture', t => {
  const f = fixture(t); f.automate();
  const originalPath = path.join(f.root, 'workers/app/wrangler.json');
  const snapshotPath = path.join(f.root, 'workers/app/migration.json');
  const original = fs.readFileSync(originalPath, 'utf8');
  const snapshot = fs.readFileSync(snapshotPath, 'utf8');
  const verified = validateDeployment('app', f);
  const generatedPath = path.join(f.root, 'workers/app/.wrangler/automation.generated.json');
  const expected = {...JSON.parse(original), main: path.join(f.root, 'dist/app-worker.mjs'),
    triggers: {crons: ['* * * * *']}};
  assert.deepEqual(verified.config, expected);
  assert.equal(verified.configPath, generatedPath);
  assert.equal(fs.existsSync(generatedPath), false, 'validation is read-only');
  assert.equal(deployWorker('app', {...f, dryRun: true}), 'OK');
  assert.deepEqual(f.built, ['app']);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0][1], [path.join(f.root, 'node_modules/wrangler/bin/wrangler.js'),
    'deploy', '--config', generatedPath, '--dry-run']);
  assert.deepEqual(JSON.parse(fs.readFileSync(generatedPath)), expected);
  assert.equal(fs.readFileSync(originalPath, 'utf8'), original);
  assert.equal(fs.readFileSync(snapshotPath, 'utf8'), snapshot);
});

test('App automation is bound to the exact capture and rejects extra configuration or different schedules', t => {
  const f = fixture(t);
  for (const mutation of [
    value => { value.version = 2; },
    value => { value.cron = '*/2 * * * *'; },
    value => { value.cron = '*/5 * * * *'; },
    value => { value.cron = '*/15 * * * *'; },
    value => { value.captured_config_sha256 = 'c'.repeat(64); },
    value => { delete value.captured_config_sha256; },
    value => { value.vars = {PRIVATE: 'fixture-private-value'}; },
    value => { value.env = {}; },
    value => { value.keep_vars = false; },
    value => { value.routes = []; },
    value => { value.d1_databases = []; },
  ]) {
    f.automate('app', mutation);
    assert.throws(() => deployWorker('app', f), {code: 'WORKER_AUTOMATION_CONFIG_INVALID'});
  }
  fs.writeFileSync(path.join(f.root, 'workers/app/automation.json'), '{');
  assert.throws(() => deployWorker('app', f), {code: 'WORKER_AUTOMATION_CONFIG_INVALID'});
  assert.equal(f.calls.length, 0); assert.equal(f.built.length, 0);
});

test('automation does not permit edits to the original App capture', t => {
  const f = fixture(t); f.automate();
  const original = f.config('app'); original.triggers.crons = ['*/5 * * * *'];
  fs.writeFileSync(path.join(f.root, 'workers/app/wrangler.json'), stableJson(original));
  assert.throws(() => deployWorker('app', f), {code: 'WORKER_MIGRATION_SNAPSHOT_MISMATCH'});
  assert.equal(f.calls.length, 0); assert.equal(f.built.length, 0);
});

test('Auth and Finance cannot enable an automation override', t => {
  const f = fixture(t);
  for (const name of ['auth', 'finance']) {
    f.automate(name);
    assert.throws(() => deployWorker(name, f), {code: 'WORKER_AUTOMATION_CONFIG_INVALID'});
  }
  assert.equal(f.calls.length, 0); assert.equal(f.built.length, 0);
});

test('checked-in App automation validates the effective one-minute trigger without changing its capture', () => {
  const verified = validateDeployment('app');
  const snapshot = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'workers/app/migration.json')));
  const original = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'workers/app/wrangler.json')));
  assert.deepEqual(verified.config.triggers.crons, ['* * * * *']);
  assert.equal(sha256(stableJson(original)), snapshot.config_sha256);
  assert.deepEqual(original, snapshot.captured_config);
  assert.equal(verified.config.keep_vars, true);
  assertCheckedInDatabases('app', verified.config.d1_databases, original.d1_databases);
  assert.deepEqual(verified.config.routes, original.routes);
});

function enableAssets(f, name = 'app', mutate = () => {}) {
  const captured = JSON.parse(fs.readFileSync(path.join(f.root, 'workers', name, 'wrangler.json')));
  const authorization = {version: 1, captured_config_sha256: sha256(stableJson(captured)), assets: {...BROWSER_ASSETS_CONFIG}};
  mutate(authorization);
  fs.writeFileSync(path.join(f.root, 'workers', name, 'browser-assets.json'), stableJson(authorization));
}

function assetBuilder(f, mutate = () => {}) {
  return name => {
    f.build(name);
    fs.writeFileSync(path.join(f.root, 'workers/app/browser-assets-published.json'), stableJson(EMPTY_BROWSER_ASSET_PUBLICATION));
    const manifest = buildBrowserAssets({schema: 'mls_browser_assets_build_v1', entries: [{
      id: 'bank', export_name: 'BANK_RECONCILIATION_CLIENT',
      source: 'const BANK_RECONCILIATION_CLIENT="globalThis.fixtureBankReady=true;";',
    }]}, {root: f.root});
    mutate(manifest);
  };
}

test('App assets add only their exact binding and compose with the authorized cron without rewriting captures', t => {
  const f = fixture(t); f.automate(); enableAssets(f);
  const original = fs.readFileSync(path.join(f.root, 'workers/app/wrangler.json'), 'utf8');
  const snapshot = fs.readFileSync(path.join(f.root, 'workers/app/migration.json'), 'utf8');
  const verified = validateDeployment('app', f);
  const expected = {...JSON.parse(original), main: path.join(f.root, 'dist/app-worker.mjs'),
    triggers: {crons: ['* * * * *']}, assets: {...BROWSER_ASSETS_CONFIG, directory: path.join(f.root, 'dist/browser-assets')}};
  const generatedPath = path.join(f.root, 'workers/app/.wrangler/runtime.generated.json');
  assert.deepEqual(verified.config, expected);
  assert.equal(verified.generated, true);
  assert.equal(verified.configPath, generatedPath);
  assert.equal(fs.existsSync(generatedPath), false, 'config validation remains read-only');
  assert.equal(deployWorker('app', {...f, build: assetBuilder(f), dryRun: true}), 'OK');
  assert.deepEqual(JSON.parse(fs.readFileSync(generatedPath)), expected);
  assert.equal(fs.readFileSync(path.join(f.root, 'workers/app/wrangler.json'), 'utf8'), original);
  assert.equal(fs.readFileSync(path.join(f.root, 'workers/app/migration.json'), 'utf8'), snapshot);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][1].includes(generatedPath), true);
});

test('App asset deployment cannot invoke Wrangler before the build produces its closed inventory', t => {
  const f = fixture(t); enableAssets(f);
  assert.throws(() => deployWorker('app', {...f, dryRun: true}), {code: 'BROWSER_ASSET_MANIFEST_MISSING'});
  assert.deepEqual(f.built, ['app']);
  assert.equal(f.calls.length, 0);
  assert.equal(fs.existsSync(path.join(f.root, 'workers/app/.wrangler/runtime.generated.json')), false);
});

test('missing, altered or extra public assets block upload after build and before generated config is written', t => {
  for (const change of ['missing', 'altered', 'extra']) {
    const f = fixture(t); enableAssets(f);
    const build = assetBuilder(f, manifest => {
      const file = path.join(f.root, 'dist/browser-assets', ...manifest.assets[0].path.slice(1).split('/'));
      if (change === 'missing') fs.unlinkSync(file);
      else if (change === 'altered') fs.appendFileSync(file, '\n// changed after build');
      else fs.writeFileSync(path.join(f.root, 'dist/browser-assets/unreviewed.json'), '{}');
    });
    assert.throws(() => deployWorker('app', {...f, build, dryRun: true}), {
      code: change === 'altered' ? 'BROWSER_ASSET_BYTES_MISMATCH' : 'BROWSER_ASSET_INVENTORY_MISMATCH',
    });
    assert.deepEqual(f.built, ['app']);
    assert.equal(f.calls.length, 0);
    assert.equal(fs.existsSync(path.join(f.root, 'workers/app/.wrangler/runtime.generated.json')), false);
  }
});

test('assets alone preserve the captured cron and resolve paths independently of generated config location', t => {
  const f = fixture(t); enableAssets(f);
  const verified = validateDeployment('app', f);
  assert.deepEqual(verified.config.triggers.crons, ['*/15 * * * *']);
  assert.equal(verified.config.assets.directory, path.join(f.root, 'dist/browser-assets'));
  assert.equal(verified.config.main, path.join(f.root, 'dist/app-worker.mjs'));
});

test('asset authorization is exact, capture-bound and cannot broaden serving or replace resource bindings', t => {
  const f = fixture(t);
  for (const mutation of [
    value => { value.version = 2; },
    value => { value.captured_config_sha256 = 'c'.repeat(64); },
    value => { value.assets.directory = '../../docs'; },
    value => { value.assets.binding = 'ADMIN_DB'; },
    value => { value.assets.run_worker_first = false; },
    value => { value.assets.run_worker_first = ['/assets/mls/*']; },
    value => { value.assets.not_found_handling = 'single-page-application'; },
    value => { value.assets.html_handling = 'auto-trailing-slash'; },
    value => { value.assets.base_path = '/'; },
    value => { value.assets = null; },
    value => { value.routes = []; },
    value => { delete value.captured_config_sha256; },
  ]) {
    enableAssets(f, 'app', mutation);
    assert.throws(() => deployWorker('app', f), {code: 'WORKER_BROWSER_ASSETS_CONFIG_INVALID'});
  }
  fs.writeFileSync(path.join(f.root, 'workers/app/browser-assets.json'), '{');
  assert.throws(() => deployWorker('app', f), {code: 'WORKER_BROWSER_ASSETS_CONFIG_INVALID'});
  assert.equal(f.built.length, 0);
  assert.equal(f.calls.length, 0);
});

test('asset migration cannot activate on another Worker or collide with existing resource identity', t => {
  const f = fixture(t);
  for (const name of ['auth', 'finance']) {
    enableAssets(f, name);
    assert.throws(() => deployWorker(name, f), {code: 'WORKER_BROWSER_ASSETS_CONFIG_INVALID'});
  }
  for (const field of ['services', 'kv_namespaces', 'r2_buckets', 'd1_databases']) {
    const config = f.config('app');
    config[field] = [...(config[field] || []), {binding: 'ASSETS', database_id: APP_ID}];
    f.save('app', config); enableAssets(f);
    assert.throws(() => deployWorker('app', f), {code: 'WORKER_BINDING_INVALID'});
  }
  assert.equal(f.built.length, 0);
  assert.equal(f.calls.length, 0);
});

test('checked-in browser asset migration preserves all captured routing, storage and privacy settings', () => {
  const verified = validateDeployment('app');
  const original = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'workers/app/wrangler.json')));
  const expected = {...original, main: path.join(PROJECT_ROOT, 'dist/app-worker.mjs'),
    triggers: {crons: ['* * * * *']}, assets: {...BROWSER_ASSETS_CONFIG, directory: path.join(PROJECT_ROOT, 'dist/browser-assets')},
    d1_databases: assertCheckedInDatabases('app', verified.config.d1_databases, original.d1_databases)};
  assert.deepEqual(verified.config, expected);
  assert.equal(verified.config.assets.run_worker_first, true);
  assert.equal(verified.config.assets.html_handling, 'none');
  assert.equal(verified.config.assets.not_found_handling, 'none');
});
