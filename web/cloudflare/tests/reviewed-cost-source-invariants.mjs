import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const baselineCommit='bd01f64d7e290abb259e9c9dc2646496494a87f0';
const digest=value=>createHash('sha256').update(value).digest('hex');
// Exact reviewed variants. The old hashes remain pinned; new hashes authorize
// only tenant initialization, seed isolation and explicit first configuration.
export const REVIEWED_COST_SOURCE_PINS=Object.freeze({
 'cost-rules.mjs':Object.freeze({legacy:'536f75bb781f4f45c51a57e1418d243b75f20f27d277c0e6515fa462c0c5b902',commercial:'bddd06c0c7f9b97c809240082137297b7d6b43b0a95ed61ddef7fead571643dd'}),
 'production-costs.mjs':Object.freeze({legacy:'190287869d819d5511a6b41288ef3c270394de4ee1a8f1f56ea8068cd0e70e4b',commercial:'04d8a0cc79f95fae403ce09f3d4137a4eb5b71489a98aea8161abdc2bb53d7a8'}),
 'business-month.mjs':Object.freeze({legacy:'6208017bbf4cadea28629c2195faf45b6c31f48a811026c33dd489751b043766',commercial:'fe688b43dc3d848004477ace9de1b7a70a47951f488b3c06e51d8e50aa96ff63'}),
 'incurred-production.mjs':Object.freeze({legacy:'d751d925874e6c86c61d3c15ebdcf41072e5ab282e2a13dd88690191befd4956',commercial:'3958d0babcaa370cf6f1bcf8d7201cb00e7fc7a015ceddc4c32c1189ea5d3e4d'}),
});
const weeklyBundleExposure=String.raw`// Shared by the read-only weekly adapter after validating an immutable monthly
// publication. Keep this calculation identical to the existing monthly reader.
export async function businessMonthBundle(db,month,range,stamp,observed,{withExpenseSchedule=false}={}){`;
const originalBundleDeclaration='async function businessMonthBundle(db,month,range,stamp,observed,{withExpenseSchedule=false}={}){';
const commercialRuleAdapter=String.raw`export function costRuleSchemaForEnvironment(env,schema=COST_RULE_SCHEMA){
 if(!env?.COMMERCIAL_CONTEXT&&!isTenantDatabase(env?.ADMIN_DB))return schema;
 const ddl=schema.filter(sql=>!/^\s*INSERT (?:OR IGNORE )?INTO (?:production_cost_rules|business_tax_policy)_(?:state|audit)\b/i.test(sql)).map(sql=>sql.replace("'operator-confirmed-film-57cm'","'commercial-film-default-unconfirmed-v1'"));
 return [...ddl,"INSERT OR IGNORE INTO production_cost_rules_state(id,revision,payload,updated_at) SELECT 1,1,'{\"rules\":[]}',strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE NOT EXISTS(SELECT 1 FROM production_cost_rules_audit)","INSERT INTO production_cost_rules_audit(revision,payload,actor,created_at) SELECT revision,payload,'commercial-empty-rules-v1',updated_at FROM production_cost_rules_state WHERE changes()=1 AND id=1 AND revision=1"];
}
`;
const commercialFirstCost=String.raw` if(env.COMMERCIAL_CONTEXT&&costExact(body,['revision','values'])&&body.revision===0){
  const values=validateProductionCosts(body.values),raw=JSON.stringify(values),stamp=new Date().toISOString();
  const result=await env.ADMIN_DB.batch([env.ADMIN_DB.prepare('INSERT OR IGNORE INTO production_costs_state(id,revision,payload,updated_at) SELECT 1,1,?,? WHERE NOT EXISTS(SELECT 1 FROM production_costs_audit)').bind(raw,stamp),env.ADMIN_DB.prepare('INSERT INTO production_costs_audit(revision,payload,actor,created_at) SELECT revision,payload,?,updated_at FROM production_costs_state WHERE changes()=1 AND id=1 AND revision=1 AND payload=?').bind(env.COMMERCIAL_CONTEXT.userId,raw)]);
  if(result[0].meta.changes!==1||result[1].meta.changes!==1)costFail('PRODUCTION_COSTS_CHANGED_RELOAD',409);return readProductionCosts(env);
 }
`;
function replaceExact(source,before,after,label,count=1){
 assert.equal(source.split(before).length-1,count,'exact reviewed source delta: '+label);
 return source.split(before).join(after);
}
function normalizeCommercialSource(name,current){
 let source=current;
 if(name==='cost-rules.mjs'){
  source=replaceExact(source,"import {TenantInitializationMap,isTenantDatabase} from './tenant-storage.mjs';\n",'',name+' import');
  source=replaceExact(source,'const ruleReady=new TenantInitializationMap();','const ruleReady=new WeakMap();',name+' cache');
  source=replaceExact(source,commercialRuleAdapter,'',name+' empty commercial rules');
  source=replaceExact(source,'db.batch(costRuleSchemaForEnvironment(env).map(sql=>db.prepare(sql)))','db.batch(COST_RULE_SCHEMA.map(sql=>db.prepare(sql)))',name+' seed selection');
 }else if(name==='production-costs.mjs'){
  source=replaceExact(source," if(!row&&env.COMMERCIAL_CONTEXT)costFail('PRODUCTION_COSTS_CONFIGURATION_REQUIRED',409);\n",'',name+' missing configuration');
  source=replaceExact(source,commercialFirstCost,'',name+' first explicit configuration');
 }else if(name==='business-month.mjs'){
  source=replaceExact(source,"import {TenantInitializationSet} from './tenant-storage.mjs';\n",'',name+' import');
  source=replaceExact(source,'COST_RULE_SCHEMA,costRuleSchemaForEnvironment,costRuleSnapshotQueries','COST_RULE_SCHEMA,costRuleSnapshotQueries',name+' seed helper import');
  source=replaceExact(source,'const businessMonthReady=new TenantInitializationSet();','const businessMonthReady=new WeakSet();',name+' cache');
  source=replaceExact(source,'db.batch(costRuleSchemaForEnvironment(env,BUSINESS_MONTH_SCHEMA).map(sql=>db.prepare(sql)))','db.batch(BUSINESS_MONTH_SCHEMA.map(sql=>db.prepare(sql)))',name+' seed selection',2);
  source=replaceExact(source,weeklyBundleExposure,originalBundleDeclaration,name+' existing helper export');
 }else if(name==='incurred-production.mjs'){
  source=replaceExact(source,"import {TenantInitializationSet} from './tenant-storage.mjs';\n",'',name+' import');
  source=replaceExact(source,'const ready=new TenantInitializationSet(),encoder=','const ready=new WeakSet(),encoder=',name+' cache');
 }
 return source;
}
function from(source,marker){assert.equal(source.split(marker).length,2,'unique financial source boundary '+marker);return source.slice(source.indexOf(marker));}
// These sections are compared directly, before any adapter normalization.
// They cover rule evaluation/precedence, production validators/reference math,
// monthly calculations/DTOs and physical production projectors.
function assertFinancialSections(name,current,baseline){
 const same=(left,right,label)=>assert.equal(left,right,'legacy financial formulas/DTOs unchanged: '+name+' '+label);
 if(name==='cost-rules.mjs')same(from(current,'const ruleNormalize='),from(baseline,'const ruleNormalize='),'rule matching and precedence');
 if(name==='production-costs.mjs'){
  same(current.slice(0,current.indexOf('export async function readProductionCosts')),baseline.slice(0,baseline.indexOf('export async function readProductionCosts')),'validators and schema');
  same(from(current,'const costReferenceFailure='),from(baseline,'const costReferenceFailure='),'reference calculations');
 }
 if(name==='business-month.mjs'){
  same(current.slice(current.indexOf('export function projectBusinessMonth('),current.indexOf('const businessMonthCoverageKeys=')),baseline.slice(baseline.indexOf('export function projectBusinessMonth('),baseline.indexOf('const businessMonthCoverageKeys=')),'monthly DTO');
  same(from(current,' const year=Number(month.slice(0,4));'),from(baseline,' const year=Number(month.slice(0,4));'),'monthly bundle calculations');
 }
 if(name==='incurred-production.mjs')same(current.slice(current.indexOf('export function projectIncurredProduction('),current.indexOf('const ready=')),baseline.slice(baseline.indexOf('export function projectIncurredProduction('),baseline.indexOf('const ready=')),'physical facts, range and periods');
}
export function assertReviewedCostSources({readSource=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8')}={}){
 for(const [name,pins] of Object.entries(REVIEWED_COST_SOURCE_PINS)){
  const baseline=execFileSync('git',['show',baselineCommit+':web/cloudflare/src/'+name],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'}),current=readSource(name);
  assert.equal(digest(baseline),pins.legacy,'original financial baseline remains pinned: '+name);
  assert.ok(Object.values(pins).includes(digest(current)),'only exact reviewed legacy/commercial source bytes: '+name);
  assertFinancialSections(name,current,baseline);
  const comparable=digest(current)===pins.legacy?current:normalizeCommercialSource(name,current);
  assert.equal(comparable,baseline,'complete legacy financial source unchanged after exact reviewed adapters: '+name);
 }
}
