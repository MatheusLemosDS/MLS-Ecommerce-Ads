import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {PROJECT_ROOT, TARGETS, stableJson, sha256, error, uuid} from './worker_project.mjs';
import {buildWorkers} from './build_workers.mjs';
import {verifyBrowserAssets} from './browser_assets.mjs';
import {validateBrowserAssetsConfig} from './import_worker_config.mjs';

function read(root, target, filename) {
  try {
    const file = path.join(root, 'workers', target, filename);
    if (fs.statSync(file).size > 256 * 1024) throw error('WORKER_CONFIG_INVALID');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { throw error('WORKER_MIGRATION_CONFIG_REQUIRED'); }
}

// The captured config remains immutable. This small, hash-bound authorization
// permits only the App collection interval to evolve after migration.
function automationConfig(root, target, config, snapshot) {
  const file = path.join(root, 'workers', target, 'automation.json');
  let automation;
  try {
    if (fs.statSync(file).size > 256 * 1024) throw error('WORKER_AUTOMATION_CONFIG_INVALID');
    automation = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (failure) {
    if (failure?.code === 'ENOENT') return null;
    throw error('WORKER_AUTOMATION_CONFIG_INVALID');
  }
  if (target !== 'app' || !automation || Array.isArray(automation)
    || Object.keys(automation).sort().join(',') !== 'captured_config_sha256,cron,version'
    || automation.version !== 1 || automation.cron !== '* * * * *'
    || automation.captured_config_sha256 !== snapshot.config_sha256) {
    throw error('WORKER_AUTOMATION_CONFIG_INVALID');
  }
  return {...config,
    main: path.resolve(root, 'workers', target, config.main),
    triggers: {...config.triggers, crons: [automation.cron]},
  };
}

function browserAssetsConfig(root, target, config, snapshot) {
  const file = path.join(root, 'workers', target, 'browser-assets.json');
  let authorization;
  try {
    if (fs.statSync(file).size > 16 * 1024) throw error('WORKER_BROWSER_ASSETS_CONFIG_INVALID');
    authorization = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (failure) {
    if (failure?.code === 'ENOENT') return null;
    throw error('WORKER_BROWSER_ASSETS_CONFIG_INVALID');
  }
  if (target !== 'app' || !authorization || Array.isArray(authorization)
    || Object.keys(authorization).sort().join(',') !== 'assets,captured_config_sha256,version'
    || authorization.version !== 1 || authorization.captured_config_sha256 !== snapshot.config_sha256) {
    throw error('WORKER_BROWSER_ASSETS_CONFIG_INVALID');
  }
  validateBrowserAssetsConfig(target, authorization.assets, config);
  return {...config, main: path.resolve(root, 'workers', target, config.main),
    assets: {...authorization.assets,
      directory: path.resolve(root, 'workers', target, authorization.assets.directory)},
  };
}

// Validate the immutable captures before applying any reviewed, additive
// authorization. In particular Finance keeps exactly one legacy FINANCE_DB;
// the shared account database is never included in that isolation comparison.
function capturedDeployment(target, {root = PROJECT_ROOT, dependencies = true} = {}) {
  if (!Object.hasOwn(TARGETS, target)) throw error('WORKER_TARGET_INVALID');
  const expected = TARGETS[target];
  const config = read(root, target, 'wrangler.json');
  const snapshot = read(root, target, 'migration.json');
  if (snapshot.version !== 1 || snapshot.target !== target || snapshot.worker_name !== expected.name
    || snapshot.config_sha256 !== sha256(stableJson(config))
    || snapshot.config_sha256 !== sha256(stableJson(snapshot.captured_config))) {
    throw error('WORKER_MIGRATION_SNAPSHOT_MISMATCH');
  }
  if (target !== 'finance' && (snapshot.mode !== 'existing'
    || !expected.baselineHashes.includes(snapshot.recognized_source_sha256))) {
    throw error('WORKER_PUBLISHED_SOURCE_UNRECOGNIZED');
  }
  if (target === 'finance' && snapshot.mode !== 'new') throw error('WORKER_FINANCE_PROFILE_INVALID');
  if (config.name !== expected.name || config.main !== expected.main || config.keep_vars !== true
    || Object.hasOwn(config, 'vars') || Object.hasOwn(config, 'env')
    || !/^\d{4}-\d{2}-\d{2}$/.test(config.compatibility_date || '')
    || (config.account_id !== undefined && !/^[0-9a-f]{32}$/i.test(config.account_id))) {
    throw error('WORKER_CONFIG_INVALID');
  }
  if (Object.hasOwn(config, 'assets')) validateBrowserAssetsConfig(target, config.assets, config);
  if (['app', 'finance'].includes(target)) {
    const binding = target === 'app' ? 'ADMIN_DB' : 'FINANCE_DB';
    const matches = config.d1_databases?.filter(value => value.binding === binding);
    if (matches?.length !== 1 || !uuid(matches[0].database_id)) throw error('WORKER_DATABASE_ID_REQUIRED');
  }
  for (const database of config.d1_databases || []) {
    if (!uuid(database.database_id)) throw error('WORKER_DATABASE_ID_REQUIRED');
  }
  if (target === 'auth') {
    const matches = config.services?.filter(value => value.binding === 'SHOPEE_FINANCE_SERVICE');
    if (matches?.length !== 1 || matches[0].service !== TARGETS.finance.name
      || matches[0].environment || matches[0].entrypoint) throw error('WORKER_FINANCE_SERVICE_REQUIRED');
  }
  if (target === 'finance') {
    if (config.workers_dev !== false || config.preview_urls !== false || config.routes?.length
      || config.route || config.triggers?.crons?.length || config.services?.length
      || config.d1_databases.length !== 1) throw error('WORKER_FINANCE_MUST_BE_PRIVATE');
    if (dependencies) {
      const app = capturedDeployment('app', {root, dependencies: false}).config;
      const adminIds = new Set(app.d1_databases.map(value => value.database_id.toLowerCase()));
      if (adminIds.has(config.d1_databases[0].database_id.toLowerCase())) throw error('WORKER_FINANCE_DATABASE_MUST_BE_SEPARATE');
    }
  }
  const automated = automationConfig(root, target, config, snapshot);
  const browserAssets = browserAssetsConfig(root, target, automated || config, snapshot);
  const effective = browserAssets || automated;
  return {target, config: effective || config, captured: config, snapshot, generated: Boolean(effective),
    configPath: path.join(root, 'workers', target,
      ...(effective ? ['.wrangler', browserAssets ? 'runtime.generated.json' : 'automation.generated.json'] : ['wrangler.json']))};
}

const COMMERCIAL_ACCOUNT_CONFIG = 'commercial-account.json';
const COMMERCIAL_ACCOUNT_CONFIG_ERROR = 'WORKER_COMMERCIAL_ACCOUNT_CONFIG_INVALID';
const COMMERCIAL_ACCOUNT_TARGETS = Object.freeze(['app', 'auth', 'finance']);
const deploymentAuthorizations = new WeakMap();

function accountAuthorization(root, target) {
  const directory = path.resolve(root, 'workers', target);
  const file = path.join(directory, COMMERCIAL_ACCOUNT_CONFIG);
  let descriptor, exists = false;
  try {
    // An authorization must be a local regular file, not an alias to another
    // target or to a mutable external configuration. Open once, then read that
    // descriptor so a path replacement cannot mix its size and its contents.
    const metadata = fs.lstatSync(file);
    exists = true;
    if (!metadata.isFile() || metadata.nlink !== 1
      || fs.realpathSync(directory) !== directory) throw error(COMMERCIAL_ACCOUNT_CONFIG_ERROR);
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || opened.size > 4096
      || opened.dev !== metadata.dev || opened.ino !== metadata.ino) throw error(COMMERCIAL_ACCOUNT_CONFIG_ERROR);
    const buffer = Buffer.alloc(4097);let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(descriptor, buffer, length, buffer.length - length, length);
      if (!count) break;
      length += count;
    }
    const bytes = buffer.subarray(0, length);
    const after = fs.fstatSync(descriptor);
    if (bytes.length > 4096 || after.size !== bytes.length
      || opened.size !== after.size || opened.mtimeMs !== after.mtimeMs
      || opened.ctimeMs !== after.ctimeMs) throw error(COMMERCIAL_ACCOUNT_CONFIG_ERROR);
    const source = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    const parsed = JSON.parse(source);
    // The authorization is deliberately flat. Repeated JSON member names
    // cannot hide an earlier value from the human reviewing this sidecar.
    if ([...source.matchAll(/"(?:[^"\\]|\\.)*"\s*:/gs)].length !== 3) throw error(COMMERCIAL_ACCOUNT_CONFIG_ERROR);
    return parsed;
  } catch (failure) {
    if (failure?.code === 'ENOENT' && !exists) return undefined;
    throw error(COMMERCIAL_ACCOUNT_CONFIG_ERROR);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function accountBindingCollision(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, entry]) =>
    key.trim().toUpperCase() === 'ACCOUNT_DB'
    || ['binding', 'name'].includes(key) && typeof entry === 'string'
      && entry.trim().toUpperCase() === 'ACCOUNT_DB'
    || accountBindingCollision(entry));
}

function commercialAccountConfig(root, target, verified) {
  const names = COMMERCIAL_ACCOUNT_TARGETS;
  const authorizations = names.map(name => accountAuthorization(root, name));
  if (authorizations.every(value => value === undefined)) return null;
  if (!names.includes(target) || authorizations.some(value => value === undefined)) throw error(COMMERCIAL_ACCOUNT_CONFIG_ERROR);
  const captures = names.map(name => name === target ? verified : capturedDeployment(name, {root}));
  let accountId;
  const legacyIds = new Set();
  for (let index = 0; index < names.length; index++) {
    const authorization = authorizations[index], capture = captures[index];
    if (!authorization || Array.isArray(authorization)
      || Object.keys(authorization).sort().join(',') !== 'account_database_id,captured_config_sha256,version'
      || authorization.version !== 1 || !uuid(authorization.account_database_id)
      || authorization.account_database_id === '00000000-0000-0000-0000-000000000000'
      || !/^[0-9a-f]{64}$/.test(authorization.captured_config_sha256 ?? '')
      || authorization.captured_config_sha256 !== capture.snapshot.config_sha256
      || accountBindingCollision(capture.config)) throw error(COMMERCIAL_ACCOUNT_CONFIG_ERROR);
    const id = authorization.account_database_id.toLowerCase();
    if (accountId !== undefined && accountId !== id) throw error(COMMERCIAL_ACCOUNT_CONFIG_ERROR);
    accountId = id;
    for (const database of capture.captured.d1_databases || []) legacyIds.add(database.database_id.toLowerCase());
  }
  if (legacyIds.has(accountId)) throw error('WORKER_COMMERCIAL_ACCOUNT_DATABASE_MUST_BE_SEPARATE');
  const config = verified.config;
  const effective = {...config,
    main: path.resolve(root, 'workers', target, config.main),
    ...(config.assets ? {assets: {...config.assets,
      directory: path.resolve(root, 'workers', target, config.assets.directory)}} : {}),
    d1_databases: [...(config.d1_databases || []), {binding: 'ACCOUNT_DB', database_id: accountId}],
  };
  return {config: effective, fingerprint: sha256(stableJson({authorizations,
    captures: captures.map(capture => ({target: capture.target, captured: capture.captured,
      snapshot: capture.snapshot, effective: capture.config}))}))};
}

export function validateDeployment(target, {root = PROJECT_ROOT, dependencies = true} = {}) {
  const verified = capturedDeployment(target, {root, dependencies});
  const accountConfig = commercialAccountConfig(root, target, verified);
  const result = {target, config: accountConfig?.config || verified.config, generated: Boolean(accountConfig) || verified.generated,
    configPath: accountConfig
      ? path.join(root, 'workers', target, '.wrangler', 'runtime.generated.json')
      : verified.configPath};
  deploymentAuthorizations.set(result, accountConfig?.fingerprint ?? null);
  return result;
}

function writeGeneratedDeployment(verified) {
  const directory = path.resolve(path.dirname(verified.configPath));
  fs.mkdirSync(directory, {recursive: true});
  if (!fs.lstatSync(directory).isDirectory() || fs.realpathSync(directory) !== directory) throw error('WORKER_GENERATED_CONFIG_INVALID');
  try {
    const previous = fs.lstatSync(verified.configPath);
    if (!previous.isFile() || previous.nlink !== 1) throw error('WORKER_GENERATED_CONFIG_INVALID');
  } catch (failure) {
    if (failure?.code !== 'ENOENT') throw failure;
  }
  const temporary = path.join(directory, '.deployment-' + randomUUID() + '.json');
  try {
    fs.writeFileSync(temporary, stableJson(verified.config), {flag: 'wx', mode: 0o600});
    fs.renameSync(temporary, verified.configPath);
  } finally {
    try { fs.unlinkSync(temporary); } catch (failure) { if (failure?.code !== 'ENOENT') throw failure; }
  }
}

export function deployWorker(target, {root = PROJECT_ROOT, run = execFileSync, build = buildWorkers, dryRun = false} = {}) {
  const verified = validateDeployment(target, {root});
  if (target === 'auth') validateDeployment('finance', {root});
  build(target, {root});
  // A build is allowed to emit artifacts, never to replace the reviewed
  // deployment authorization or any captured domain, resource or schedule.
  const afterBuild = validateDeployment(target, {root});
  if (stableJson(afterBuild) !== stableJson(verified)
    || deploymentAuthorizations.get(afterBuild) !== deploymentAuthorizations.get(verified)) throw error('WORKER_DEPLOYMENT_CONFIG_CHANGED');
  if (target === 'auth') validateDeployment('finance', {root});
  if(target==='app'&&verified.config.assets)verifyBrowserAssets(root);
  if (verified.generated) {
    writeGeneratedDeployment(verified);
  }
  const wrangler = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
  return run(process.execPath, [wrangler, 'deploy', '--config', verified.configPath,
    ...(dryRun ? ['--dry-run'] : [])], {cwd: root, stdio: 'inherit',
    env: {...process.env, WRANGLER_SEND_METRICS: 'false'}});
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(PROJECT_ROOT, 'tools/worker_deploy.mjs')) {
  try {
    const [mode, target = 'all', flag] = process.argv.slice(2);
    if (mode === 'check') {
      const names = target === 'all' ? Object.keys(TARGETS) : [target];
      for (const name of names) {
        const verified = validateDeployment(name);
        const crons = verified.config.triggers?.crons || [];
        console.log(TARGETS[name].name + ': CONFIG_VALIDATED cron=' + (crons.join(',') || 'none'));
      }
    } else if (mode === 'deploy' && (!flag || flag === '--dry-run')) {
      deployWorker(target, {dryRun: flag === '--dry-run'});
    } else throw error('WORKER_COMMAND_INVALID');
  } catch (failure) {
    console.error(failure?.code || 'WORKER_DEPLOY_FAILED');
    if (failure?.code === 'WORKER_MIGRATION_CONFIG_REQUIRED') {
      console.error('Importe a configuração real antes de habilitar os deploys. Consulte docs/PUBLICACAO_PELO_GIT.md.');
    }
    process.exitCode = 1;
  }
}
