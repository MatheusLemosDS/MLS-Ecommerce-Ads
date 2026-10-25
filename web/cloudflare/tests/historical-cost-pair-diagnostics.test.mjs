import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {HISTORICAL_COST_EVIDENCE_SCHEMA,historicalCostPairDiagnosticsQueries,historicalCostPairDiagnosticsFromSnapshot,projectHistoricalCostPairDiagnostics,historicalCostEvidenceSnapshotQueries,historicalCostEvidenceFromSnapshot,syncHistoricalCostEvidence} from '../src/historical-cost-evidence.mjs';
import {COST_SCHEMA} from '../src/production-costs.mjs';
import {COST_RULE_SCHEMA} from '../src/cost-rules.mjs';
import {catalogClassificationQueries,catalogClassificationsFromSnapshot,storeCatalogClassificationFrame} from '../src/catalog-classification.mjs';
import {readHistoricalCostCandidates} from '../src/historical-cost-orchestration.mjs';

const at=Date.UTC(2026,9,25,12),stamp=at/1000,month='2026-10';
const pairs=[{item_id:'58218547329',model_id:'238814010783'},{item_id:'58219210514',model_id:'219195030703'}];
const titles=['Camiseta Meu Partido é o Brasil Amarela Unissex Estampada Eleições Brasil Algodão','Camiseta Brasil Bolsonaro Acima de Tudo Deus Acima de Todos Amarela 100% Algodão Unissex P ao GG'];
// Only these listing titles and pair IDs came from the public diagnostic.
// Model labels below are synthetic fixtures, never facts about the live shop.
const names=(index=0,model='Preto / G',changes={})=>({item_names:[titles[index]],model_names:[model],missing_item_name:false,missing_model_name:false,conflict:false,overflow:false,...changes});
async function fixture(t){const db=new D1(),env={ADMIN_DB:db},clock={time:at},now=()=>clock.time;t.after(()=>db.db.close());await db.batch([...HISTORICAL_COST_EVIDENCE_SCHEMA,...COST_SCHEMA,...COST_RULE_SCHEMA,
 'CREATE TABLE business_sync_state(id INTEGER PRIMARY KEY,enabled INTEGER NOT NULL)',
 'INSERT INTO business_sync_state VALUES(1,1)',
 'CREATE TABLE business_month_runs(month TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)',
 'CREATE TABLE business_month_frames(month TEXT NOT NULL,slot_index INTEGER NOT NULL,run_id TEXT,revision INTEGER,payload TEXT,PRIMARY KEY(month,slot_index))',
 'CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,payload TEXT NOT NULL)',
 ].map(sql=>db.prepare(sql)));const read=async(input=pairs)=>historicalCostPairDiagnosticsFromSnapshot(await db.batch(historicalCostPairDiagnosticsQueries(db,month,input)),{now});return {db,env,clock,now,read};}
function observation(f,index,{approved=1,payload=names(index),first=stamp-60,last=stamp}={}){const p=pairs[index];f.db.db.prepare('INSERT OR REPLACE INTO historical_cost_evidence_names(item_id,model_id,payload,approved,first_checked_at,last_checked_at) VALUES(?,?,?,?,?,?)').run(p.item_id,p.model_id,JSON.stringify(payload),approved,first,last);}
function scan(f,item_ids,{status='COMPLETE',checked=stamp,observed=[],window_index=status==='COMPLETE'?2:1,scope_key=crypto.randomUUID(),run_id=crypto.randomUUID(),next_run_at=0,lease_until=null}={}){
 f.db.db.prepare('INSERT INTO historical_cost_evidence_runs(scope_key,month,item_ids,end_date,run_id,revision,status,window_index,cursor,pages_read,next_run_at,failure_count,last_error,last_attempt_at,last_success_at,lease_owner,lease_until) VALUES(?,?,?,?,?,3,?,?,NULL,5,?,0,NULL,?,?,?,?)').run(scope_key,month,JSON.stringify(item_ids),month+'-25',run_id,status,window_index,next_run_at,checked,checked,lease_until===null?null:crypto.randomUUID(),lease_until);
 for(const p of observed)f.db.db.prepare('INSERT INTO historical_cost_evidence_members(run_id,item_id,model_id) VALUES(?,?,?)').run(run_id,p.item_id,p.model_id);return run_id;
}

test('the exact two real missing pairs distinguish no scan, a running scan and absence in a completed scope without guessing cost',async t=>{
 const f=await fixture(t);let value=await f.read();assert.deepEqual(value.pairs.map(row=>row.state),['NO_SCAN','NO_SCAN']);assert.equal(value.month,month);
 scan(f,[pairs[0].item_id]);scan(f,[pairs[1].item_id],{status:'RETRY_WAIT',next_run_at:stamp+60});value=await f.read();assert.equal(value.pairs[0].state,'NOT_FOUND');assert.equal(value.pairs[0].scan.observed_pair,false);assert.equal(value.pairs[1].state,'SCANNING');assert.equal(value.pairs[1].scan.status,'RETRY_WAIT');assert.equal(value.pairs[1].scan.retry_after_seconds,60);assert.ok(value.pairs.every(row=>!row.approved&&row.composition===null&&row.model_name===null));
 assert.doesNotMatch(JSON.stringify(value),/scope_key|run_id|cursor|order_sn|order_id|quantity|unit_cost|price|access_token|customer/);
});

test('missing, conflicting and unsupported names remain separate from approved exact-name composition',async t=>{
 const f=await fixture(t);observation(f,0,{payload:names(0,'',{model_names:[],missing_model_name:true})});observation(f,1,{payload:names(1,'GG',{model_names:['GG','G1'],conflict:true})});scan(f,pairs.map(row=>row.item_id),{observed:pairs});let value=await f.read();assert.deepEqual(value.pairs.map(row=>row.state),['NAME_MISSING','CONFLICT']);assert.ok(value.pairs.every(row=>!row.approved&&row.composition===null));
 observation(f,0,{payload:names(0,'Verde')});observation(f,1,{payload:names(1,'Preto / GG')});value=await f.read();assert.equal(value.pairs[0].state,'COMPOSITION_REJECTED');assert.equal(value.pairs[0].model_name,'Verde');assert.equal(value.pairs[1].state,'APPROVED');assert.equal(value.pairs[1].composition.size,'GG');assert.equal(value.pairs[1].approved,true);assert.equal(value.pairs[1].provenance,'HISTORICAL_ORDER_EVIDENCE');assert.ok(!JSON.stringify(value).includes('1590'));
});

test('an observation from an abandoned incomplete scope is not falsely approved by a newer complete scope that never observed its pair',async t=>{
 const f=await fixture(t);observation(f,0,{approved:0});scan(f,[pairs[0].item_id],{status:'RUNNING',checked:stamp-120,observed:[pairs[0]]});scan(f,pairs.map(row=>row.item_id),{checked:stamp});const value=await f.read();assert.equal(value.pairs[0].state,'SCANNING');assert.equal(value.pairs[0].reason,'OBSERVATION_OUTSIDE_COMPLETED_SCAN');assert.equal(value.pairs[0].scan.status,'COMPLETE');assert.equal(value.pairs[0].scan.observed_pair,false);assert.equal(value.pairs[0].model_name,'Preto / G');assert.equal(value.pairs[0].approved,false);assert.deepEqual(historicalCostEvidenceFromSnapshot(await f.db.batch(historicalCostEvidenceSnapshotQueries(f.db,pairs.map(row=>row.item_id))),{now:f.now}).compositions,[]);
});

test('diagnostics explain the stored missing-name flag after a complete reread rather than claiming the model was never found',async t=>{
 const f=await fixture(t),input={month,item_ids:[pairs[0].item_id]};let missing=true;const source=async(_,selection)=>({schema:'historical_variant_evidence_v1',shop_id:1178167501,checked_at:Math.floor(f.now()/1000),...selection,has_more:false,next_cursor:null,coverage:{orders_seen:1,target_orders:1,target_lines:1,target_units:1},evidence_complete:true,products:[{item_id:pairs[0].item_id,variants:[{model_id:pairs[0].model_id,line_count:1,quantity:1,item_names:[titles[0]],model_names:missing?[]:['Preto / G'],missing_item_name_lines:0,missing_model_name_lines:missing?1:0,status_counts:[{status:'COMPLETED',line_count:1,quantity:1}],conflict:false}]}],omitted:{target_lines:0,target_units:0}});
 await syncHistoricalCostEvidence(f.env,input,source,{now:f.now});missing=false;await syncHistoricalCostEvidence(f.env,input,source,{now:f.now});f.clock.time+=901000;await syncHistoricalCostEvidence(f.env,input,source,{now:f.now});await syncHistoricalCostEvidence(f.env,input,source,{now:f.now});const row=(await f.read()).pairs[0];assert.equal(row.state,'NAME_MISSING');assert.equal(row.reason,'RECORDED_NAMES_MISSING');assert.equal(row.scan.status,'COMPLETE');assert.equal(row.scan.observed_pair,true);assert.equal(row.model_name,'Preto / G');assert.equal(row.name_flags.missing_model_name,true);assert.equal(row.approved,false);
});

test('a mismatched classification fingerprint fails closed rather than silently hiding a raw row and reporting MODEL_NOT_IN_CATALOG',async t=>{
 const f=await fixture(t),p=pairs[0];await storeCatalogClassificationFrame(f.env,{schema:'variant_catalog_v1',checked_at:stamp,products:[{item_id:p.item_id,catalog_fingerprint:'a'.repeat(64),selling_unit:'SINGLE_GARMENT',bindings:[{item_id:p.item_id,model_id:p.model_id,size:'G'}],unresolved_count:0,cost_catalog:{schema:'product_cost_catalog_v1',product_name:titles[0],variants:[{model_id:p.model_id,attributes:[{name:'Tamanho',value:'G'}]}]}}]},{now:f.now});
 const frame={schema:'finance_business_period_v1',start_date:month+'-01',end_date:month+'-15',currency:'BRL',basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED',items:[{...p,quantity:1}]};f.db.db.prepare('INSERT INTO business_month_runs(month,revision,payload,created_at,updated_at) VALUES(?,1,?,?,?)').run(month,JSON.stringify({start_date:frame.start_date,end_date:frame.end_date,slots:[{start_date:frame.start_date,end_date:frame.end_date,frame}]}),stamp,stamp);
 f.db.db.prepare('UPDATE catalog_classification_jobs SET catalog_fingerprint=? WHERE item_id=?').run('b'.repeat(64),p.item_id);assert.deepEqual((await readHistoricalCostCandidates(f.env,month,{now:f.now})).item_ids,[]);const snapshot=await f.db.batch(catalogClassificationQueries(f.db,[p.item_id],[p]));assert.throws(()=>catalogClassificationsFromSnapshot(snapshot),error=>error.message==='CATALOG_CLASSIFICATION_STORAGE_INVALID');
 const raw=f.db.db.prepare('SELECT payload FROM catalog_classification_variants WHERE item_id=? AND model_id=?').get(p.item_id,p.model_id),metadata=JSON.parse(raw.payload);metadata.binding=null;f.db.db.prepare('UPDATE catalog_classification_variants SET payload=? WHERE item_id=? AND model_id=?').run(JSON.stringify(metadata),p.item_id,p.model_id);const projected=catalogClassificationsFromSnapshot(await f.db.batch(catalogClassificationQueries(f.db,[p.item_id],[p])));assert.equal(projected.variants[0].model_id,p.model_id,'a valid metadata-only row remains visible; it is not filtered as missing');
});

test('the browser projector rejects accessors/private extras and reports bounded truncation explicitly',async t=>{
 const f=await fixture(t),many=Array.from({length:100},(_,index)=>({item_id:pairs[0].item_id,model_id:String(index)})),value=await f.read(many);assert.equal(value.truncation.truncated,true);assert.equal(value.truncation.pairs_total,100);assert.ok(value.truncation.pairs_included<=90);assert.ok(new TextEncoder().encode(JSON.stringify(value)).byteLength<=65536);
 assert.equal(projectHistoricalCostPairDiagnostics({...value,access_token:'PRIVATE'}),null);let invoked=0;const poison=structuredClone(value);Object.defineProperty(poison.pairs[0],'model_name',{enumerable:true,get(){invoked++;return 'PRIVATE';}});assert.equal(projectHistoricalCostPairDiagnostics(poison),null);assert.equal(invoked,0);
 const context=vm.createContext({TextEncoder,raw:JSON.stringify(value)});new vm.Script(projectHistoricalCostPairDiagnostics.toString()).runInContext(context);assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(projectHistoricalCostPairDiagnostics(JSON.parse(raw)))',context)),value);
});
