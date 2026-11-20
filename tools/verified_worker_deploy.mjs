import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {PROJECT_ROOT, TARGETS, stableJson, error} from './worker_project.mjs';
import {buildWorkers} from './build_workers.mjs';
import {deployWorker, validateDeployment} from './worker_deploy.mjs';
import {validateCompleteWorkerModule, COMPLETE_WORKER_SOURCE_MAX_BYTES} from './complete_worker_module.mjs';

const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');

// Read the actual build artifact's manifest after the legacy deployment gates
// and build have finished. A missing, aliased or torn manifest is never approval.
function buildManifest(root) {
  let descriptor;
  try {
    const directory = path.resolve(root, 'dist');
    if (!fs.lstatSync(directory).isDirectory() || fs.realpathSync(directory) !== directory) throw Error();
    const filename = path.join(directory, 'build-manifest.json'), before = fs.lstatSync(filename);
    if (!before.isFile() || before.nlink !== 1 || before.size < 1 || before.size > 16384) throw Error();
    descriptor = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev
      || opened.ino !== before.ino || opened.size !== before.size) throw Error();
    const buffer = Buffer.alloc(opened.size + 1);let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(descriptor, buffer, length, buffer.length - length);
      if (!count) break;
      length += count;
    }
    const after = fs.fstatSync(descriptor);
    if (length !== opened.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs
      || after.ctimeMs !== opened.ctimeMs) throw Error();
    const source = new TextDecoder('utf-8', {fatal: true}).decode(buffer.subarray(0, length));
    const manifest = JSON.parse(source), targets = Object.keys(TARGETS);
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
      || Object.keys(manifest).length < 1 || Object.keys(manifest).length > targets.length
      || Object.keys(manifest).some(target => !targets.includes(target))
      || stableJson(manifest) !== source) throw Error();
    for (const [target, entry] of Object.entries(manifest)) {
      if (!exact(entry, ['worker', 'bytes', 'sha256']) || entry.worker !== TARGETS[target].name
        || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > COMPLETE_WORKER_SOURCE_MAX_BYTES
        || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error();
    }
    return manifest;
  } catch { throw error('WORKER_VERIFIED_BUILD_MANIFEST_INVALID'); }
  finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}

export function deployVerifiedWorker(target, {root = PROJECT_ROOT, run = execFileSync,
  build = buildWorkers, dryRun = false} = {}) {
  if (!Object.hasOwn(TARGETS, target)) throw error('WORKER_TARGET_INVALID');
  if (typeof root !== 'string' || !path.isAbsolute(root) || typeof run !== 'function'
    || typeof build !== 'function' || typeof dryRun !== 'boolean') throw error('WORKER_VERIFIED_DEPLOY_OPTIONS_INVALID');
  // Delegate every production-context, profile, DB, asset, build and subsequent
  // revalidation check to the frozen deployer. Only its final process changes.
  return deployWorker(target, {root, build, dryRun, run: (command, args, options) => {
    const expectedLength = dryRun ? 5 : 4;
    if (command !== process.execPath || !Array.isArray(args) || args.length !== expectedLength
      || args[0] !== path.join(root, 'node_modules/wrangler/bin/wrangler.js')
      || args[1] !== 'deploy' || args[2] !== '--config' || typeof args[3] !== 'string'
      || dryRun && args[4] !== '--dry-run' || options?.cwd !== root) throw error('WORKER_VERIFIED_DEPLOY_COMMAND_INVALID');
    const proof = validateCompleteWorkerModule(path.join(root, 'dist', target + '-worker.mjs'));
    const entry = buildManifest(root)[target];
    if (!entry || entry.bytes !== proof.bytes || entry.sha256 !== proof.sha256) {
      throw error('WORKER_VERIFIED_BUILD_SOURCE_MISMATCH');
    }
    // The generated module already contains frozen browser factories. A second
    // bundle changes those bytes; send exactly the verified complete module.
    return run(command, [...args, '--no-bundle'], options);
  }});
}

export function runVerifiedWorkerCommand(args, {root = PROJECT_ROOT, run = execFileSync,
  build = buildWorkers, log = console.log} = {}) {
  if (!Array.isArray(args) || args.some(value => typeof value !== 'string')) throw error('WORKER_COMMAND_INVALID');
  if (args[0] === 'check' && args.length <= 2) {
    const target = args[1] ?? 'all';
    const names = target === 'all' ? Object.keys(TARGETS) : [target];
    for (const name of names) {
      const verified = validateDeployment(name, {root});
      const crons = verified.config.triggers?.crons || [];
      log(TARGETS[name].name + ': CONFIG_VALIDATED cron=' + (crons.join(',') || 'none'));
    }
    return;
  }
  if (args[0] === 'deploy' && (args.length === 2 || args.length === 3 && args[2] === '--dry-run')) {
    return deployVerifiedWorker(args[1], {root, run, build, dryRun: args[2] === '--dry-run'});
  }
  throw error('WORKER_COMMAND_INVALID');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(PROJECT_ROOT, 'tools/verified_worker_deploy.mjs')) {
  try { runVerifiedWorkerCommand(process.argv.slice(2)); }
  catch (failure) {
    console.error(failure?.code || 'WORKER_VERIFIED_DEPLOY_FAILED');
    process.exitCode = 1;
  }
}
