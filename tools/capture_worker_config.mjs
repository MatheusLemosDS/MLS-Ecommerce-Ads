import {execFileSync} from 'node:child_process';
import {mkdtempSync, readdirSync, lstatSync, readFileSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'jsonc-parser';
import {PROJECT_ROOT, TARGETS, stableJson, error} from './worker_project.mjs';
import {importWorkerConfig, MAX_WORKER_SOURCE_BYTES} from './import_worker_config.mjs';

// Preserve the one-MiB allowance for metadata around a bounded source file.
// Process output has its separate original ceiling; it is never Worker source.
const MAX_EXPORT_BYTES = MAX_WORKER_SOURCE_BYTES + 1024 * 1024;
const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;
const fail = code => {throw error(code);};
const inside = (parent, file) => {
  const relative = path.relative(parent, file);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};

function exportedFiles(directory) {
  const configs = [];
  let files = 0, bytes = 0;
  const visit = (current, depth) => {
    if (depth > 8) fail('WORKER_CAPTURE_EXPORT_LIMIT');
    for (const entry of readdirSync(current, {withFileTypes: true})) {
      if (['node_modules', '.git'].includes(entry.name)) continue;
      const file = path.join(current, entry.name);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) fail('WORKER_CAPTURE_PATH_INVALID');
      if (stat.isDirectory()) visit(file, depth + 1);
      else if (stat.isFile()) {
        files++;
        bytes += stat.size;
        if (files > 100 || bytes > MAX_EXPORT_BYTES) fail('WORKER_CAPTURE_EXPORT_LIMIT');
        if (['wrangler.json', 'wrangler.jsonc'].includes(entry.name)) configs.push(file);
      } else fail('WORKER_CAPTURE_PATH_INVALID');
    }
  };
  visit(directory, 0);
  if (configs.length !== 1) fail('WORKER_CAPTURE_CONFIG_COUNT');
  return configs[0];
}

function readCapture(directory) {
  const file = exportedFiles(directory);
  if (lstatSync(file).size > 256 * 1024) fail('WORKER_CAPTURE_EXPORT_LIMIT');
  const errors = [];
  const config = parse(readFileSync(file, 'utf8'), errors, {allowTrailingComma: true, disallowComments: false});
  if (errors.length || !config || typeof config !== 'object' || Array.isArray(config)) fail('WORKER_CAPTURE_CONFIG_INVALID');
  if (typeof config.main !== 'string' || !config.main || config.main.length > 1024
    || /[\x00-\x1f\x7f\\]/.test(config.main) || path.isAbsolute(config.main)) fail('WORKER_CAPTURE_PATH_INVALID');
  const sourceFile = path.resolve(path.dirname(file), config.main);
  if (!inside(directory, sourceFile) || !inside(path.dirname(file), sourceFile)) fail('WORKER_CAPTURE_PATH_INVALID');
  let actual, stat;
  try { actual = realpathSync(sourceFile); stat = lstatSync(sourceFile); }
  catch { fail('WORKER_CAPTURE_SOURCE_MISSING'); }
  if (!inside(directory, actual) || !stat.isFile() || stat.isSymbolicLink()) fail('WORKER_CAPTURE_PATH_INVALID');
  if (!stat.size || stat.size > MAX_WORKER_SOURCE_BYTES) fail('WORKER_CAPTURE_EXPORT_LIMIT');
  return {config, source: readFileSync(sourceFile)};
}

// Downloads only. The native --no-delegate-c3 path avoids C3/package installs,
// project creation and any deploy. Provider output remains private in memory.
export async function captureWorkerConfig(target, {
  root = PROJECT_ROOT, run = execFileSync, temporaryRoot = tmpdir(),
} = {}) {
  if (!['app', 'auth'].includes(target)) fail('WORKER_CAPTURE_TARGET_INVALID');
  if (typeof run !== 'function') fail('WORKER_CAPTURE_CONFIGURATION');
  let directory;
  try {
    const project = realpathSync(root);
    const temporary = realpathSync(temporaryRoot);
    if (temporary === project || inside(project, temporary)) fail('WORKER_CAPTURE_TEMP_MUST_BE_EXTERNAL');
    directory = mkdtempSync(path.join(temporary, 'braza-worker-capture-'));
    try {
      await run(process.execPath, [path.join(project, 'node_modules/wrangler/bin/wrangler.js'),
        'init', '--from-dash', TARGETS[target].name, '--yes', '--no-delegate-c3'], {
        cwd: directory, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES, timeout: 180000,
        env: {...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG: 'error'},
      });
    } catch { fail('WORKER_CAPTURE_REMOTE_UNAVAILABLE'); }
    const {config, source} = readCapture(directory);
    return importWorkerConfig(target, config, source, {root: project});
  } catch (failure) {
    if (typeof failure?.code === 'string' && /^WORKER_[A-Z0-9_]+$/.test(failure.code)) throw failure;
    fail('WORKER_CAPTURE_FAILED');
  } finally {
    if (directory) {
      try { rmSync(directory, {recursive: true, force: true, maxRetries: 2}); }
      catch { fail('WORKER_CAPTURE_CLEANUP_FAILED'); }
    }
  }
}

export function formatCapturePacket(target, result) {
  if (!['app', 'auth'].includes(target) || result?.config?.name !== TARGETS[target].name
    || result?.snapshot?.target !== target || result.snapshot.mode !== 'existing'
    || !result.snapshot.captured_config || ['vars', 'secrets'].some(key =>
      Object.hasOwn(result.config, key) || Object.hasOwn(result.snapshot.captured_config, key))) {
    fail('WORKER_CAPTURE_PACKET_INVALID');
  }
  return 'BRAZA_GIT_CONFIG_BEGIN\n' + Buffer.from(stableJson({version: 1, target,
    config: result.config, snapshot: result.snapshot})).toString('base64') + '\nBRAZA_GIT_CONFIG_END\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) fail('WORKER_CAPTURE_ARGUMENTS');
    const target = process.argv[2];
    process.stdout.write(formatCapturePacket(target, await captureWorkerConfig(target)));
  } catch (failure) {
    process.stderr.write(typeof failure?.code === 'string' && /^WORKER_[A-Z0-9_]+$/.test(failure.code)
      ? failure.code + '\n' : 'WORKER_CAPTURE_FAILED\n');
    process.exitCode = 1;
  }
}
