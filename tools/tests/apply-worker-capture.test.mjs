import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {applyWorkerCapture} from '../apply_worker_config_capture.mjs';
import {importWorkerConfig} from '../import_worker_config.mjs';
import {PROJECT_ROOT} from '../worker_project.mjs';
import {validateDeployment} from '../worker_deploy.mjs';

const encode = packet => 'BRAZA_GIT_CONFIG_BEGIN\n' + Buffer.from(JSON.stringify(packet)).toString('base64') + '\nBRAZA_GIT_CONFIG_END\n';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'braza-capture-apply-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const source = fs.readFileSync(path.join(PROJECT_ROOT, 'web/cloudflare/auth-worker.mjs'));
  const result = importWorkerConfig('auth', {name: 'brazacommerce-auth', compatibility_date: '2026-10-12',
    routes: [{pattern: 'auth.brazacommerce.com.br', custom_domain: true}],
    vars: {PRIVATE: 'fixture-private-value'}}, source);
  return {root, packet: {version: 1, target: 'auth', ...result}};
}

test('sanitized build capture becomes validated Git config without private variables and repeats idempotently', t => {
  const f = fixture(t);
  assert.equal(encode(f.packet).includes('fixture-private-value'), false);
  assert.deepEqual(applyWorkerCapture(encode(f.packet), f), {target: 'auth', worker: 'brazacommerce-auth'});
  applyWorkerCapture(encode(f.packet), f);
  assert.equal(validateDeployment('auth', {...f, dependencies: false}).config.services[0].service, 'brazacommerce-finance');
  assert.ok(!fs.readFileSync(path.join(f.root, 'workers/auth/wrangler.json'), 'utf8').includes('PRIVATE'));
});

test('malformed, unsupported, altered and wrong-profile packets never write files', t => {
  for (const mutate of [
    packet => { packet.target = '../app'; },
    packet => { packet.snapshot.recognized_source_sha256 = '0'.repeat(64); },
    packet => { packet.config.routes = []; },
    packet => { packet.config.vars = {PRIVATE: 'fixture-private-value'}; },
    packet => { packet.config.assets = {directory: '/tmp'}; },
    packet => { packet.snapshot.private_token = 'fixture-private-value'; },
    packet => { packet.private_token = 'fixture-private-value'; },
  ]) {
    const f = fixture(t); mutate(f.packet);
    assert.throws(() => applyWorkerCapture(encode(f.packet), f));
    assert.equal(fs.existsSync(path.join(f.root, 'workers')), false);
  }
  const f = fixture(t);
  for (const invalid of ['', '{}', 'BRAZA_GIT_CONFIG_BEGIN\n%%\nBRAZA_GIT_CONFIG_END', 'x'.repeat(262145)]) {
    assert.throws(() => applyWorkerCapture(invalid, f), {code: 'WORKER_CAPTURE_INVALID'});
  }
});

test('a changed local config requires explicit replacement', t => {
  const f = fixture(t); applyWorkerCapture(encode(f.packet), f);
  const file = path.join(f.root, 'workers/auth/wrangler.json'); fs.writeFileSync(file, '{}');
  assert.throws(() => applyWorkerCapture(encode(f.packet), f), {code: 'WORKER_IMPORT_REPLACE_REQUIRED'});
  applyWorkerCapture(encode(f.packet), {...f, replace: true});
  assert.equal(JSON.parse(fs.readFileSync(file)).name, 'brazacommerce-auth');
});
