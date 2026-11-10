import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFixture} from './business-collection-fixture.mjs';
import {D1} from './sqlite-d1.mjs';
import {readCostRules,saveCostRules,syncCostRuleCatalog,readCostRuleReference} from '../src/cost-rules.mjs';
import {COST_SCHEMA,readProductionCosts,saveProductionCosts} from '../src/production-costs.mjs';
import {deriveCatalogProduct,deriveProductCostCatalog} from '../../finance/src/variant-catalog-frame.mjs';
import {projectHistoricalVariantEvidenceFrame} from '../../finance/src/historical-variant-evidence-frame.mjs';
import {syncHistoricalCostEvidence} from '../src/historical-cost-evidence.mjs';
import {readBusinessMonthDisplay,projectBusinessMonth} from '../src/business-month.mjs';
import {mutateIncurredProduction,readIncurredProduction,projectIncurredProduction} from '../src/incurred-production.mjs';

// Construct the legacy price through the real mutator, rather than depending on
// the default for new installations. Every fixture is synthetic and local.
async function legacyRules(env){
 const initial=await readCostRules(env),values=structuredClone(initial.values);
 const child=values.rules.find(row=>row.id==='camiseta-infantil');assert.ok(child);
 child.unit_cost_cents=1250;child.options=[...new Set(['2',...child.options])];
 values.rules.push({...child,id:'unrelated-baggy',label:'Calça sintética',unit_cost_cents:2550,name_patterns:['calca baggy'],exclude_terms:[],axis_names:[],options:[]});
 values.assignments=[{item_id:'900',model_id:null,rule_id:'unrelated-baggy',size:null}];
 return saveCostRules(env,{revision:initial.revision,values},'synthetic-legacy-owner');
}
const childPrice=(state,amount)=>({revision:state.revision,values:{...structuredClone(state.values),rules:state.values.rules.map(rule=>({...structuredClone(rule),...(rule.id==='camiseta-infantil'?{unit_cost_cents:amount}:{})}))}});

test('editing the persisted child price to1350 preserves every other rule field and assignment with audited CAS',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());
 const before=await legacyRules(env),input=childPrice(before,1350),untouched=JSON.stringify(input),saved=await saveCostRules(env,input,'synthetic-owner-price-correction');
 assert.equal(saved.revision,before.revision+1);assert.deepEqual(saved.values,input.values);assert.equal(JSON.stringify(input),untouched,'the caller draft is not mutated');
 assert.deepEqual(saved.values.assignments,before.values.assignments);
 for(const rule of before.values.rules)assert.deepEqual(saved.values.rules.find(row=>row.id===rule.id),{...rule,...(rule.id==='camiseta-infantil'?{unit_cost_cents:1350}:{})});
 const audit=env.ADMIN_DB.db.prepare('SELECT revision,payload,actor FROM production_cost_rules_audit ORDER BY revision').all();
 assert.equal(JSON.parse(audit.at(-2).payload).rules.find(row=>row.id==='camiseta-infantil').unit_cost_cents,1250);
 assert.equal(JSON.parse(audit.at(-1).payload).rules.find(row=>row.id==='camiseta-infantil').unit_cost_cents,1350);assert.equal(audit.at(-1).actor,'synthetic-owner-price-correction');
 const persisted=await readCostRules(env),auditBefore=JSON.stringify(audit);
 await assert.rejects(saveCostRules(env,childPrice(before,1400),'stale-synthetic-owner'),error=>error.status===409&&error.message==='COST_RULES_CHANGED_RELOAD');
 assert.deepEqual(await readCostRules(env),persisted);assert.equal(JSON.stringify(env.ADMIN_DB.db.prepare('SELECT revision,payload,actor FROM production_cost_rules_audit ORDER BY revision').all()),auditBefore);
});

async function pricedHistory(t){
 const f=await collectionFixture({daily:true,allPaid:true,windowCounts:[4,1],paymentDelayMs:0});
 t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 const model=index=>String(100+index),quantity=index=>index===0?2:index===1?3:1;
 f.state.detailHook=({ids})=>f.provider({order_list:ids.map(index=>({order_sn:f.serial(index),order_status:'COMPLETED',currency:'BRL',create_time:Date.UTC(2026,9,index<60?10:20,12)/1000,item_list:[{item_id:f.item(index),model_id:Number(model(index)),model_quantity_purchased:quantity(index)}]}))});
 f.state.paymentHook=({index})=>f.provider({order_sn:f.serial(index),return_order_sn_list:[],order_income:{order_sn:f.serial(index),original_cost_of_goods_sold:65.25,escrow_amount:47.51,ads_escrow_top_up_fee_or_technical_support_fee:0,items:[{item_id:f.item(index),model_id:Number(model(index)),line_item_id:index+1,quantity_purchased:quantity(index)}]}});
 await legacyRules(f.env);
 await f.env.ADMIN_DB.batch(COST_SCHEMA.map(sql=>f.env.ADMIN_DB.prepare(sql)));
 const currentCosts=await readProductionCosts(f.env),values={...currentCosts.values,inclusive_plus_cents:2140,custom_profiles:[{id:'manual-child-exception',label:'Exceção infantil preservada',unit_cost_cents:999}],custom_assignments:[{item_id:String(f.item(3)),model_id:model(3),profile_id:'manual-child-exception'}]};
 await saveProductionCosts(f.env,{revision:currentCosts.revision,values},'synthetic-owner-existing-exception');
 const definitions=[
  {index:0,name:'Camiseta Infantil Atual',axes:[['Cor',['Azul']],['Tamanho',['4']]]},
  {index:2,name:'Camiseta Adulta',axes:[['Cor',['Azul']],['Tamanho',['G1']]]},
  {index:3,name:'Camiseta Infantil Exceção',axes:[['Cor',['Azul']],['Tamanho',['6']]]},
  {index:60,name:'Kit Casal Camisetas',axes:[['Tamanho Feminino',['P']],['Tamanho Masculino',['M']]]},
 ];
 let catalogCalls=0;
 for(let offset=0;offset<definitions.length;offset+=3){const selected=definitions.slice(offset,offset+3);await syncCostRuleCatalog(f.env,selected.map(row=>String(f.item(row.index))),async()=>{
  catalogCalls++;const products=[];for(const definition of selected){const raw={tier_variation:definition.axes.map(([name,options])=>({name,option_list:options.map(option=>({option}))})),model:[{model_id:Number(model(definition.index)),tier_index:[0,0]}]},product=await deriveCatalogProduct(String(f.item(definition.index)),raw,{selling_unit:'AUTO'});product.cost_catalog=deriveProductCostCatalog(raw,definition.name);products.push(product);}
  return {schema:'variant_catalog_v1',checked_at:Math.floor(f.now()/1000),products};
 },{now:f.now});}
 let historicalCalls=0;
 const history=async(_,input)=>{
  historicalCalls++;const present=input.start_date==='2026-10-01',variant={model_id:model(1),line_count:1,quantity:3,item_names:['Camiseta Infantil Histórica'],model_names:['Azul, 2'],missing_item_name_lines:0,missing_model_name_lines:0,status_counts:[{status:'COMPLETED',line_count:1,quantity:3}],conflict:false};
  const frame={schema:'historical_variant_evidence_v1',shop_id:1178167501,checked_at:Math.floor(f.now()/1000),...input,has_more:false,next_cursor:null,coverage:{orders_seen:present?1:0,target_orders:present?1:0,target_lines:present?1:0,target_units:present?3:0},evidence_complete:true,products:input.item_ids.map(item_id=>({item_id,variants:present?[variant]:[]})),omitted:{target_lines:0,target_units:0}};
  assert.ok(projectHistoricalVariantEvidenceFrame(frame));return frame;
 };
 let evidence=await syncHistoricalCostEvidence(f.env,{month:'2026-10',item_ids:[String(f.item(1))]},history,{now:f.now});
 for(let n=0;!evidence.scan.complete&&n<4;n++)evidence=await syncHistoricalCostEvidence(f.env,{month:'2026-10',item_ids:[String(f.item(1))]},history,{now:f.now});
 assert.equal(evidence.scan.complete,true);
 const reference=await readCostRuleReference(f.env,[String(f.item(1))],{now:f.now});assert.equal(reference.historical_compositions[0].kind,'CHILD_SINGLE');assert.equal(reference.historical_compositions[0].unit_cost_cents,1250);
 let monthly=await f.invoke('start');for(let n=0;monthly.status==='RUNNING'&&n<20;n++)monthly=await f.invoke('step');assert.equal(monthly.status,'COMPLETE');await f.invoke('ads');
 return {...f,model,callsAt:()=>({finance:structuredClone(f.calls),catalog:catalogCalls,historical:historicalCalls})};
}

test('1350 reprices current and historical infant sales from saved evidence while adults kits and manual exceptions stay intact',async t=>{
 const f=await pricedHistory(t),before=await readBusinessMonthDisplay(f.env,{month:'2026-10'},{now:f.now});assert.ok(projectBusinessMonth(before.display));
 const source=JSON.stringify(before.source_frames),coverage=structuredClone(before.display.coverage),times=structuredClone(before.display.source_checked_at),calls=f.callsAt(),costState=await readProductionCosts(f.env),rules=await readCostRules(f.env);
 const byId=frame=>new Map(frame.product_summary.products.flatMap(product=>product.variants.map(variant=>[product.item_id+':'+variant.model_id,variant])));
 const old=byId(before.display);assert.equal(old.get('1000:100').unit_cost_cents,1250);assert.equal(old.get('1001:101').unit_cost_cents,1250);assert.equal(old.get('1002:102').unit_cost_cents,2140);assert.equal(old.get('1003:103').unit_cost_cents,999);assert.equal(old.get('1060:160').unit_cost_cents,3180);
 // October was current when collected. Reopen its immutable published slice
 // in November: a price correction must not require collecting the month again.
 f.clock.time=Date.UTC(2026,10,9,12);
 await saveCostRules(f.env,childPrice(rules,1350),'synthetic-owner-retroactive-child-price');
 const after=await readBusinessMonthDisplay(f.env,{month:'2026-10'},{now:f.now});assert.ok(projectBusinessMonth(after.display));const changed=byId(after.display);
 for(const key of ['1000:100','1001:101'])assert.equal(changed.get(key).unit_cost_cents,1350);
 for(const key of ['1002:102','1003:103','1060:160'])assert.deepEqual(changed.get(key),old.get(key),'unrelated or explicitly overridden values stay intact');
 assert.equal(after.display.production_cost_cents,before.display.production_cost_cents+500,'five eligible commercial units increase by100cents once');assert.equal(after.display.known_production_cost_cents,before.display.known_production_cost_cents+500);
 assert.equal(after.display.cost_rules_revision,rules.revision+1);assert.equal(after.display.costs_revision,before.display.costs_revision);assert.deepEqual(await readProductionCosts(f.env),costState);
 for(const key of ['sales_cents','known_sales_cents','expected_repass_cents','known_expected_repass_cents','invoice_tax_cents','ads_adjustment_cents','start_date','end_date'])assert.equal(after.display[key],before.display[key],key+' must not be reimported or reallocated');
 assert.deepEqual(after.display.coverage,coverage);assert.deepEqual(after.display.source_checked_at,times);assert.equal(JSON.stringify(after.source_frames),source);assert.deepEqual(f.callsAt(),calls,'all financial sources, catalog and historical evidence remain cached');
});

test('saving an infant sales rule never silently rewrites actual manufacture snapshots or deducts their ledger twice',async t=>{
 const f=await pricedHistory(t),before=await readBusinessMonthDisplay(f.env,{month:'2026-10'},{now:f.now});
 const manufactured=await mutateIncurredProduction(f.env,{revision:0,request_id:crypto.randomUUID(),action:'record',record_id:crypto.randomUUID(),production_ref:'SIMULADO: fabricação infantil antiga',replaces_record_id:null,produced_date:'2026-10-08',quantity:4,identity:{artwork:'Arte sintética',color:'Azul',size:'2',garment_type:'CHILD',fit:'UNISEX',confirmed:true,item_id:'1001',model_id:'101',sku:null},source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:1250,reference:null},evidence:'SIMULADO: fato e custo históricos declarados',confirmed:true},'synthetic-manufacturing-owner',{now:f.now});
 assert.ok(projectIncurredProduction(manufactured));assert.equal(manufactured.summary.total_cost_cents,5000);
 const stored=f.env.ADMIN_DB.db.prepare('SELECT * FROM incurred_production_records ORDER BY record_id').all(),audit=f.env.ADMIN_DB.db.prepare('SELECT * FROM incurred_production_audit ORDER BY revision').all();
 const rules=await readCostRules(f.env);await saveCostRules(f.env,childPrice(rules,1350),'synthetic-owner-sales-price');
 assert.deepEqual(await readIncurredProduction(f.env,{now:f.now}),manufactured);assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT * FROM incurred_production_records ORDER BY record_id').all(),stored);assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT * FROM incurred_production_audit ORDER BY revision').all(),audit);
 const after=await readBusinessMonthDisplay(f.env,{month:'2026-10'},{now:f.now});assert.equal(after.display.production_cost_cents,before.display.production_cost_cents+500,'the separate5000cent manufacturing journal is not added to the financial cost');
 assert.equal(manufactured.financial_integration_allowed,false);
});
