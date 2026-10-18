import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {PROJECT_ROOT, TARGETS, sha256, stableJson, error} from './worker_project.mjs';

export function buildWorkers(target = 'all', {root = PROJECT_ROOT, run = execFileSync} = {}) {
  if (target !== 'all' && !Object.hasOwn(TARGETS, target)) throw error('WORKER_TARGET_INVALID');
  const targets = target === 'all' ? Object.keys(TARGETS) : [target];
  const execute = script => run('python3', ['-B', script], {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
  execute('web/cloudflare/build.py');
  if (targets.some(name => name !== 'app')) execute('tools/build_finance_live_delivery.py');
  const outputs = {
    app: 'web/cloudflare/app-worker.mjs',
    auth: 'docs/finance-connection-delivery/auth-worker.mjs',
    finance: 'docs/finance-connection-delivery/finance-worker.mjs',
  };
  fs.mkdirSync(path.join(root, 'dist'), {recursive: true});
  const manifest = {};
  for (const name of targets) {
    const source = fs.readFileSync(path.join(root, outputs[name]));
    fs.writeFileSync(path.join(root, 'dist', name + '-worker.mjs'), source);
    manifest[name] = {worker: TARGETS[name].name, bytes: source.length, sha256: sha256(source)};
  }
  fs.writeFileSync(path.join(root, 'dist', 'build-manifest.json'), stableJson(manifest));
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(PROJECT_ROOT, 'tools/build_workers.mjs')) {
  try { console.log(stableJson(buildWorkers(process.argv[2] || 'all')).trim()); }
  catch (failure) { console.error(failure?.code || 'WORKER_BUILD_FAILED'); process.exitCode = 1; }
}
