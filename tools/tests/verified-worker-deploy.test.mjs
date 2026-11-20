import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {deployVerifiedWorker, runVerifiedWorkerCommand} from '../verified_worker_deploy.mjs';
import {PROJECT_ROOT, TARGETS, stableJson, sha256} from '../worker_project.mjs';
import {MAX_WORKER_SOURCE_BYTES, BROWSER_ASSETS_CONFIG} from '../import_worker_config.mjs';
import {buildBrowserAssets, EMPTY_BROWSER_ASSET_PUBLICATION} from '../browser_assets.mjs';

const FROZEN_DEPLOY_SHA256 = '3d68df3c8c64d3b3fcd5f4246fc3f760a2880c7ddb3868df0ccddc965ebdfb32';
const source = 'export const named=1;export default {fetch(){return new Response("verified");}};\n';
const ids = {app: '11111111-1111-4111-8111-111111111111',
  finance: '22222222-2222-4222-8222-222222222222', account: '33333333-3333-4333-8333-333333333333'};

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mls-verified-deploy-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const file = (target, name) => path.join(root, 'workers', target, name);
  const config = target => ({name: TARGETS[target].name, main: TARGETS[target].main,
    compatibility_date: '2026-10-12', keep_vars: true,
    ...(target === 'app' ? {d1_databases: [{binding: 'ADMIN_DB', database_id: ids.app}],
      routes: [{pattern: 'app.fixture.invalid', custom_domain: true}], triggers: {crons: ['*/15 * * * *']}} : {}),
    ...(target === 'auth' ? {services: [{binding: 'SHOPEE_FINANCE_SERVICE', service: TARGETS.finance.name}]} : {}),
    ...(target === 'finance' ? {workers_dev: false, preview_urls: false,
      d1_databases: [{binding: 'FINANCE_DB', database_id: ids.finance}]} : {})});
  const save = (target, value) => {
    fs.mkdirSync(path.dirname(file(target, 'wrangler.json')), {recursive: true});
    const snapshot = {version: 1, target, worker_name: TARGETS[target].name,
      mode: target === 'finance' ? 'new' : 'existing',
      recognized_source_sha256: target === 'finance' ? null : TARGETS[target].baselineHashes[0],
      config_sha256: sha256(stableJson(value)), captured_config: value};
    fs.writeFileSync(file(target, 'wrangler.json'), stableJson(value));
    fs.writeFileSync(file(target, 'migration.json'), stableJson(snapshot));
  };
  for (const target of Object.keys(TARGETS)) save(target, config(target));
  const artifact = target => path.join(root, 'dist', target + '-worker.mjs');
  const manifestFile = path.join(root, 'dist/build-manifest.json');
  const built = [], calls = [];
  const writeManifest = (target, bytes = fs.readFileSync(artifact(target))) => {
    fs.writeFileSync(manifestFile, stableJson({[target]: {worker: TARGETS[target].name,
      bytes: bytes.length, sha256: sha256(bytes)}}));
  };
  const build = target => {
    built.push(target);fs.mkdirSync(path.join(root, 'dist'), {recursive: true});
    fs.writeFileSync(artifact(target), source);writeManifest(target);
  };
  const run = (...args) => {calls.push(args);return 'SYNTHETIC_NO_UPLOAD';};
  return {root, file, config, save, artifact, manifestFile, built, calls, build, writeManifest, run};
}
const options = f => ({root: f.root, build: f.build, run: f.run});

test('the complete-module wrapper retains the exact frozen deployment guard and production-context call', () => {
  const bytes = fs.readFileSync(path.join(PROJECT_ROOT, 'tools/worker_deploy.mjs'));
  assert.equal(sha256(bytes), FROZEN_DEPLOY_SHA256);
  assert.match(bytes.toString(), /assertProductionDeploymentContext\(target,root\);/);
  const wrapper = fs.readFileSync(path.join(PROJECT_ROOT, 'tools/verified_worker_deploy.mjs'), 'utf8');
  assert.match(wrapper, /import \{deployWorker, validateDeployment\} from '\.\/worker_deploy\.mjs'/);
  assert.match(wrapper, /return deployWorker\(target, \{root, build, dryRun, run:/);
  assert.equal(MAX_WORKER_SOURCE_BYTES, 4194304);
});

for (const target of ['app', 'auth', 'finance']) for (const dryRun of [false, true]) {
  test(`delegation preserves the legacy ${target} argv/profile and appends only no-bundle (dry=${dryRun})`, t => {
    const f = fixture(t), captures = Object.keys(TARGETS).flatMap(name =>
      ['wrangler.json', 'migration.json'].map(filename => [f.file(name, filename), fs.readFileSync(f.file(name, filename))]));
    assert.equal(deployVerifiedWorker(target, {...options(f), dryRun}), 'SYNTHETIC_NO_UPLOAD');
    assert.deepEqual(f.built, [target]);assert.equal(f.calls.length, 1);
    const [command, args, processOptions] = f.calls[0];
    assert.equal(command, process.execPath);
    assert.deepEqual(args, [path.join(f.root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy',
      '--config', f.file(target, 'wrangler.json'), ...(dryRun ? ['--dry-run'] : []), '--no-bundle']);
    assert.equal(processOptions.cwd, f.root);assert.equal(processOptions.stdio, 'inherit');
    assert.equal(processOptions.env.WRANGLER_SEND_METRICS, 'false');
    assert.equal(fs.readFileSync(f.artifact(target), 'utf8'), source, 'validation never rewrites a browser factory or module');
    for (const [filename, bytes] of captures) assert.deepEqual(fs.readFileSync(filename), bytes);
  });
}

test('check delegates only to legacy configuration validation and does not need/build a source or manifest', t => {
  const f = fixture(t), lines = [];
  runVerifiedWorkerCommand(['check'], {...options(f), log: line => lines.push(line)});
  assert.equal(lines.length, 3);assert.deepEqual(f.built, []);assert.deepEqual(f.calls, []);
  assert.equal(fs.existsSync(path.join(f.root, 'dist')), false);
  const changed = f.config('finance');changed.workers_dev = true;f.save('finance', changed);
  assert.throws(() => runVerifiedWorkerCommand(['check', 'finance'], {...options(f), log() {}}), {code: 'WORKER_FINANCE_MUST_BE_PRIVATE'});
});

test('unknown commands, targets and extra flags never reach build or Wrangler', t => {
  const f = fixture(t);
  for (const args of [[], ['deploy'], ['deploy', 'all'], ['deploy', 'unknown'], ['deploy', 'app', '--no-bundle'],
    ['deploy', 'app', '--dry-run', '--name', 'other'], ['check', 'app', '--dry-run'], ['check', '__proto__'],
    ['deploy', 'app', '--config=other.json'], ['preview', 'app']]) {
    assert.throws(() => runVerifiedWorkerCommand(args, options(f)), failure =>
      ['WORKER_COMMAND_INVALID', 'WORKER_TARGET_INVALID'].includes(failure.code));
  }
  assert.throws(() => deployVerifiedWorker('app', {...options(f), dryRun: 'true'}), {code: 'WORKER_VERIFIED_DEPLOY_OPTIONS_INVALID'});
  assert.deepEqual(f.built, []);assert.deepEqual(f.calls, []);
});

test('preview CLI is refused by the existing guard before build, upload or native credential lookup', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'previews/isolated-builds.json')));
  const before = fs.readFileSync(path.join(PROJECT_ROOT, 'dist/build-manifest.json'));
  const result = spawnSync(process.execPath, ['tools/verified_worker_deploy.mjs', 'deploy', 'app', '--dry-run'], {
    cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 10000,
    env: {...process.env, WORKERS_CI: '1', WORKERS_CI_BRANCH: manifest.authorized_branches[0],
      WRANGLER_CI_MATCH_TAG: manifest.parents.app.tag, CLOUDFLARE_API_TOKEN: 'SYNTHETIC_NEVER_READ_BY_LOOKUP'},
  });
  assert.equal(result.status, 1);assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim(), 'WORKER_PREVIEW_PRODUCTION_DEPLOY_REFUSED');
  assert.ok(!result.stderr.includes('SYNTHETIC_NEVER_READ_BY_LOOKUP'));
  assert.deepEqual(fs.readFileSync(path.join(PROJECT_ROOT, 'dist/build-manifest.json')), before);
});

test('captured profile tampering and shared Finance databases remain rejected before build', t => {
  for (const target of ['app', 'finance']) {
    const f = fixture(t), config = f.config(target);
    if (target === 'app') config.main = TARGETS.auth.main;
    else config.d1_databases[0].database_id = ids.app;
    f.save(target, config);
    assert.throws(() => deployVerifiedWorker(target, options(f)));
    assert.deepEqual(f.built, []);assert.deepEqual(f.calls, []);
  }
});

test('the inherited post-build configuration revalidation runs before complete-source packaging', t => {
  const f = fixture(t);
  assert.throws(() => deployVerifiedWorker('app', {...options(f), build: target => {
    f.build(target);const config = f.config(target);config.routes[0].pattern = 'changed.fixture.invalid';f.save(target, config);
  }}), {code: 'WORKER_DEPLOYMENT_CONFIG_CHANGED'});
  assert.deepEqual(f.built, ['app']);assert.deepEqual(f.calls, []);
});

test('the inherited asset inventory check rejects an extra public file before invoking Wrangler', t => {
  const f = fixture(t), config = f.config('app');
  fs.writeFileSync(f.file('app', 'browser-assets.json'), stableJson({version: 1,
    captured_config_sha256: sha256(stableJson(config)), assets: {...BROWSER_ASSETS_CONFIG}}));
  assert.throws(() => deployVerifiedWorker('app', {...options(f), build: target => {
    f.build(target);fs.mkdirSync(path.join(f.root, 'web/cloudflare/src'), {recursive: true});
    fs.writeFileSync(f.file('app', 'browser-assets-published.json'), stableJson(EMPTY_BROWSER_ASSET_PUBLICATION));
    buildBrowserAssets({schema: 'mls_browser_assets_build_v1', entries: [{id: 'bank',
      export_name: 'BANK_RECONCILIATION_CLIENT', source: 'const BANK_RECONCILIATION_CLIENT="globalThis.bankReady=true;";'}]}, {root: f.root});
    fs.writeFileSync(path.join(f.root, 'dist/browser-assets/unreviewed.js'), 'unreviewed');
  }}));
  assert.deepEqual(f.calls, []);
});

test('invalid complete ESM, source links and the original size cap block the last process despite a matching manifest', t => {
  const sources = ['export default {fetch(){return require("hidden")}};',
    'import value from "./hidden.mjs";export default value;', 'export const missingDefault=1;',
    Buffer.alloc(MAX_WORKER_SOURCE_BYTES + 1, 32)];
  for (const value of sources) {
    const f = fixture(t);
    assert.throws(() => deployVerifiedWorker('finance', {...options(f), build: target => {
      f.build(target);fs.writeFileSync(f.artifact(target), value);f.writeManifest(target);
    }}), failure => ['WORKER_COMPLETE_MODULE_INVALID', 'WORKER_COMPLETE_MODULE_DEPENDENCY'].includes(failure.code));
    assert.deepEqual(f.calls, []);
  }
  const f = fixture(t);
  assert.throws(() => deployVerifiedWorker('finance', {...options(f), build: target => {
    f.build(target);const alias = path.join(f.root, 'alias.mjs');fs.renameSync(f.artifact(target), alias);fs.symlinkSync(alias, f.artifact(target));
  }}), {code: 'WORKER_COMPLETE_MODULE_INVALID'});
  assert.deepEqual(f.calls, []);
});

test('missing, aliased, malformed and mismatching actual build manifests block Wrangler', t => {
  for (const mutation of [
    f => fs.unlinkSync(f.manifestFile),
    f => {const other = path.join(f.root, 'manifest.json');fs.renameSync(f.manifestFile, other);fs.symlinkSync(other, f.manifestFile);},
    f => fs.writeFileSync(f.manifestFile, '{invalid'),
    f => {const manifest = JSON.parse(fs.readFileSync(f.manifestFile));manifest.finance.sha256 = '0'.repeat(64);fs.writeFileSync(f.manifestFile, stableJson(manifest));},
    f => {const manifest = JSON.parse(fs.readFileSync(f.manifestFile));manifest.finance.bytes++;fs.writeFileSync(f.manifestFile, stableJson(manifest));},
    f => fs.appendFileSync(f.artifact('finance'), '\n// different build artifact\n'),
    f => fs.writeFileSync(f.manifestFile, stableJson({auth: {worker: TARGETS.auth.name, bytes: source.length, sha256: sha256(source)}})),
  ]) {
    const f = fixture(t);
    assert.throws(() => deployVerifiedWorker('finance', {...options(f), build: target => {f.build(target);mutation(f);}}), failure =>
      ['WORKER_VERIFIED_BUILD_MANIFEST_INVALID', 'WORKER_VERIFIED_BUILD_SOURCE_MISMATCH'].includes(failure.code));
    assert.deepEqual(f.calls, []);
  }
});

test('hard-linked source/manifest and an aliased dist directory cannot replace the actual single-file artifacts', t => {
  for (const kind of ['source', 'manifest', 'directory']) {
    const f = fixture(t);
    assert.throws(() => deployVerifiedWorker('finance', {...options(f), build: target => {
      f.build(target);
      if (kind === 'directory') {
        const original = path.join(f.root, 'dist'), alias = path.join(f.root, 'artifact-alias');
        fs.renameSync(original, alias);fs.symlinkSync(alias, original, 'dir');
      } else {
        const filename = kind === 'source' ? f.artifact(target) : f.manifestFile;
        fs.linkSync(filename, path.join(f.root, 'second-link'));
      }
    }}), failure => ['WORKER_COMPLETE_MODULE_INVALID', 'WORKER_VERIFIED_BUILD_MANIFEST_INVALID'].includes(failure.code));
    assert.deepEqual(f.calls, []);
  }
});

test('package scripts redirect only explicit deploy entrypoints while legacy validation and dependencies remain unchanged', () => {
  const value = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json')));
  for (const target of ['app', 'auth', 'finance']) {
    assert.equal(value.scripts['deploy:' + target], 'node tools/verified_worker_deploy.mjs deploy ' + target);
  }
  assert.equal(value.scripts['validate:deploy'], 'node tools/worker_deploy.mjs check');
  assert.equal(value.devDependencies.wrangler, '4.153.0');
  assert.deepEqual(value.overrides, {miniflare: {undici: '7.30.2'}});
});
