import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {captureWorkerConfig, formatCapturePacket} from '../capture_worker_config.mjs';
import {PROJECT_ROOT, stableJson} from '../worker_project.mjs';

const authSource = readFileSync(path.join(PROJECT_ROOT, 'web/cloudflare/auth-worker.mjs'));
const appSource = readFileSync(path.join(PROJECT_ROOT, 'web/cloudflare/app-worker.mjs'));
const PRIVATE = 'PRIVATE_PROVIDER_VALUE_MUST_NEVER_APPEAR';
const exportFor = target => ({name: 'brazacommerce-' + target, main: 'src/index.js',
  compatibility_date: '2026-09-01', compatibility_flags: [], workers_dev: true, preview_urls: false,
  vars: {PRIVATE_KEY: PRIVATE}, ...(target === 'app' ? {d1_databases: [{binding: 'ADMIN_DB',
    database_id: '12345678-1234-1234-1234-123456789abc'}]} : {})});

function fixture(t) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'braza-capture-test-'));
  t.after(() => rmSync(temporaryRoot, {recursive: true, force: true}));
  return {temporaryRoot};
}

function downloaded(cwd, target, config = exportFor(target), source = target === 'app' ? appSource : authSource) {
  const directory = path.join(cwd, 'brazacommerce-' + target);
  mkdirSync(path.join(directory, 'src'), {recursive: true});
  writeFileSync(path.join(directory, 'wrangler.jsonc'), '// exported fixture\n' + stableJson(config));
  writeFileSync(path.join(directory, 'src/index.js'), source);
  return directory;
}

test('capture runs only pinned native init outside the repo, strips private data and removes the export', async t => {
  const f = fixture(t);
  let calls = 0, cwd;
  const result = await captureWorkerConfig('auth', {...f, run: (command, args, options) => {
    calls++;
    cwd = options.cwd;
    assert.equal(command, process.execPath);
    assert.deepEqual(args, [path.join(PROJECT_ROOT, 'node_modules/wrangler/bin/wrangler.js'),
      'init', '--from-dash', 'brazacommerce-auth', '--yes', '--no-delegate-c3']);
    assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
    assert.equal(options.env.CI, 'true');
    assert.equal(options.env.WRANGLER_SEND_METRICS, 'false');
    assert.equal(options.env.WRANGLER_LOG, 'error');
    assert.equal(cwd.startsWith(PROJECT_ROOT + path.sep), false);
    downloaded(cwd, 'auth');
    return PRIVATE;
  }});
  assert.equal(calls, 1);
  assert.equal(existsSync(cwd), false);
  assert.deepEqual(readdirSync(f.temporaryRoot), []);
  assert.equal(JSON.stringify(result).includes(PRIVATE), false);
  assert.equal(JSON.stringify(result).includes('PRIVATE_KEY'), false);
  assert.equal(result.snapshot.mode, 'existing');
  assert.deepEqual(result.config.services, [{binding: 'SHOPEE_FINANCE_SERVICE', service: 'brazacommerce-finance'}]);
});

test('App capture preserves its real ADMIN_DB metadata', async t => {
  const f = fixture(t);
  const result = await captureWorkerConfig('app', {...f, run: (_command, _args, options) => downloaded(options.cwd, 'app')});
  assert.equal(result.config.d1_databases[0].binding, 'ADMIN_DB');
  assert.equal(result.config.d1_databases[0].database_id, exportFor('app').d1_databases[0].database_id);
  assert.equal(result.config.keep_vars, true);
  assert.deepEqual(readdirSync(f.temporaryRoot), []);
});

test('remote failures never expose provider stdout, stderr or exception text', async t => {
  const f = fixture(t);
  let cwd;
  await assert.rejects(captureWorkerConfig('auth', {...f, run: (_command, _args, options) => {
    cwd = options.cwd;
    downloaded(cwd, 'auth');
    throw Object.assign(new Error(PRIVATE), {stdout: PRIVATE, stderr: PRIVATE, code: PRIVATE});
  }}), failure => failure.code === 'WORKER_CAPTURE_REMOTE_UNAVAILABLE' && !String(failure).includes(PRIVATE));
  assert.equal(existsSync(cwd), false);
  assert.deepEqual(readdirSync(f.temporaryRoot), []);
});

test('missing or duplicate Wrangler config prevents returning a partial snapshot', async t => {
  for (const duplicate of [false, true]) {
    const f = fixture(t);
    await assert.rejects(captureWorkerConfig('auth', {...f, run: (_command, _args, options) => {
      if (duplicate) {
        const directory = downloaded(options.cwd, 'auth');
        writeFileSync(path.join(directory, 'wrangler.json'), stableJson(exportFor('auth')));
      }
    }}), {code: 'WORKER_CAPTURE_CONFIG_COUNT'});
    assert.deepEqual(readdirSync(f.temporaryRoot), []);
  }
});

test('source traversal outside the downloaded project is rejected and removed', async t => {
  const f = fixture(t);
  await assert.rejects(captureWorkerConfig('auth', {...f, run: (_command, _args, options) => {
    downloaded(options.cwd, 'auth', {...exportFor('auth'), main: '../../outside.js'});
  }}), {code: 'WORKER_CAPTURE_PATH_INVALID'});
  assert.deepEqual(readdirSync(f.temporaryRoot), []);
});

test('symlinks cannot redirect source reads to the repository or another export', async t => {
  const f = fixture(t);
  await assert.rejects(captureWorkerConfig('auth', {...f, run: (_command, _args, options) => {
    const directory = downloaded(options.cwd, 'auth');
    rmSync(path.join(directory, 'src/index.js'));
    symlinkSync(path.join(PROJECT_ROOT, 'web/cloudflare/auth-worker.mjs'), path.join(directory, 'src/index.js'));
  }}), {code: 'WORKER_CAPTURE_PATH_INVALID'});
  assert.deepEqual(readdirSync(f.temporaryRoot), []);
});

test('unknown downloaded source returns a fixed error without code or vars', async t => {
  const f = fixture(t);
  await assert.rejects(captureWorkerConfig('auth', {...f, run: (_command, _args, options) =>
    downloaded(options.cwd, 'auth', exportFor('auth'), PRIVATE)}),
  failure => failure.code === 'WORKER_SOURCE_UNRECOGNIZED' && !String(failure).includes(PRIVATE));
  assert.deepEqual(readdirSync(f.temporaryRoot), []);
});

test('missing source and oversized exports produce fixed errors and cleanup', async t => {
  for (const oversized of [false, true]) {
    const f = fixture(t);
    await assert.rejects(captureWorkerConfig('auth', {...f, run: (_command, _args, options) => {
      const directory = downloaded(options.cwd, 'auth');
      if (oversized) writeFileSync(path.join(directory, 'huge.bin'), Buffer.alloc(3 * 1024 * 1024));
      else rmSync(path.join(directory, 'src/index.js'));
    }}), {code: oversized ? 'WORKER_CAPTURE_EXPORT_LIMIT' : 'WORKER_CAPTURE_SOURCE_MISSING'});
    assert.deepEqual(readdirSync(f.temporaryRoot), []);
  }
});

test('temporary exports cannot be created in the Git checkout', async () => {
  let calls = 0;
  await assert.rejects(captureWorkerConfig('auth', {temporaryRoot: PROJECT_ROOT, run: () => calls++}),
    {code: 'WORKER_CAPTURE_TEMP_MUST_BE_EXTERNAL'});
  assert.equal(calls, 0);
});

test('capture packet roundtrips only sanitized config and migration metadata', async t => {
  const f = fixture(t);
  const result = await captureWorkerConfig('auth', {...f, run: (_command, _args, options) => downloaded(options.cwd, 'auth')});
  const packet = formatCapturePacket('auth', result);
  const lines = packet.trim().split('\n');
  assert.equal(lines[0], 'BRAZA_GIT_CONFIG_BEGIN');
  assert.equal(lines[2], 'BRAZA_GIT_CONFIG_END');
  const decoded = Buffer.from(lines[1], 'base64').toString('utf8');
  assert.equal(decoded.includes(PRIVATE), false);
  assert.equal(decoded.includes('PRIVATE_KEY'), false);
  assert.deepEqual(JSON.parse(decoded), {version: 1, target: 'auth', ...result});
  assert.throws(() => formatCapturePacket('auth', {...result, config: {...result.config, vars: {hidden: PRIVATE}}}),
    {code: 'WORKER_CAPTURE_PACKET_INVALID'});
});

test('invalid capture CLI arguments fail before any provider call', () => {
  const result = spawnSync(process.execPath, [path.join(PROJECT_ROOT, 'tools/capture_worker_config.mjs'), 'finance'], {encoding: 'utf8'});
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'WORKER_CAPTURE_TARGET_INVALID\n');
});
