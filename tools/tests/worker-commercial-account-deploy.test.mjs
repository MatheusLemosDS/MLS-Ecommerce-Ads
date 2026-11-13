import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateDeployment, deployWorker} from '../worker_deploy.mjs';
import {TARGETS, stableJson, sha256} from '../worker_project.mjs';
import {BROWSER_ASSETS_CONFIG} from '../import_worker_config.mjs';

const names = Object.keys(TARGETS);
const ids = {app: '11111111-1111-4111-8111-111111111111',
  auth: '22222222-2222-4222-8222-222222222222',
  finance: '33333333-3333-4333-8333-333333333333',
  account: 'abcdefab-abcd-4abc-8abc-abcdefabcdef',
  replacement: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'};
const invalid = 'WORKER_COMMERCIAL_ACCOUNT_CONFIG_INVALID';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mls-account-deployment-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const file = (name, filename) => path.join(root, 'workers', name, filename);
  const config = name => ({name: TARGETS[name].name, main: TARGETS[name].main,
    compatibility_date: '2026-10-12', keep_vars: true,
    d1_databases: [{binding: name === 'app' ? 'ADMIN_DB' : name === 'auth' ? 'AUTH_DB' : 'FINANCE_DB', database_id: ids[name]}],
    ...(name === 'app' ? {routes: [{pattern: 'shop.fixture.invalid', custom_domain: true}], triggers: {crons: ['*/15 * * * *']}} : {}),
    ...(name === 'auth' ? {services: [{binding: 'SHOPEE_FINANCE_SERVICE', service: TARGETS.finance.name}], routes: [{pattern: 'auth.fixture.invalid', custom_domain: true}]} : {}),
    ...(name === 'finance' ? {workers_dev: false, preview_urls: false} : {}),
  });
  const save = (name, value) => {
    fs.mkdirSync(path.dirname(file(name, 'wrangler.json')), {recursive: true});
    const captured = {version: 1, target: name, worker_name: TARGETS[name].name,
      mode: name === 'finance' ? 'new' : 'existing', recognized_source_sha256: name === 'finance' ? null : TARGETS[name].baselineHashes[0],
      config_sha256: sha256(stableJson(value)), captured_config: value};
    fs.writeFileSync(file(name, 'wrangler.json'), stableJson(value));
    fs.writeFileSync(file(name, 'migration.json'), stableJson(captured));
  };
  const authorization = (name, id = ids.account) => ({version: 1,
    captured_config_sha256: sha256(stableJson(JSON.parse(fs.readFileSync(file(name, 'wrangler.json'))))), account_database_id: id});
  const authorize = (id = ids.account) => {for (const name of names) fs.writeFileSync(file(name, 'commercial-account.json'), stableJson(authorization(name, id)));};
  for (const name of names) save(name, config(name));
  const calls = [], built = [];
  return {root, file, config, save, authorization, authorize, calls, built,
    build: name => built.push(name), run: (...args) => {calls.push(args); return 'OK';}};
}

function assertBlocked(f, code = invalid) {
  for (const name of names) assert.throws(() => deployWorker(name, f), {code}, name);
  assert.deepEqual(f.calls, []);assert.deepEqual(f.built, []);
}

test('absence of commercial authorization preserves every legacy profile and Finance isolation', t => {
  const f = fixture(t);
  for (const name of names) {const observed = validateDeployment(name, f);assert.deepEqual(observed.config, f.config(name));assert.equal(observed.generated, false);assert.equal(observed.configPath, f.file(name, 'wrangler.json'));}
  const shared = f.config('finance');shared.d1_databases[0].database_id = ids.app;f.save('finance', shared);
  assert.throws(() => validateDeployment('finance', f), {code: 'WORKER_FINANCE_DATABASE_MUST_BE_SEPARATE'});
});

test('three hash-bound authorizations add exactly ACCOUNT_DB without rewriting a captured byte', t => {
  const f = fixture(t);f.authorize();
  const captures = names.flatMap(name => ['wrangler.json', 'migration.json'].map(filename => [f.file(name, filename), fs.readFileSync(f.file(name, filename))]));
  for (const name of names) {
    const observed = validateDeployment(name, f), expected = {...f.config(name), main: path.join(f.root, 'dist', name+'-worker.mjs'),
      d1_databases: [...f.config(name).d1_databases, {binding: 'ACCOUNT_DB', database_id: ids.account}]};
    assert.deepEqual(observed.config, expected);assert.equal(observed.generated, true);
    assert.equal(observed.configPath, f.file(name, '.wrangler/runtime.generated.json'));assert.equal(fs.existsSync(observed.configPath), false, 'validation is read-only');
    assert.equal(deployWorker(name, {...f, dryRun: true}), 'OK');
    assert.deepEqual(JSON.parse(fs.readFileSync(observed.configPath)), expected);
    const call = f.calls.at(-1);assert.deepEqual(call[1], [path.join(f.root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--config', observed.configPath, '--dry-run']);
    assert.equal(call[2].env.WRANGLER_SEND_METRICS, 'false');
    assert.equal(Object.hasOwn(expected, 'vars'), false);assert.equal(Object.hasOwn(expected, 'env'), false);
  }
  assert.deepEqual(f.built, names);assert.equal(f.calls.length, names.length);
  for (const [filename, bytes] of captures) assert.deepEqual(fs.readFileSync(filename), bytes);
});

test('commercial binding composes with the already authorized App cron and exact browser assets', t => {
  const f = fixture(t);f.authorize();const captured = JSON.parse(fs.readFileSync(f.file('app', 'migration.json')));
  fs.writeFileSync(f.file('app', 'automation.json'), stableJson({version: 1, captured_config_sha256: captured.config_sha256, cron: '* * * * *'}));
  fs.writeFileSync(f.file('app', 'browser-assets.json'), stableJson({version: 1, captured_config_sha256: captured.config_sha256, assets: {...BROWSER_ASSETS_CONFIG}}));
  const observed = validateDeployment('app', f);
  assert.deepEqual(observed.config.triggers, {crons: ['* * * * *']});
  assert.deepEqual(observed.config.assets, {...BROWSER_ASSETS_CONFIG, directory: path.join(f.root, 'dist/browser-assets')});
  assert.deepEqual(observed.config.routes, f.config('app').routes);assert.equal(observed.config.keep_vars, true);
  assert.deepEqual(observed.config.d1_databases, [...f.config('app').d1_databases, {binding: 'ACCOUNT_DB', database_id: ids.account}]);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file('app', 'wrangler.json'))), captured.captured_config);
});

test('partial authorization never deploys one Worker with a missing or different peer database', t => {
  const f = fixture(t);
  for (const missing of names) {f.authorize();fs.unlinkSync(f.file(missing, 'commercial-account.json'));assertBlocked(f);}
  f.authorize();for (const changed of names) {f.authorize();fs.writeFileSync(f.file(changed, 'commercial-account.json'), stableJson(f.authorization(changed, ids.replacement)));assertBlocked(f);}
  for (const only of names) {for (const name of names) fs.rmSync(f.file(name, 'commercial-account.json'), {force: true});fs.writeFileSync(f.file(only, 'commercial-account.json'), stableJson(f.authorization(only)));assertBlocked(f);}
});

test('closed authorization rejects arbitrary bindings, settings, secrets, aliases and malformed values', t => {
  const f = fixture(t);
  for (const mutate of [
    value => {value.version=2;},value => {value.version='1';},value => {delete value.version;},
    value => {value.captured_config_sha256='0'.repeat(64);},value => {delete value.captured_config_sha256;},
    value => {value.account_database_id='REPLACE_WITH_REAL_DATABASE';},value => {value.account_database_id=' '+ids.account;},value => {value.account_database_id=null;},value => {value.account_database_id='00000000-0000-0000-0000-000000000000';},
    value => {value.binding='ACCOUNT_DB';},value => {value.d1_databases=[];},value => {value.vars={SECRET:'synthetic-not-a-secret'};},
    value => {value.env={preview:{}};},value => {value.services=[];},value => {value.routes=[];},value => {value.cron='* * * * *';},
    value => {value.keep_vars=false;},value => {value.accountDatabaseId=value.account_database_id;},
  ]) {f.authorize();const value=f.authorization('app');mutate(value);fs.writeFileSync(f.file('app','commercial-account.json'),stableJson(value));assertBlocked(f);}
  for (const raw of ['null','[]','true','1','"authorization"','{','', ' '.repeat(4097), JSON.stringify({...f.authorization('app'), extra:'x'.repeat(4096)}),
    '{"version":2,"version":1,"captured_config_sha256":"'+f.authorization('app').captured_config_sha256+'","account_database_id":"'+ids.account+'"}']) {
    f.authorize();fs.writeFileSync(f.file('app','commercial-account.json'),raw);assertBlocked(f);
  }
  f.authorize();fs.writeFileSync(f.file('app','commercial-account.json'),Buffer.from([0xff,0xfe]));assertBlocked(f);
  for (const name of names) fs.writeFileSync(f.file(name,'commercial-account.json'),'null');assertBlocked(f);
});

test('shared account ID must differ from every legacy D1, including Auth and additional captured databases', t => {
  const f = fixture(t), extra = f.config('app');extra.d1_databases.push({binding:'HISTORICAL_DB',database_id:ids.replacement});f.save('app',extra);
  for (const id of [ids.app,ids.auth,ids.finance,ids.replacement,ids.auth.toUpperCase()]) {f.authorize(id);assertBlocked(f,'WORKER_COMMERCIAL_ACCOUNT_DATABASE_MUST_BE_SEPARATE');}
  f.authorize(ids.account.toUpperCase());assert.equal(validateDeployment('finance',f).config.d1_databases.find(row=>row.binding==='ACCOUNT_DB').database_id,ids.account);
});

test('commercial sharing never permits a second legacy Finance D1 or any public Finance surface', t => {
  const f = fixture(t);
  for (const change of [
    value=>{value.d1_databases.push({binding:'OTHER_DB',database_id:ids.replacement});},
    value=>{value.workers_dev=true;},value=>{value.preview_urls=true;},value=>{value.routes=[{pattern:'public.fixture.invalid'}];},
    value=>{value.triggers={crons:['* * * * *']};},value=>{value.services=[{binding:'SERVICE',service:TARGETS.app.name}];},
  ]) {const value=f.config('finance');change(value);f.save('finance',value);f.authorize();for(const name of names)assert.throws(()=>deployWorker(name,f),{code:'WORKER_FINANCE_MUST_BE_PRIVATE'});}
  assert.deepEqual(f.calls,[]);assert.deepEqual(f.built,[]);
});

test('every sidecar remains bound to its exact immutable capture and recognized deployed source', t => {
  const f = fixture(t);f.authorize();const changed=f.config('auth');changed.routes=[];
  fs.writeFileSync(f.file('auth','wrangler.json'),stableJson(changed));assertBlocked(f,'WORKER_MIGRATION_SNAPSHOT_MISMATCH');
  f.save('auth',changed);assertBlocked(f);f.authorize();
  const snapshot=JSON.parse(fs.readFileSync(f.file('auth','migration.json')));snapshot.recognized_source_sha256='0'.repeat(64);fs.writeFileSync(f.file('auth','migration.json'),stableJson(snapshot));
  assertBlocked(f,'WORKER_PUBLISHED_SOURCE_UNRECOGNIZED');
});

test('existing resource aliases cannot shadow or replace the only permitted ACCOUNT_DB binding', t => {
  const f = fixture(t);
  for (const change of [
    value=>{value.d1_databases.push({binding:'ACCOUNT_DB',database_id:ids.replacement});},
    value=>{value.services=[{binding:'ACCOUNT_DB',service:'fixture-service'}];},
    value=>{value.kv_namespaces=[{binding:' account_db ',id:'a'.repeat(32)}];},
    value=>{value.durable_objects={bindings:[{name:'ACCOUNT_DB',class_name:'Fixture'}]};},
    value=>{value.wasm_modules={ACCOUNT_DB:'./fixture.wasm'};},
  ]) {const value=f.config('app');change(value);f.save('app',value);f.authorize();assertBlocked(f);}
});

test('authorization files cannot be symlinks, hardlinks or target-directory aliases', t => {
  const f = fixture(t);f.authorize();const original=f.file('app','commercial-account.json'), copied=f.file('app','copied-authorization.json');
  fs.renameSync(original,copied);fs.symlinkSync(copied,original);assertBlocked(f);fs.unlinkSync(original);fs.linkSync(copied,original);assertBlocked(f);fs.unlinkSync(original);fs.renameSync(copied,original);
  const directory=path.dirname(f.file('auth','wrangler.json')), moved=directory+'-moved';fs.renameSync(directory,moved);fs.symlinkSync(moved,directory);assertBlocked(f);
});

test('build-time authorization replacement is detected before generating config or calling Wrangler', t => {
  for (const mode of ['new-database','missing-peer','extra-field','peer-capture']) {
    const f=fixture(t);f.authorize();const build=name=>{f.built.push(name);
      if(mode==='new-database')f.authorize(ids.replacement);
      else if(mode==='missing-peer')fs.unlinkSync(f.file('auth','commercial-account.json'));
      else if(mode==='extra-field'){const value=f.authorization('auth');value.env={};fs.writeFileSync(f.file('auth','commercial-account.json'),stableJson(value));}
      else {const value=f.config('auth');value.routes=[{pattern:'changed.fixture.invalid',custom_domain:true}];f.save('auth',value);f.authorize();}
    };
    assert.throws(()=>deployWorker('finance',{...f,build}),{code:mode==='missing-peer'||mode==='extra-field'?invalid:'WORKER_DEPLOYMENT_CONFIG_CHANGED'});
    assert.deepEqual(f.built,['finance']);assert.deepEqual(f.calls,[]);assert.equal(fs.existsSync(f.file('finance','.wrangler/runtime.generated.json')),false);
  }
});

test('generated configs never follow a hostile file or directory alias into the immutable capture', t => {
  for (const mode of ['file','directory']) {
    const f=fixture(t);f.authorize();const original=fs.readFileSync(f.file('finance','wrangler.json')),directory=f.file('finance','.wrangler');
    if(mode==='file'){fs.mkdirSync(directory);fs.symlinkSync(f.file('finance','wrangler.json'),path.join(directory,'runtime.generated.json'));}
    else {const elsewhere=path.join(f.root,'elsewhere');fs.mkdirSync(elsewhere);fs.symlinkSync(elsewhere,directory);}
    assert.throws(()=>deployWorker('finance',f),{code:'WORKER_GENERATED_CONFIG_INVALID'});assert.deepEqual(f.calls,[]);assert.deepEqual(fs.readFileSync(f.file('finance','wrangler.json')),original);
  }
});
