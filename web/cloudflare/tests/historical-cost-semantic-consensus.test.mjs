import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {HISTORICAL_COST_EVIDENCE_SCHEMA,deriveHistoricalCostComposition,deriveHistoricalCompositionConsensus,historicalCostEvidenceSnapshotQueries,historicalCostEvidenceFromSnapshot,historicalCostPairDiagnosticsQueries,historicalCostPairDiagnosticsFromSnapshot,historicalCostPairDiagnosticsEvidenceFromSnapshot,projectHistoricalCostPairDiagnostics,projectHistoricalCostPairDiagnosticsEvidence,syncHistoricalCostEvidence} from '../src/historical-cost-evidence.mjs';
const at=Date.UTC(2026,9,25,12),now=()=>at,stamp=at/1000,month='2026-10',pair={item_id:'58219210514',model_id:'219195030703'},title='Camiseta Brasil Bolsonaro Acima de Tudo Deus Acima de Todos Amarela 100% Algodão Unissex P ao G3';
// The item title/IDs are real diagnostic evidence. Every model label here is
// a synthetic regression case; the live alternatives are not yet known.
const names=(models,extra={})=>({item_names:[title],model_names:models,missing_item_name:false,missing_model_name:false,conflict:models.length>1,overflow:false,...extra});
const project=value=>projectHistoricalCostPairDiagnosticsEvidence(value,{deriveComposition:deriveHistoricalCostComposition,projectLegacy:projectHistoricalCostPairDiagnostics});
async function fixture(t){const db=new D1();t.after(()=>db.db.close());await db.batch(HISTORICAL_COST_EVIDENCE_SCHEMA.map(sql=>db.prepare(sql)));return db;}
function save(db,payload,approved=1,p=pair){db.db.prepare('INSERT OR REPLACE INTO historical_cost_evidence_names VALUES(?,?,?,?,?,?)').run(p.item_id,p.model_id,JSON.stringify(payload),approved,stamp-60,stamp);}
const evidence=async(db,pairs=[pair])=>historicalCostPairDiagnosticsEvidenceFromSnapshot(await db.batch(historicalCostPairDiagnosticsQueries(db,month,pairs)),{now});

test('all observed spellings must prove the same exact composition; no alternative or size is silently discarded',()=>{
 let result=deriveHistoricalCompositionConsensus(names(['Amarela / g1','Amarelo/G1']));assert.equal(result.kind,'EXACT_COMPOSITION');assert.equal(result.reason,'SEMANTIC_COMPOSITION_CONSENSUS');assert.equal(result.combinations,2);assert.deepEqual(result.compositions,[{kind:'ADULT_SINGLE',size:'G1',male_size:null,female_size:null,child_size:null}]);
 result=deriveHistoricalCompositionConsensus(names(['Amarela / P','Amarela / GG']));assert.equal(result.kind,'COST_CANDIDATES');assert.deepEqual(new Set(result.compositions.map(row=>row.size)),new Set(['P','GG']));assert.equal(result.combinations,2);
 for(const label of ['Amarela / G 1','Amarela / G-1','Amarela / G.3']){assert.equal(deriveHistoricalCostComposition(title,label),null);assert.equal(deriveHistoricalCompositionConsensus(names(['Amarela / G1',label])).kind,'CONFLICT');}
 for(const payload of [names(['G','XGG']),names(['G','G1 / GG']),names(['G'],{missing_model_name:true}),names(['G','GG'],{overflow:true}),names(['G'],{conflict:true}),names(['G','4'],{item_names:['Camiseta Infantil']}),names(['HOMEM G / MULHER GG','G'],{item_names:['Kit Casal Camisetas']})])assert.equal(deriveHistoricalCompositionConsensus(payload).kind,'CONFLICT');
 assert.equal(deriveHistoricalCompositionConsensus(names(['G','GG']),{approved:false}).reason,'UNAPPROVED_SCAN');
 const child=deriveHistoricalCompositionConsensus(names(['Azul / 4','Azul - 4'],{item_names:['Camiseta Infantil']}));assert.equal(child.compositions[0].child_size,'4');
 const kit=deriveHistoricalCompositionConsensus(names(['HOMEM G MULHER GG','MULHER GG / HOMEM G'],{item_names:['Kit Casal Camisetas']}));assert.equal(kit.kind,'EXACT_COMPOSITION');assert.equal(kit.compositions[0].male_size,'G');assert.equal(kit.compositions[0].female_size,'GG');
});

test('D1 snapshot emits exact semantic composition or every candidate while preserving raw conflict and legacy v1',async t=>{
 const db=await fixture(t);save(db,names(['Amarela / g1','Amarelo/G1']));const raw=db.db.prepare('SELECT payload FROM historical_cost_evidence_names').get().payload;
 let reference=historicalCostEvidenceFromSnapshot(await db.batch(historicalCostEvidenceSnapshotQueries(db,[pair.item_id])),{now});assert.equal(reference.compositions[0].size,'G1');assert.deepEqual(reference.equivalent_candidates,[]);
 const snapshot=await db.batch(historicalCostPairDiagnosticsQueries(db,month,[pair])),old=historicalCostPairDiagnosticsFromSnapshot(snapshot,{now}),current=historicalCostPairDiagnosticsEvidenceFromSnapshot(snapshot,{now});assert.equal(old.pairs[0].state,'CONFLICT');assert.equal(old.pairs[0].approved,false);assert.equal(old.pairs[0].composition,null);assert.equal(current.pairs[0].state,'APPROVED');assert.equal(current.pairs[0].name_flags.conflict,true);assert.deepEqual(current.pairs[0].model_names,['Amarela / g1','Amarelo/G1']);assert.equal(current.pairs[0].model_name,null);assert.ok(project(current));assert.equal(db.db.prepare('SELECT payload FROM historical_cost_evidence_names').get().payload,raw);
 save(db,names(['P','GG']));reference=historicalCostEvidenceFromSnapshot(await db.batch(historicalCostEvidenceSnapshotQueries(db,[pair.item_id])),{now});assert.deepEqual(reference.compositions,[]);assert.equal(reference.equivalent_candidates[0].candidates.length,2);assert.equal(reference.equivalent_candidates[0].provenance,'HISTORICAL_ORDER_EVIDENCE');assert.doesNotMatch(JSON.stringify(reference),/unit_cost|quantity|1590|price|amount/);assert.equal((await evidence(db)).pairs[0].state,'COST_CANDIDATES');
 save(db,names(['P','unsupported']));assert.deepEqual(historicalCostEvidenceFromSnapshot(await db.batch(historicalCostEvidenceSnapshotQueries(db,[pair.item_id])),{now}).equivalent_candidates,[]);assert.equal((await evidence(db)).pairs[0].resolution.reason,'UNSUPPORTED_ALTERNATIVE');
});

test('a new name set revokes previous approval until the bounded repeat scan completes',async t=>{
 const db=await fixture(t),env={ADMIN_DB:db},input={month,item_ids:[pair.item_id]};save(db,names(['Amarela G']));const source=async(_,request)=>({schema:'historical_variant_evidence_v1',shop_id:1178167501,checked_at:stamp,...request,has_more:false,next_cursor:null,coverage:{orders_seen:1,target_orders:1,target_lines:1,target_units:1},evidence_complete:true,products:[{item_id:pair.item_id,variants:[{model_id:pair.model_id,line_count:1,quantity:1,item_names:[title],model_names:['Amarelo/G'],missing_item_name_lines:0,missing_model_name_lines:0,status_counts:[{status:'COMPLETED',line_count:1,quantity:1}],conflict:false}]}],omitted:{target_lines:0,target_units:0}});
 await syncHistoricalCostEvidence(env,input,source,{now});assert.equal(db.db.prepare('SELECT approved FROM historical_cost_evidence_names').get().approved,0);assert.equal((await evidence(db)).pairs[0].resolution.reason,'UNAPPROVED_SCAN');assert.deepEqual(historicalCostEvidenceFromSnapshot(await db.batch(historicalCostEvidenceSnapshotQueries(db,[pair.item_id])),{now}).compositions,[]);
 await syncHistoricalCostEvidence(env,input,source,{now});assert.equal(db.db.prepare('SELECT approved FROM historical_cost_evidence_names').get().approved,1);assert.equal((await evidence(db)).pairs[0].resolution.kind,'EXACT_COMPOSITION');
});

test('v2 rejects fabricated consensus, missing candidates, accessors and private fields, including in a standalone browser realm',async t=>{
 const db=await fixture(t);save(db,names(['P','GG']));const value=await evidence(db);assert.ok(project(value));
 for(const mutate of [row=>row.resolution.compositions.pop(),row=>row.model_names.push('G1'),row=>row.resolution.combinations=1,row=>row.resolution.compositions[0].size='G3',row=>row.resolution.private_token='PRIVATE',row=>{row.state='APPROVED';row.composition=row.resolution.compositions[0];row.resolution.kind='EXACT_COMPOSITION';}]){const bad=structuredClone(value);mutate(bad.pairs[0]);assert.equal(project(bad),null);}
 let invoked=0;const bad=structuredClone(value);Object.defineProperty(bad.pairs[0],'model_names',{enumerable:true,get(){invoked++;return ['G'];}});assert.equal(project(bad),null);assert.equal(invoked,0);
 const context=vm.createContext({TextEncoder,raw:JSON.stringify(value)});for(const fn of [deriveHistoricalCostComposition,projectHistoricalCostPairDiagnostics,projectHistoricalCostPairDiagnosticsEvidence])new vm.Script(fn.toString()).runInContext(context);const serialized=vm.runInContext('JSON.stringify(projectHistoricalCostPairDiagnosticsEvidence(JSON.parse(raw),{deriveComposition:deriveHistoricalCostComposition,projectLegacy:projectHistoricalCostPairDiagnostics}))',context);assert.deepEqual(JSON.parse(serialized),value);
});

test('v2 preserves complete alternatives while explicitly truncating pairs at its byte limit',async t=>{
 const db=await fixture(t),pairs=Array.from({length:100},(_,index)=>({...pair,model_id:String(index)}));for(const p of pairs)save(db,names(Array.from({length:5},(_,index)=>'Azul '+String(index)+' '+('x'.repeat(450))+' G'),{item_names:Array.from({length:5},(_,index)=>'Camiseta Estrela '+String(index)+' '+('x'.repeat(900))),conflict:true}),1,p);
 const value=await evidence(db,pairs);assert.ok(value.pairs.length>0&&value.pairs.length<90);assert.equal(value.truncation.pairs_total,100);assert.equal(value.truncation.pairs_included,value.pairs.length);assert.equal(value.truncation.truncated,true);for(const p of value.pairs){assert.equal(p.item_names.length,5);assert.equal(p.model_names.length,5);}assert.ok(new TextEncoder().encode(JSON.stringify(value)).byteLength<=65536);assert.ok(project(value));assert.doesNotMatch(JSON.stringify(value),/scope_key|run_id|cursor|order_sn|access_token|buyer|customer/);
});
