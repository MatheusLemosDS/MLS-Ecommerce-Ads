import {readFileSync, existsSync, mkdirSync, writeFileSync, renameSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'jsonc-parser';
import {PROJECT_ROOT, TARGETS, sha256, stableJson, error} from './worker_project.mjs';

// The reviewed App bundle now exceeds two MiB. This is only an import-file
// ceiling: strict UTF-8 and the exact reviewed-source hash remain mandatory.
export const MAX_WORKER_SOURCE_BYTES = 4 * 1024 * 1024;

const ALLOWED = new Set(['name', 'main', 'account_id', 'compatibility_date', 'compatibility_flags',
  'workers_dev', 'preview_urls', 'routes', 'route', 'triggers', 'd1_databases', 'kv_namespaces',
  'r2_buckets', 'services', 'placement', 'limits', 'observability', 'logpush', 'tail_consumers',
  'keep_vars', '$schema', 'vars', 'secrets']);
const OMIT = new Set(['main', 'keep_vars', '$schema', 'vars', 'secrets']);
const ARRAY_FIELDS = ['compatibility_flags', 'd1_databases', 'kv_namespaces', 'r2_buckets', 'services', 'tail_consumers'];
const OBJECT_FIELDS = ['triggers', 'placement', 'limits', 'observability'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const own = (value, key) => Object.hasOwn(value, key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 1024 && !/[\x00-\x1f\x7f]/.test(value);
const databaseId = value => typeof value === 'string' && UUID.test(value) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value);
const fail = code => {throw error(code);};

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    fail('WORKER_CONFIG_INVALID');
  }
}

function readExport(file) {
  let source;
  try { source = readFileSync(file, 'utf8'); } catch { fail('WORKER_EXPORT_UNREADABLE'); }
  const errors = [];
  const value = parse(source, errors, {allowTrailingComma: true, disallowComments: false});
  if (errors.length || !plain(value)) fail('WORKER_EXPORT_INVALID');
  return value;
}

function validateConfig(config, target) {
  if (config.name !== TARGETS[target].name || config.main !== TARGETS[target].main || config.keep_vars !== true) {
    fail('WORKER_CONFIG_IDENTITY');
  }
  if (typeof config.compatibility_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(config.compatibility_date)
    || Number.isNaN(Date.parse(config.compatibility_date + 'T00:00:00Z'))
    || new Date(config.compatibility_date + 'T00:00:00Z').toISOString().slice(0, 10) !== config.compatibility_date) {
    fail('WORKER_COMPATIBILITY_REQUIRED');
  }
  for (const field of ARRAY_FIELDS) {
    if (own(config, field) && !Array.isArray(config[field])) fail('WORKER_CONFIG_INVALID');
  }
  for (const field of OBJECT_FIELDS) {
    if (own(config, field) && !plain(config[field])) fail('WORKER_CONFIG_INVALID');
  }
  for (const field of ['workers_dev', 'preview_urls', 'logpush']) {
    if (own(config, field) && typeof config[field] !== 'boolean') fail('WORKER_CONFIG_INVALID');
  }
  if (own(config, 'account_id') && (typeof config.account_id !== 'string' || !/^[a-f0-9]{32}$/i.test(config.account_id))) {
    fail('WORKER_ACCOUNT_INVALID');
  }
  if (own(config, 'compatibility_flags') && !config.compatibility_flags.every(text)) fail('WORKER_CONFIG_INVALID');
  if (own(config, 'route') && own(config, 'routes')) fail('WORKER_ROUTES_AMBIGUOUS');
  for (const field of ['route', 'routes']) {
    if (!own(config, field)) continue;
    const routes = field === 'routes' ? config.routes : [config.route];
    if (!Array.isArray(routes) || !routes.every(route => text(route) || (plain(route) && text(route.pattern)))) {
      fail('WORKER_ROUTES_INVALID');
    }
  }
  if (config.triggers && (!Array.isArray(config.triggers.crons) || !config.triggers.crons.every(text)
    || Object.keys(config.triggers).some(key => key !== 'crons'))) fail('WORKER_CRONS_INVALID');
  const bindingNames = new Set();
  for (const field of ['d1_databases', 'kv_namespaces', 'r2_buckets', 'services']) {
    for (const item of config[field] || []) {
      if (!plain(item) || typeof item.binding !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(item.binding)
        || bindingNames.has(item.binding)) fail('WORKER_BINDING_INVALID');
      bindingNames.add(item.binding);
      if (field === 'd1_databases' && (!databaseId(item.database_id)
        || (own(item, 'preview_database_id') && !databaseId(item.preview_database_id)))) fail('WORKER_D1_ID_REQUIRED');
      if (field === 'kv_namespaces' && (typeof item.id !== 'string' || !/^[0-9a-f]{32}$/i.test(item.id))) fail('WORKER_KV_ID_REQUIRED');
      if (field === 'r2_buckets' && !text(item.bucket_name)) fail('WORKER_R2_BUCKET_REQUIRED');
      if (field === 'services' && !text(item.service)) fail('WORKER_SERVICE_REQUIRED');
    }
  }
  if (target === 'app' && !(config.d1_databases || []).some(item => item.binding === 'ADMIN_DB')) {
    fail('WORKER_ADMIN_DB_REQUIRED');
  }
}

function snapshotFor(target, config, mode, rawHash = null, recognizedHash = null) {
  return {version: 1, target, worker_name: TARGETS[target].name, mode,
    source_sha256: rawHash, recognized_source_sha256: recognizedHash,
    config_sha256: sha256(Buffer.from(stableJson(config))), captured_config: cloneJson(config)};
}

export function validateCapturedConfig(target, config) {
  if (!own(TARGETS, target) || !plain(config)
    || Object.keys(config).some(key => !ALLOWED.has(key) || ['vars', 'secrets', '$schema'].includes(key))) {
    fail('WORKER_CONFIG_UNSUPPORTED');
  }
  validateConfig(config, target);
}

// No files are written here. vars/secrets are intentionally absent from both
// results; the existing values stay in Cloudflare through keep_vars and Wrangler.
export function importWorkerConfig(target, exportConfig, source, {root = PROJECT_ROOT} = {}) {
  void root;
  if (!own(TARGETS, target)) fail('WORKER_TARGET_INVALID');
  if (!plain(exportConfig) || Object.keys(exportConfig).some(key => !ALLOWED.has(key))) fail('WORKER_CONFIG_UNSUPPORTED');
  if (exportConfig.name !== TARGETS[target].name) fail('WORKER_CONFIG_IDENTITY');
  let raw, normalized;
  try {
    if (typeof source !== 'string' && !Buffer.isBuffer(source) && !(source instanceof Uint8Array)) fail('WORKER_SOURCE_INVALID');
    raw = Buffer.from(source);
    if (!raw.length || raw.length > MAX_WORKER_SOURCE_BYTES) fail('WORKER_SOURCE_INVALID');
    normalized = Buffer.from(new TextDecoder('utf-8', {fatal: true}).decode(raw).replace(/\r\n/g, '\n'));
  } catch { fail('WORKER_SOURCE_INVALID'); }
  const recognizedHash = sha256(normalized);
  if (!TARGETS[target].baselineHashes.includes(recognizedHash)) fail('WORKER_SOURCE_UNRECOGNIZED');
  const config = {};
  for (const key of Object.keys(exportConfig)) {
    if (!OMIT.has(key)) config[key] = cloneJson(exportConfig[key]);
  }
  config.main = TARGETS[target].main;
  config.keep_vars = true;
  if (target === 'auth') {
    const services = config.services || [];
    if (!Array.isArray(services)) fail('WORKER_CONFIG_INVALID');
    const existing = services.filter(item => item?.binding === 'SHOPEE_FINANCE_SERVICE');
    if (existing.length > 1 || existing.some(item => item.service !== TARGETS.finance.name
      || own(item, 'environment') || own(item, 'entrypoint'))) fail('WORKER_FINANCE_SERVICE_CONFLICT');
    if (!existing.length) config.services = [...services, {binding: 'SHOPEE_FINANCE_SERVICE', service: TARGETS.finance.name}];
  }
  validateConfig(config, target);
  return {config, snapshot: snapshotFor(target, config, 'existing', sha256(raw), recognizedHash)};
}

export function createFinanceConfig({databaseId: id, databaseName, accountId} = {}, {root = PROJECT_ROOT} = {}) {
  if (!databaseId(id)) fail('WORKER_D1_ID_REQUIRED');
  if (typeof databaseName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(databaseName)) fail('WORKER_D1_NAME_INVALID');
  const appConfigFile = resolve(root, 'workers/app/wrangler.json');
  if (existsSync(appConfigFile)) {
    let app;
    try { app = JSON.parse(readFileSync(appConfigFile, 'utf8')); } catch { fail('WORKER_APP_CONFIG_UNREADABLE'); }
    if ((app.d1_databases || []).some(item => item?.database_id?.toLowerCase() === id.toLowerCase())) {
      fail('WORKER_FINANCE_DB_MUST_BE_PRIVATE');
    }
  }
  const config = {name: TARGETS.finance.name, main: TARGETS.finance.main,
    compatibility_date: '2026-10-12', workers_dev: false, preview_urls: false, keep_vars: true,
    d1_databases: [{binding: 'FINANCE_DB', database_name: databaseName, database_id: id}]};
  if (accountId !== undefined) config.account_id = accountId;
  validateConfig(config, 'finance');
  return {config, snapshot: snapshotFor('finance', config, 'new')};
}

function writeImported(target, result, root, replace) {
  const directory = resolve(root, 'workers', target);
  const entries = [['wrangler.json', result.config], ['migration.json', result.snapshot]];
  for (const [name, value] of entries) {
    const path = resolve(directory, name);
    if (existsSync(path) && !replace) {
      let previous;
      try { previous = JSON.parse(readFileSync(path, 'utf8')); } catch { fail('WORKER_IMPORT_REPLACE_REQUIRED'); }
      if (stableJson(previous) !== stableJson(value)) fail('WORKER_IMPORT_REPLACE_REQUIRED');
    }
  }
  mkdirSync(directory, {recursive: true});
  for (const [name, value] of entries) {
    const path = resolve(directory, name);
    const temporary = path + '.import-' + process.pid;
    writeFileSync(temporary, stableJson(value), {mode: 0o600});
    renameSync(temporary, path);
  }
}

function cli(argv) {
  const args = [...argv];
  const replace = args.includes('--replace');
  if (replace) args.splice(args.indexOf('--replace'), 1);
  if (args.includes('--replace')) fail('WORKER_IMPORT_ARGUMENTS');
  const target = args.shift();
  let result;
  if (target === 'finance' && args[0] === '--new-d1') {
    const flags = {};
    while (args.length) {
      const key = args.shift(), value = args.shift();
      if (!['--new-d1', '--database-name', '--account-id'].includes(key) || !value || own(flags, key)) fail('WORKER_IMPORT_ARGUMENTS');
      flags[key] = value;
    }
    result = createFinanceConfig({databaseId: flags['--new-d1'], databaseName: flags['--database-name'], accountId: flags['--account-id']});
  } else {
    if (!own(TARGETS, target) || args.length !== 2) fail('WORKER_IMPORT_ARGUMENTS');
    const exportConfig = readExport(resolve(args[0]));
    let source;
    try { source = readFileSync(resolve(args[1])); } catch { fail('WORKER_SOURCE_UNREADABLE'); }
    result = importWorkerConfig(target, exportConfig, source);
  }
  writeImported(target, result, PROJECT_ROOT, replace);
  process.stdout.write('WORKER_CONFIG_IMPORTED ' + target + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { cli(process.argv.slice(2)); }
  catch (failure) {
    const code = typeof failure?.code === 'string' && /^WORKER_[A-Z0-9_]+$/.test(failure.code) ? failure.code : 'WORKER_IMPORT_FAILED';
    process.stderr.write(code + '\n');
    process.exitCode = 1;
  }
}
