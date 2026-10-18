import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PROJECT_ROOT, TARGETS, sha256, stableJson, error} from './worker_project.mjs';
import {validateCapturedConfig} from './import_worker_config.mjs';

// Consumes only the sanitized configuration packet emitted by the read-only
// Cloudflare build. Nothing in the packet is executed or sent over the network.
export function applyWorkerCapture(text, {root = PROJECT_ROOT, replace = false} = {}) {
  if (typeof text !== 'string' || text.length > 256 * 1024) throw error('WORKER_CAPTURE_INVALID');
  const match = text.match(/^BRAZA_GIT_CONFIG_BEGIN\s*\n([A-Za-z0-9+/=\r\n]+)\nBRAZA_GIT_CONFIG_END\s*$/);
  if (!match) throw error('WORKER_CAPTURE_INVALID');
  let packet;
  try {
    const encoded = match[1].replace(/\s/g, '');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.toString('base64') !== encoded) throw error('WORKER_CAPTURE_INVALID');
    packet = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  } catch { throw error('WORKER_CAPTURE_INVALID'); }
  const {version, target, config, snapshot} = packet || {};
  if (version !== 1 || !['app', 'auth'].includes(target)
    || Object.keys(packet).sort().join(',') !== 'config,snapshot,target,version') throw error('WORKER_CAPTURE_INVALID');
  validateCapturedConfig(target, config);
  if (!snapshot || Object.keys(snapshot).sort().join(',') !== 'captured_config,config_sha256,mode,recognized_source_sha256,source_sha256,target,version,worker_name'
    || snapshot.version !== 1 || snapshot.target !== target || snapshot.worker_name !== TARGETS[target].name
    || snapshot.mode !== 'existing' || !/^[0-9a-f]{64}$/.test(snapshot.source_sha256 || '')
    || !TARGETS[target].baselineHashes.includes(snapshot.recognized_source_sha256)
    || snapshot.config_sha256 !== sha256(stableJson(config))
    || snapshot.config_sha256 !== sha256(stableJson(snapshot.captured_config))) throw error('WORKER_CAPTURE_SNAPSHOT_MISMATCH');
  const directory = path.join(root, 'workers', target);
  const files = [['wrangler.json', config], ['migration.json', snapshot]];
  for (const [name, value] of files) {
    const destination = path.join(directory, name);
    if (!replace && fs.existsSync(destination) && fs.readFileSync(destination, 'utf8') !== stableJson(value)) {
      throw error('WORKER_IMPORT_REPLACE_REQUIRED');
    }
  }
  fs.mkdirSync(directory, {recursive: true});
  for (const [name, value] of files) fs.writeFileSync(path.join(directory, name), stableJson(value));
  return {target, worker: TARGETS[target].name};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [input, flag] = process.argv.slice(2);
    if (!input || (flag && flag !== '--replace') || process.argv.length > 4) throw error('WORKER_CAPTURE_ARGUMENTS');
    const result = applyWorkerCapture(fs.readFileSync(input, 'utf8'), {replace: flag === '--replace'});
    console.log('WORKER_CAPTURE_APPLIED ' + result.target);
  } catch (failure) { console.error(/^WORKER_[A-Z0-9_]+$/.test(failure?.code || '') ? failure.code : 'WORKER_CAPTURE_FAILED'); process.exitCode = 1; }
}
