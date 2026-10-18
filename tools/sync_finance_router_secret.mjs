import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtempSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PROJECT_ROOT, TARGETS, error} from './worker_project.mjs';
import {validateDeployment} from './worker_deploy.mjs';

const PREFIX = 'FINANCE_ROUTER_SYNC_';
const fail = suffix => {throw error(PREFIX + suffix);};
const inside = (parent, file) => {
  const relative = path.relative(parent, file);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};

// Child details are private. Only these fixed diagnoses can reach the build log.
function writeFailure(target, failure) {
  const details = String(failure?.stderr || '').slice(0, 128 * 1024);
  const name = target.toUpperCase();
  if (/binding[^\r\n]{0,200}already in use/i.test(details)) fail(name + '_BINDING_CONFLICT');
  if (/\[code:\s*1021[45]\]|latest version[^\r\n]{0,100}(?:not|isn't) currently deployed/i.test(details)) {
    fail(name + '_VERSION_NOT_DEPLOYED');
  }
  fail(name + '_WRITE_FAILED');
}

function secretNames(output, target) {
  try {
    const text = Buffer.isBuffer(output) ? output.toString('utf8') : output;
    if (typeof text !== 'string' || text.length > 128 * 1024) throw new Error();
    const values = JSON.parse(text);
    if (!Array.isArray(values) || values.length > 1000 || values.some(value =>
      !value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== 'name,type'
      || typeof value.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,255}$/.test(value.name)
      || !['secret_text', 'secret_key'].includes(value.type))) throw new Error();
    return new Set(values.filter(value => value.type === 'secret_text').map(value => value.name));
  } catch { fail(target.toUpperCase() + '_METADATA_INVALID'); }
}

// Explicit one-off repair, not part of build/deploy. Generates one shared value
// and supplies it only via private stdin to two singleton secret updates.
// Other secrets, code, bindings and databases are not submitted by this helper.
export async function syncFinanceRouterSecret({
  root = PROJECT_ROOT, run = execFileSync, random = randomBytes, temporaryRoot = tmpdir(),
} = {}) {
  if (typeof run !== 'function' || typeof random !== 'function') fail('INVALID_OPTIONS');
  let project, verified;
  try {
    project = realpathSync(root);
    verified = {
      auth: validateDeployment('auth', {root: project}),
      finance: validateDeployment('finance', {root: project}),
    };
    if ((verified.auth.config.account_id ?? null) !== (verified.finance.config.account_id ?? null)) throw new Error();
  } catch { fail('CONFIG_INVALID'); }
  let temporary;
  try { temporary = realpathSync(temporaryRoot); } catch { fail('TEMP_INVALID'); }
  if (temporary === project || inside(project, temporary)) fail('TEMP_INVALID');
  let directory, bytes, payload;
  try {
    directory = mkdtempSync(path.join(temporary, 'braza-router-sync-'));
    const wrangler = path.join(project, 'node_modules/wrangler/bin/wrangler.js');
    const invoke = (target, operation, input) => run(process.execPath, [wrangler, 'secret', operation,
      ...(operation === 'list' ? ['--format', 'json'] : []),
      '--name', TARGETS[target].name, '--config', verified[target].configPath], {
      cwd: project, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8',
      ...(input ? {input} : {}), timeout: 120000, maxBuffer: 512 * 1024,
      env: {...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false',
        WRANGLER_LOG: 'log', WRANGLER_LOG_SANITIZE: 'true',
        WRANGLER_LOG_PATH: path.join(directory, 'wrangler.log')},
    });
    const list = async target => {
      let output;
      try { output = await invoke(target, 'list'); }
      catch { fail(target.toUpperCase() + '_READ_FAILED'); }
      return secretNames(output, target);
    };
    // Both exact existing Workers must be readable before any secret is changed.
    const finance = await list('finance');
    await list('auth');
    if (!finance.has('FINANCE_TOKEN_ENCRYPTION_KEY') || !finance.has('SHOPEE_FINANCE_PARTNER_KEY')) {
      fail('FINANCE_CREDENTIALS_MISSING');
    }
    try {
      bytes = random(32);
      if (!Buffer.isBuffer(bytes) || bytes.length !== 32) fail('RANDOM_FAILED');
      payload = Buffer.from(JSON.stringify({FINANCE_ROUTER_SECRET: bytes.toString('hex')}) + '\n');
    } catch { fail('RANDOM_FAILED'); }
    for (const target of ['finance', 'auth']) {
      try { await invoke(target, 'bulk', payload); }
      catch (failure) { writeFailure(target, failure); }
    }
    for (const target of ['finance', 'auth']) {
      if (!(await list(target)).has('FINANCE_ROUTER_SECRET')) fail(target.toUpperCase() + '_VERIFY_FAILED');
    }
    return {status: 'SYNCED'};
  } catch (failure) {
    if (typeof failure?.code === 'string' && /^FINANCE_ROUTER_SYNC_[A-Z_]+$/.test(failure.code)) throw failure;
    fail('FAILED');
  } finally {
    if (Buffer.isBuffer(payload)) payload.fill(0);
    if (Buffer.isBuffer(bytes)) bytes.fill(0);
    if (directory) {
      try { rmSync(directory, {recursive: true, force: true, maxRetries: 2}); }
      catch { fail('CLEANUP_FAILED'); }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) fail('INVALID_OPTIONS');
    await syncFinanceRouterSecret();
    console.log('FINANCE_ROUTER_SYNCED');
  } catch (failure) {
    console.error(/^FINANCE_ROUTER_SYNC_[A-Z_]+$/.test(failure?.code || '') ? failure.code : PREFIX + 'FAILED');
    process.exitCode = 1;
  }
}
