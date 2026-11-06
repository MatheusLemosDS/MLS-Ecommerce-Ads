import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {dailyProductionFixture,dailyProductionClock} from './production-daily-browser-fixture.mjs';
import {readIncurredProductionWorkspace} from '../src/incurred-production-workspace.mjs';
import {readProductionConfirmationProposal} from '../src/production-confirmation-proposal.mjs';
import {storeCatalogClassificationFrame} from '../src/catalog-classification.mjs';
import {COST_DEFAULTS,COST_SCHEMA} from '../src/production-costs.mjs';

// Synthetic saved sales context is deliberately distinct from the independently
// declared physical ledger and the complete, immutable financial baseline.
export const proposalClock=dailyProductionClock;
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const sourceRows=[
 {name:'single',item_id:'91001',model_id:'92001',sku:'QA-SAVED-SINGLE-M',quantity:7,model_name:'Preto / M',requires_pair:false},
 {name:'kit',item_id:'91002',model_id:'92002',sku:'QA-SAVED-KIT-P-GG',quantity:2,model_name:'Kit P + GG',requires_pair:true},
 {name:'unknown',item_id:'91003',model_id:'92003',sku:'QA-SAVED-UNKNOWN',quantity:5,model_name:'Variação sem catálogo',requires_pair:false},
];

export async function proposalBrowserFixture(){
 const finance=await dailyProductionFixture(),env=finance.env,db=env.ADMIN_DB,stamp=proposalClock/1000,now=()=>proposalClock;
 try{
  db.db.exec('CREATE TABLE production_dtf_orders(order_id TEXT PRIMARY KEY,status TEXT,checked_at INTEGER,source_hash TEXT); CREATE TABLE production_dtf_lines(unit_key TEXT PRIMARY KEY,order_id TEXT,line_key TEXT,payload TEXT,source_hash TEXT,checked_at INTEGER,missing INTEGER); CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);');
  await db.batch(COST_SCHEMA.map(sql=>db.prepare(sql)));
  const costs={...COST_DEFAULTS,inclusive_regular_cents:1590,inclusive_plus_cents:2140,components:[]};
  db.db.prepare('INSERT INTO production_costs_state VALUES(1,7,?,?)').run(JSON.stringify(costs),new Date(proposalClock-60000).toISOString());
  db.db.prepare('INSERT INTO variant_bindings_state VALUES(1,4,?,?)').run(JSON.stringify([{item_id:'91001',model_id:'92001',selling_unit:'SINGLE_GARMENT',size:'M',operator_confirmed:true},{item_id:'91002',model_id:'92002',selling_unit:'ONE_MALE_ONE_FEMALE_KIT',male_size:'P',female_size:'GG',operator_confirmed:true}]),new Date(proposalClock-60000).toISOString());
  db.db.prepare('UPDATE production_cost_rules_state SET updated_at=?').run(new Date(proposalClock-60000).toISOString());
  for(const row of sourceRows){
   const serial='SYNTHETIC-PROPOSAL-ORDER-'+row.name,line_key=row.item_id+':'+row.model_id;
   const payload=JSON.stringify(Object.fromEntries(['item_id','model_id','sku','quantity','model_name','requires_pair'].map(key=>[key,row[key]])));
   db.db.prepare('INSERT INTO production_dtf_orders VALUES(?,?,?,?)').run(serial,'READY_TO_SHIP',stamp-30,sha('synthetic-order-'+row.name));
   db.db.prepare('INSERT INTO production_dtf_lines VALUES(?,?,?,?,?,?,?)').run(sha([serial,line_key]),serial,line_key,payload,sha(payload),stamp-30,0);
  }
  const frame={schema:'variant_catalog_v1',checked_at:stamp-20,products:[
   {item_id:'91001',catalog_fingerprint:'a'.repeat(64),selling_unit:'SINGLE_GARMENT',bindings:[{item_id:'91001',model_id:'92001',size:'M'}],unresolved_count:0,cost_catalog:{schema:'product_cost_catalog_v1',product_name:'Camiseta sintética de QA',variants:[{model_id:'92001',attributes:[{name:'Cor',value:'Preto'},{name:'Tamanho',value:'M'}]}]}},
   {item_id:'91002',catalog_fingerprint:'b'.repeat(64),bindings:[{item_id:'91002',model_id:'92002',male_size:'P',female_size:'GG'}],unresolved_count:0,cost_catalog:{schema:'product_cost_catalog_v1',product_name:'Kit 2 camisetas sintético casal de QA',variants:[{model_id:'92002',attributes:[{name:'Tamanho Masculino',value:'HOMEM P'},{name:'Tamanho Feminino',value:'MULHER GG'}]}]}},
  ]};
  await storeCatalogClassificationFrame(env,frame,{now});
  const read=selection=>readIncurredProductionWorkspace(env,selection,{now});
  const initial=await read({month:'2026-10',week_of:'2026-10-25'});
  const sources=Object.fromEntries(sourceRows.map(row=>[row.name,initial.source.candidates.find(candidate=>candidate.item_id===row.item_id)]));
  for(const source of Object.values(sources))assert.ok(source);
  const active=initial.ledger.records.find(row=>row.production_ref==='QA SINTÉTICA fabricação 11');
  assert.equal(active?.status,'ACTIVE','the correction draft selects a known ACTIVE fixture record, never random UUID order');
  const proposal=input=>readProductionConfirmationProposal(env,input,{now});
  const single=await proposal({source_key:sources.single.key,source_hash:sources.single.hash}),kit=await proposal({source_key:sources.kit.key,source_hash:sources.kit.hash});
  assert.equal(single.catalog.state,'AVAILABLE');assert.equal(single.composition.components[0].identity.size,'M');assert.equal(single.cost.unit_cost_cents,1590,JSON.stringify(single));
  assert.equal(kit.composition.components.length,2);assert.equal(kit.cost.unit_cost_cents,3180,JSON.stringify(kit));assert.equal(kit.cost.scope,'COMMERCIAL_UNIT');
  const tables=()=>db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row=>row.name);
  const canonical=()=>JSON.stringify(tables().map(name=>[name,db.db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()]));
  return {env,finance,now,read,proposal,sources,active_record_id:active.record_id,canonical,snapshot:()=>finance.snapshot(),
   close:()=>finance.close()};
 }catch(error){finance.close();throw error;}
}
