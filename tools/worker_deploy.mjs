import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {PROJECT_ROOT, TARGETS, stableJson, sha256, error, uuid} from './worker_project.mjs';
import {buildWorkers} from './build_workers.mjs';

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

export function validateDeployment(target, {root = PROJECT_ROOT, dependencies = true} = {}) {
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
      const app = validateDeployment('app', {root, dependencies: false}).config;
      const adminIds = new Set(app.d1_databases.map(value => value.database_id.toLowerCase()));
      if (adminIds.has(config.d1_databases[0].database_id.toLowerCase())) throw error('WORKER_FINANCE_DATABASE_MUST_BE_SEPARATE');
    }
  }
  const effective = automationConfig(root, target, config, snapshot);
  return {target, config: effective || config, generated: Boolean(effective),
    configPath: path.join(root, 'workers', target,
      ...(effective ? ['.wrangler', 'automation.generated.json'] : ['wrangler.json']))};
}

export function deployWorker(target, {root = PROJECT_ROOT, run = execFileSync, build = buildWorkers, dryRun = false} = {}) {
  const verified = validateDeployment(target, {root});
  if (target === 'auth') validateDeployment('finance', {root});
  build(target, {root});
  if (verified.generated) {
    fs.mkdirSync(path.dirname(verified.configPath), {recursive: true});
    fs.writeFileSync(verified.configPath, stableJson(verified.config));
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
