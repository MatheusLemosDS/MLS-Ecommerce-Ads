import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {HISTORICAL_COST_EVIDENCE_SCHEMA,deriveHistoricalCostComposition,readHistoricalCostEvidence,syncHistoricalCostEvidence,historicalCostEvidenceSnapshotQueries,historicalCostEvidenceFromSnapshot} from '../src/historical-cost-evidence.mjs';
import {projectHistoricalVariantEvidenceFrame} from '../../finance/src/historical-variant-evidence-frame.mjs';
import {getFinanceHistoricalVariantEvidence} from '../src/app-historical-variant-evidence.mjs';

const at=Date.UTC(2026,9,25,12),requested={month:'2026-10',item_ids:['22099687396']};
const variant=(model_id='1',item_name='Camiseta Adulta Estrela',model_name='Verde, G')=>({model_id,line_count:1,quantity:1,item_names:[item_name],model_names:[model_name],missing_item_name_lines:0,missing_model_name_lines:0,status_counts:[{status:'COMPLETED',line_count:1,quantity:1}],conflict:false});
function page(input,stamp,variants=[],{has_more=false,next_cursor=null}={}){
 const count=variants.length,result={schema:'historical_variant_evidence_v1',shop_id:1178167501,checked_at:stamp,...input,has_more,next_cursor,coverage:{orders_seen:count?1:0,target_orders:count?1:0,target_lines:count,target_units:count},evidence_complete:true,products:input.item_ids.map((item_id,index)=>({item_id,variants:index===0?structuredClone(variants):[]})),omitted:{target_lines:0,target_units:0}};
 assert.ok(projectHistoricalVariantEvidenceFrame(result));return result;
}
async function fixture(){
 const db=new D1(),env={ADMIN_DB:db},clock={time:at},now=()=>clock.time,calls=[];
 db.db.exec('CREATE TABLE catalog_classification_state(id INTEGER PRIMARY KEY,revision INTEGER,lease_token TEXT,lease_until INTEGER); INSERT INTO catalog_classification_state VALUES(1,1,NULL,NULL)');
 let hook=input=>page(input,Math.floor(now()/1000),[variant()]);
 const source=async(_,input)=>{calls.push(structuredClone(input));return hook(input);};
 const read=(input=requested)=>readHistoricalCostEvidence(env,input,{now}),sync=(input=requested,options={})=>syncHistoricalCostEvidence(env,input,source,{now,...options}),reference=async()=>historicalCostEvidenceFromSnapshot(await db.batch(historicalCostEvidenceSnapshotQueries(db,requested.item_ids)),{now});
 return {db,env,clock,now,calls,source,read,sync,reference,setSource:value=>{hook=value;}};
}

test('exact historical names recognize one adult size, numeric child and an explicit gendered couple kit only',()=>{
 assert.deepEqual(deriveHistoricalCostComposition('Camiseta Unissex Estrela','Verde, GG'),{kind:'ADULT_SINGLE',size:'GG',male_size:null,female_size:null,child_size:null});
 assert.equal(deriveHistoricalCostComposition('Camiseta Adulta','Tamanho G1').size,'G1');
 assert.deepEqual(deriveHistoricalCostComposition('Camiseta Infantil Estrela','Vermelha, 2'),{kind:'CHILD_SINGLE',size:null,male_size:null,female_size:null,child_size:'2'});
 const kit=deriveHistoricalCostComposition('Kit Casal Camisetas Estrela','MULHER GG / HOMEM G2');assert.equal(kit.kind,'EXPLICIT_COUPLE_KIT');assert.equal(kit.male_size,'G2');assert.equal(kit.female_size,'GG');
 for(const [name,model] of [['Camiseta Infantil','G'],['Camiseta Bebê','G'],['Camiseta Adulta','G/GG'],['Camiseta Pet','P'],['Calça Infantil','4'],['Camiseta','Verde'],['Kit Casal Camisetas','P / GG'],['Kit Casal 3 Camisetas','HOMEM P MULHER GG'],['Combo 3 Camisetas Adultas','G'],['Camiseta Infantil','4 G'],['Camiseta Infantil','4/6'],['Camiseta Adulta','XGG'],['Camiseta Infantil','4ANOS'],['Camiseta Boneca','P'],['20 Camisetas adultas','Preto / G'],['Camiseta adulta','Preto / G / 20 unidades'],['Kit Casal Vinte Camisetas','HOMEM P MULHER GG'],['Camisetas adultas','G'],['Duas Camiseta adulta','G'],['Camiseta Infantil','4 / 20 unidades'],['Kit Família Casal Camisetas','HOMEM P MULHER GG']])assert.equal(deriveHistoricalCostComposition(name,model),null,name+' / '+model);
});

test('reads are local and a new composition is approved only when every month window completes',async()=>{
 const f=await fixture();let state=await f.read();assert.equal(state.scan.status,'NOT_STARTED');assert.equal(f.calls.length,0);
 state=await f.sync();assert.equal(state.scan.complete,false);assert.equal(state.products[0].variants[0].reason,'SCAN_INCOMPLETE');assert.deepEqual((await f.reference()).compositions,[]);
 state=await f.sync();assert.equal(state.scan.complete,true);assert.equal(state.scan.pages_read,2);const reference=await f.reference();assert.equal(reference.compositions[0].kind,'ADULT_SINGLE');assert.equal(reference.compositions[0].provenance,'HISTORICAL_ORDER_EVIDENCE');assert.equal(reference.compositions[0].size,'G');
 assert.deepEqual(f.calls.map(input=>[input.start_date,input.end_date,input.cursor]),[['2026-10-01','2026-10-15',null],['2026-10-16','2026-10-25',null]]);
 await f.read();assert.equal((await f.sync()).work,'COMPLETE');assert.equal(f.calls.length,2);
 const raw=f.db.db.prepare('SELECT payload FROM historical_cost_evidence_names').get().payload;assert.doesNotMatch(raw,/quantity|line_count|order_id|order_sn|access_token|price|amount/);
 assert.ok(f.db.db.prepare('SELECT revision FROM catalog_classification_state').get().revision>1);
});

test('one page per call persists its opaque cursor without exposing it in the owner response',async()=>{
 const f=await fixture();let count=0;f.setSource(input=>page(input,Math.floor(f.now()/1000),[variant()],{has_more:++count===1,next_cursor:count===1?'opaque-page-2':null}));
 const first=await f.sync();assert.equal(first.scan.pages_read,1);assert.equal(f.calls.length,1);assert.doesNotMatch(JSON.stringify(first),/opaque-page-2|cursor_hash|lease_owner|scope_key/);
 await f.sync();assert.equal(f.calls[1].cursor,'opaque-page-2');assert.equal((await f.reference()).compositions.length,0);
 const final=await f.sync();assert.equal(final.scan.complete,true);assert.equal(final.scan.pages_read,3);assert.equal((await f.reference()).compositions.length,1);
});

test('conflicting exact names and missing names never become inferred cost evidence',async()=>{
 const f=await fixture();await f.sync();f.setSource(input=>page(input,Math.floor(f.now()/1000),[variant('1','Camiseta Outro Tema','G1')]));
 const state=await f.sync();assert.equal(state.scan.complete,true);assert.equal(state.products[0].variants[0].reason,'CONFLICT');assert.equal((await f.reference()).compositions.length,0);
 const g=await fixture();g.setSource(input=>{const row=variant();row.item_names=[];row.missing_item_name_lines=1;return page(input,Math.floor(g.now()/1000),[row]);});await g.sync();await g.sync();assert.equal((await g.read()).products[0].variants[0].reason,'NAMES_MISSING');assert.deepEqual((await g.reference()).compositions,[]);
});

test('source failure and invalid/private frames retain cursor and evidence with finite backoff',async()=>{
 const f=await fixture();await f.sync();const before=f.db.db.prepare('SELECT payload FROM historical_cost_evidence_names').get().payload;
 f.setSource(()=>{throw Error('PRIVATE_TOKEN order_sn CUSTOMER');});let state=await f.sync();assert.equal(state.work,'ERROR');assert.equal(state.scan.status,'RETRY_WAIT');assert.equal(state.scan.pages_read,1);assert.equal(state.scan.retry_after_seconds,30);assert.doesNotMatch(JSON.stringify(state),/PRIVATE_TOKEN|CUSTOMER|order_sn/);
 await f.sync();assert.equal(f.calls.length,2);f.clock.time+=30000;f.setSource(input=>({...page(input,Math.floor(f.now()/1000),[variant()]),private_token:'secret'}));state=await f.sync();assert.equal(state.scan.last_error,'SOURCE_INVALID');assert.equal(state.scan.pages_read,1);assert.equal(f.db.db.prepare('SELECT payload FROM historical_cost_evidence_names').get().payload,before);
});

test('normalized HTTP permission and deadline failures are unavailable sources rather than malformed evidence',async()=>{
 for(const timeout of [false,true]){const f=await fixture();f.setSource(input=>getFinanceHistoricalVariantEvidence({APP_INTERNAL_SECRET:'fixture-private-app-key'},input,{timeoutMs:timeout?5:100,fetchImpl:timeout?async()=>new Promise(()=>{}):async()=>Response.json({error:'FINANCE_HISTORICAL_EVIDENCE_UNAVAILABLE',diagnostic:{code:'FINANCE_HISTORICAL_EVIDENCE_PERMISSION_REQUIRED',http:403}},{status:403})}));const result=await f.sync();assert.equal(result.work,'ERROR');assert.equal(result.scan.last_error,'SOURCE_UNAVAILABLE');assert.equal(result.scan.pages_read,0);assert.equal(result.scan.retry_after_seconds,30);}
});

test('pause and a concurrent live lease prevent provider requests and stale owners cannot publish',async()=>{
 const f=await fixture();assert.equal((await f.sync(requested,{canRun:async()=>false})).work,'PAUSED');assert.equal(f.calls.length,0);
 let entered,release;const started=new Promise(resolve=>{entered=resolve;}),blocked=new Promise(resolve=>{release=resolve;});f.setSource(async input=>{entered();await blocked;return page(input,Math.floor(f.now()/1000),[variant()]);});
 const pending=f.sync();await started;assert.equal((await f.sync()).work,'LEASED');assert.equal(f.calls.length,1);
 f.db.db.prepare('UPDATE historical_cost_evidence_runs SET revision=revision+1,lease_owner=NULL,lease_until=NULL').run();release();assert.equal((await pending).work,'LEASED');assert.equal(f.db.db.prepare('SELECT COUNT(*) AS total FROM historical_cost_evidence_names').get().total,0);
});

test('a repeated cursor is rejected rather than importing the page twice or certifying the month',async()=>{
 const f=await fixture();let count=0;f.setSource(input=>page(input,Math.floor(f.now()/1000),[variant()],{has_more:true,next_cursor:++count===1?'page-a':count===2?'page-b':'page-a'}));
 await f.sync();await f.sync();const state=await f.sync();assert.equal(state.work,'ERROR');assert.equal(state.scan.last_error,'SOURCE_INVALID');assert.equal(state.scan.pages_read,2);assert.equal(state.scan.complete,false);assert.deepEqual((await f.reference()).compositions,[]);
});

test('the next local day starts a new bounded scan while a new conflict revokes previously approved evidence',async()=>{
 const f=await fixture();await f.sync();await f.sync();assert.equal((await f.reference()).compositions.length,1);
 f.clock.time+=86400000;f.setSource(input=>page(input,Math.floor(f.now()/1000),[variant('1','Camiseta Outra','G1')]));const state=await f.sync();assert.equal(state.scan.complete,false);assert.equal(state.scan.end_date,'2026-10-26');assert.equal(state.scan.pages_read,1);assert.equal((await f.reference()).compositions.length,0);
});

test('fresh complete scans coalesce repeated recovery while a pending model can be discovered after the fifteen-minute TTL',async()=>{
 const f=await fixture();await f.sync();await f.sync();const previous=f.db.db.prepare('SELECT run_id FROM historical_cost_evidence_runs').get().run_id;assert.equal((await f.reference()).compositions.length,1);
 f.setSource(input=>page(input,Math.floor(f.now()/1000),[variant(),variant('2','Camiseta Infantil Estrela','2')]));f.clock.time+=899000;assert.equal((await f.sync()).work,'COMPLETE');assert.equal(f.calls.length,2);
 f.clock.time+=1000;let state=await f.sync();assert.equal(state.scan.complete,false);assert.equal(state.scan.pages_read,1);assert.equal(f.calls.length,3);assert.equal((await f.reference()).compositions.length,1,'the new model is not approved from an incomplete repeat scan');
 state=await f.sync();assert.equal(state.scan.complete,true);assert.equal((await f.reference()).compositions.length,2);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS total FROM historical_cost_evidence_members WHERE run_id=?').get(previous).total,0);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS total FROM historical_cost_evidence_cursors WHERE run_id=?').get(previous).total,0);
 assert.doesNotMatch(f.db.db.prepare("SELECT payload FROM historical_cost_evidence_names WHERE model_id='2'").get().payload,/quantity|amount|price/);
});

test('overlapping scans use a global evidence CAS so one name cannot erase another concurrent observation',async()=>{
 const f=await fixture();await f.read();const original=f.db.batch.bind(f.db);let changed=false;
 f.db.batch=async statements=>{const result=await original(statements);if(statements.length===2&&result[0]?.results?.[0]?.revision!==undefined&&!changed){changed=true;f.db.db.prepare('UPDATE historical_cost_evidence_state SET revision=revision+1,write_token=?').run('other-owner');}return result;};
 const state=await f.sync();assert.equal(state.work,'LEASED');assert.equal(state.scan.pages_read,0);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS total FROM historical_cost_evidence_names').get().total,0);
});

test('a large accepted page uses bounded bulk writes without dropping its last model',async()=>{
 const f=await fixture(),original=f.db.batch.bind(f.db),sizes=[];f.db.batch=async statements=>{sizes.push(statements.length);return original(statements);};
 f.setSource(input=>page(input,Math.floor(f.now()/1000),Array.from({length:100},(_,index)=>variant(String(index)))));
 await f.sync();const state=await f.sync();assert.equal(state.scan.complete,true);assert.equal((await f.reference()).compositions.length,100);assert.ok(sizes.every(size=>size<=10));assert.equal(state.products[0].variants.at(-1).model_id,'99');
});

test('the App transport confines credentials, validates page identity and bounds redirects, private fields and timeouts',async()=>{
 const input={start_date:'2026-10-01',end_date:'2026-10-15',item_ids:['22099687396'],cursor:null},env={APP_INTERNAL_SECRET:'fixture-internal-secret'},calls=[];
 const fetchImpl=async request=>{calls.push(request);return Response.json(page(input,at/1000,[variant()]));};
 assert.equal((await getFinanceHistoricalVariantEvidence(env,input,{fetchImpl})).schema,'historical_variant_evidence_v1');assert.equal(calls[0].url,'https://auth.brazacommerce.com.br/internal/shopee/finance/historical-variant-evidence');assert.equal(calls[0].headers.get('X-Braza-App-Key'),env.APP_INTERNAL_SECRET);assert.deepEqual(await calls[0].json(),input);
 for(const payload of [{...page(input,at/1000),shop_id:1},{...page(input,at/1000),access_token:'PRIVATE'}]){const value=await getFinanceHistoricalVariantEvidence(env,input,{fetchImpl:async()=>Response.json(payload)});assert.equal(value.status,'UNAVAILABLE');assert.doesNotMatch(JSON.stringify(value),/PRIVATE|fixture-internal-secret/);}
 const redir=await getFinanceHistoricalVariantEvidence(env,input,{fetchImpl:async()=>new Response('PRIVATE',{status:302,headers:{location:'https://other.invalid'}})});assert.equal(redir.status,'UNAVAILABLE');
 const rate=await getFinanceHistoricalVariantEvidence(env,input,{fetchImpl:async()=>Response.json({error:'FINANCE_HISTORICAL_EVIDENCE_UNAVAILABLE',diagnostic:{code:'FINANCE_HISTORICAL_EVIDENCE_RATE_LIMIT',http:429}},{status:429})});assert.deepEqual(rate.diagnostic,{code:'FINANCE_HISTORICAL_EVIDENCE_RATE_LIMIT',http:429});
 const timed=await getFinanceHistoricalVariantEvidence(env,input,{timeoutMs:5,fetchImpl:async()=>new Promise(()=>{})});assert.equal(timed.diagnostic.code,'FINANCE_HISTORICAL_EVIDENCE_APP_TIMEOUT');
});
