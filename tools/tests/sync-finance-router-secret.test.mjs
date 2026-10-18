import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {syncFinanceRouterSecret} from '../sync_finance_router_secret.mjs';
import {PROJECT_ROOT, TARGETS} from '../worker_project.mjs';

const PRIVATE = 'PRIVATE_CHILD_ERROR_OR_LOG_MUST_NOT_ESCAPE';
const REQUIRED = ['FINANCE_TOKEN_ENCRYPTION_KEY', 'SHOPEE_FINANCE_PARTNER_KEY'];
const metadata = names => JSON.stringify(names.map(name => ({name, type: 'secret_text'})));

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'braza-router-sync-test-'));
  const root = path.join(directory, 'project');
  const temporaryRoot = path.join(directory, 'private');
  fs.mkdirSync(temporaryRoot);
  for (const target of Object.keys(TARGETS)) {
    fs.mkdirSync(path.join(root, 'workers', target), {recursive: true});
    for (const file of ['wrangler.json', 'migration.json']) {
      fs.copyFileSync(path.join(PROJECT_ROOT, 'workers', target, file), path.join(root, 'workers', target, file));
    }
  }
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const calls = [];
  const randomness = [];
  const writes = [];
  const random = count => {
    assert.equal(count, 32);
    const buffer = Buffer.alloc(count, 0xab);
    randomness.push(buffer);
    return buffer;
  };
  const defaultRun = (command, args, options) => {
    const target = args[args.indexOf('--name') + 1].replace('brazacommerce-', '');
    if (args[2] === 'list') {
      const written = writes.some(write => write.target === target);
      return metadata([...(target === 'finance' ? REQUIRED : []), ...(written ? ['FINANCE_ROUTER_SECRET'] : [])]);
    }
    assert.equal(args[2], 'bulk');
    assert.equal(Buffer.isBuffer(options.input), true);
    writes.push({target, body: JSON.parse(options.input.toString('utf8'))});
    return PRIVATE;
  };
  let handler = defaultRun;
  const run = (command, args, options) => {
    calls.push({command, args, options});
    return handler(command, args, options);
  };
  const setRun = value => { handler = value; };
  return {directory, root, temporaryRoot, calls, randomness, writes, random, run, defaultRun, setRun};
}

function safeFailure(code) {
  return failure => {
    assert.equal(failure.code, 'FINANCE_ROUTER_SYNC_' + code);
    assert.equal(String(failure).includes(PRIVATE), false);
    assert.equal(JSON.stringify(failure).includes(PRIVATE), false);
    return true;
  };
}

function privateFailure() {
  return Object.assign(new Error(PRIVATE), {stdout: PRIVATE, stderr: PRIVATE, code: PRIVATE});
}

function cleaned(f) {
  assert.deepEqual(fs.readdirSync(f.temporaryRoot), []);
  for (const buffer of f.randomness) assert.equal(buffer.every(byte => byte === 0), true);
  for (const {options} of f.calls) {
    if (Buffer.isBuffer(options.input)) assert.equal(options.input.every(byte => byte === 0), true);
    if (options.env.WRANGLER_LOG_PATH) assert.equal(fs.existsSync(options.env.WRANGLER_LOG_PATH), false);
  }
}

test('one fresh secret is written only to Finance and Auth using pinned Wrangler with private output', async t => {
  const f = fixture(t);
  const privateLogs = [];
  f.setRun((command, args, options) => {
    assert.equal(command, process.execPath);
    assert.equal(args[0], path.join(f.root, 'node_modules/wrangler/bin/wrangler.js'));
    const target = args[args.indexOf('--name') + 1].replace('brazacommerce-', '');
    assert.ok(['finance', 'auth'].includes(target));
    assert.deepEqual(args, [args[0], 'secret', args[2], ...(args[2] === 'list' ? ['--format', 'json'] : []),
      '--name', TARGETS[target].name, '--config', path.join(f.root, 'workers', target, 'wrangler.json')]);
    assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
    assert.equal(options.env.CI, 'true');
    assert.equal(options.env.WRANGLER_SEND_METRICS, 'false');
    assert.equal(options.env.WRANGLER_LOG, 'log');
    assert.equal(options.env.WRANGLER_LOG_SANITIZE, 'true');
    assert.ok(Number.isFinite(options.timeout) && options.timeout > 0);
    const logPath = options.env.WRANGLER_LOG_PATH;
    assert.ok(path.isAbsolute(logPath));
    assert.ok(logPath.startsWith(f.temporaryRoot + path.sep));
    assert.equal(logPath.startsWith(f.root + path.sep), false);
    fs.mkdirSync(path.dirname(logPath), {recursive: true});
    fs.appendFileSync(logPath, PRIVATE);
    privateLogs.push(logPath);
    assert.equal(JSON.stringify(args).includes('ab'.repeat(32)), false);
    assert.equal(JSON.stringify(options.env).includes('ab'.repeat(32)), false);
    return f.defaultRun(command, args, options);
  });
  const result = await syncFinanceRouterSecret(f);
  assert.deepEqual(result, {status: 'SYNCED'});
  assert.deepEqual(f.calls.map(({args}) => [args[2], args[args.indexOf('--name') + 1]]), [
    ['list', 'brazacommerce-finance'], ['list', 'brazacommerce-auth'],
    ['bulk', 'brazacommerce-finance'], ['bulk', 'brazacommerce-auth'],
    ['list', 'brazacommerce-finance'], ['list', 'brazacommerce-auth'],
  ]);
  assert.equal(f.randomness.length, 1);
  assert.deepEqual(f.writes, [
    {target: 'finance', body: {FINANCE_ROUTER_SECRET: 'ab'.repeat(32)}},
    {target: 'auth', body: {FINANCE_ROUTER_SECRET: 'ab'.repeat(32)}},
  ]);
  assert.equal(privateLogs.length, 6);
  cleaned(f);
});

test('already existing router secrets are replaced without deleting or writing other keys', async t => {
  const f = fixture(t);
  f.setRun((command, args, options) => args[2] === 'list'
    ? metadata([...REQUIRED, 'FINANCE_ROUTER_SECRET', 'UNRELATED_SECRET'])
    : f.defaultRun(command, args, options));
  assert.deepEqual(await syncFinanceRouterSecret(f), {status: 'SYNCED'});
  assert.equal(f.writes.length, 2);
  assert.deepEqual(f.writes.map(write => Object.keys(write.body)), [['FINANCE_ROUTER_SECRET'], ['FINANCE_ROUTER_SECRET']]);
  assert.equal(f.calls.some(({args}) => args.includes('delete') || args.includes('deploy')), false);
  cleaned(f);
});

test('invalid Auth or Finance migration configuration blocks every provider call and random generation', async t => {
  for (const target of ['auth', 'finance']) {
    const f = fixture(t);
    fs.unlinkSync(path.join(f.root, 'workers', target, 'migration.json'));
    await assert.rejects(syncFinanceRouterSecret(f), safeFailure('CONFIG_INVALID'));
    assert.equal(f.calls.length, 0);
    assert.equal(f.randomness.length, 0);
    cleaned(f);
  }
});

test('temporary storage inside the repository is rejected before any provider call', async t => {
  const f = fixture(t);
  await assert.rejects(syncFinanceRouterSecret({...f, temporaryRoot: f.root}), safeFailure('TEMP_INVALID'));
  assert.equal(f.calls.length, 0);
  assert.equal(f.randomness.length, 0);
  cleaned(f);
});

test('a failed Finance or Auth preflight never starts the secret rotation and discards child details', async t => {
  for (const target of ['finance', 'auth']) {
    const f = fixture(t);
    f.setRun((command, args, options) => {
      if (args.includes('brazacommerce-' + target)) throw privateFailure();
      return f.defaultRun(command, args, options);
    });
    await assert.rejects(syncFinanceRouterSecret(f), safeFailure(target.toUpperCase() + '_READ_FAILED'));
    assert.equal(f.calls.length, target === 'finance' ? 1 : 2);
    assert.equal(f.writes.length, 0);
    assert.equal(f.randomness.length, 0);
    cleaned(f);
  }
});

test('unparseable or unsupported secret list metadata is rejected without writing or generating a secret', async t => {
  for (const target of ['finance', 'auth']) {
    for (const value of [PRIVATE, '{}', '[{"name":"FINANCE_ROUTER_SECRET"}]', '[null]']) {
      const f = fixture(t);
      f.setRun((command, args, options) => args.includes('brazacommerce-' + target) ? value : f.defaultRun(command, args, options));
      await assert.rejects(syncFinanceRouterSecret(f), safeFailure(target.toUpperCase() + '_METADATA_INVALID'));
      assert.equal(f.writes.length, 0);
      assert.equal(f.randomness.length, 0);
      cleaned(f);
    }
  }
});

test('missing Finance credentials block both mutations before generation even when the router secret exists', async t => {
  for (const missing of REQUIRED) {
    const f = fixture(t);
    f.setRun((command, args, options) => args.includes('brazacommerce-finance')
      ? metadata([...REQUIRED.filter(name => name !== missing), 'FINANCE_ROUTER_SECRET'])
      : f.defaultRun(command, args, options));
    await assert.rejects(syncFinanceRouterSecret(f), safeFailure('FINANCE_CREDENTIALS_MISSING'));
    assert.equal(f.writes.length, 0);
    assert.equal(f.randomness.length, 0);
    cleaned(f);
  }
});

test('random generation failures never reach either write or disclose exception details', async t => {
  const f = fixture(t);
  await assert.rejects(syncFinanceRouterSecret({...f, random: () => { throw privateFailure(); }}), safeFailure('RANDOM_FAILED'));
  assert.equal(f.calls.length, 2);
  assert.equal(f.writes.length, 0);
  cleaned(f);
});

test('Finance write failure stops before the Auth write and clears private material', async t => {
  const f = fixture(t);
  f.setRun((command, args, options) => {
    if (args[2] === 'bulk') throw privateFailure();
    return f.defaultRun(command, args, options);
  });
  await assert.rejects(syncFinanceRouterSecret(f), safeFailure('FINANCE_WRITE_FAILED'));
  assert.equal(f.calls.length, 3);
  assert.equal(f.randomness.length, 1);
  assert.equal(f.calls.filter(({args}) => args[2] === 'bulk' && args.includes('brazacommerce-auth')).length, 0);
  cleaned(f);
});

test('Finance write diagnoses require recognized messages and never disclose child details or continue to Auth', async t => {
  const cases = [
    ["Binding name 'FINANCE_ROUTER_SECRET' already in use " + PRIVATE, 'FINANCE_BINDING_CONFLICT'],
    ["Secret edit failed. You attempted to modify a secret, but the latest version of your Worker isn't currently deployed. " + PRIVATE,
      'FINANCE_VERSION_NOT_DEPLOYED'],
    ['[code: 10053] ' + PRIVATE, 'FINANCE_WRITE_FAILED'],
  ];
  for (const [stderr, expected] of cases) {
    const f = fixture(t);
    f.setRun((command, args, options) => {
      if (args[2] === 'bulk') throw Object.assign(privateFailure(), {stderr});
      return f.defaultRun(command, args, options);
    });
    await assert.rejects(syncFinanceRouterSecret(f), safeFailure(expected));
    assert.equal(f.calls.length, 3);
    assert.equal(f.calls.filter(({args}) => args[2] === 'bulk' && args.includes('brazacommerce-auth')).length, 0);
    assert.equal(f.randomness.length, 1);
    cleaned(f);
  }
});

test('Auth write failure returns only the fixed safe error with no automatic retry', async t => {
  const f = fixture(t);
  f.setRun((command, args, options) => {
    if (args[2] === 'bulk' && args.includes('brazacommerce-auth')) throw privateFailure();
    return f.defaultRun(command, args, options);
  });
  await assert.rejects(syncFinanceRouterSecret(f), safeFailure('AUTH_WRITE_FAILED'));
  assert.equal(f.calls.length, 4);
  assert.equal(f.writes.length, 1);
  assert.equal(f.randomness.length, 1);
  cleaned(f);
});

test('a missing router secret in either postcheck prevents a success response', async t => {
  for (const target of ['finance', 'auth']) {
    const f = fixture(t);
    f.setRun((command, args, options) => {
      if (args[2] === 'list' && args.includes('brazacommerce-' + target) && f.writes.length === 2) {
        return metadata(target === 'finance' ? REQUIRED : []);
      }
      return f.defaultRun(command, args, options);
    });
    await assert.rejects(syncFinanceRouterSecret(f), safeFailure(target.toUpperCase() + '_VERIFY_FAILED'));
    assert.equal(f.writes.length, 2);
    assert.equal(f.randomness.length, 1);
    assert.equal(f.calls.length, target === 'finance' ? 5 : 6);
    cleaned(f);
  }
});

test('router entries of another secret type cannot satisfy the text-secret postcheck', async t => {
  const f = fixture(t);
  f.setRun((command, args, options) => {
    if (args[2] === 'list' && args.includes('brazacommerce-finance') && f.writes.length === 2) {
      return JSON.stringify([...REQUIRED.map(name => ({name, type: 'secret_text'})), {name: 'FINANCE_ROUTER_SECRET', type: 'secret_key'}]);
    }
    return f.defaultRun(command, args, options);
  });
  await assert.rejects(syncFinanceRouterSecret(f), safeFailure('FINANCE_VERIFY_FAILED'));
  assert.equal(f.writes.length, 2);
  cleaned(f);
});
