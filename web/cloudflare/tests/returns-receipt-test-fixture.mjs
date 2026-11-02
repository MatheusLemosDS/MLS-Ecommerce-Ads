// Synthetic local SQLite evidence. No provider calls or operational records.
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {BUSINESS_MONTH_PUBLICATION_SCHEMA,saveCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {BUSINESS_RECONCILIATION_SCHEMA,runBusinessReconciliation} from '../src/business-reconciliation.mjs';
import {COST_SCHEMA,COST_DEFAULTS} from '../src/production-costs.mjs';
import {storeCatalogClassificationFrame} from '../src/catalog-classification.mjs';
import {originalItemsEnvelopeFixture} from '../../finance/tests/original-items-fixture.mjs';

export const source=originalItemsEnvelopeFixture(),stamp=source.report.checked_at,month='2026-10',now=()=>stamp*1000;
export const clone=value=>JSON.parse(JSON.stringify(value));
export class ReceiptD1 extends D1{
 constructor(){super();this.sql=[];this.beforeReceipt=null;this.failAudit=false;this.receiptBatches=0;}
 prepare(sql){this.sql.push(sql);const statement=super.prepare(sql);statement.sql=sql;return statement;}
 async batch(rows){
  if(rows[0]?.sql&&/^(INSERT OR IGNORE INTO|UPDATE) physical_returns_state/.test(rows[0].sql)){
   this.receiptBatches++;
   const before=this.beforeReceipt;this.beforeReceipt=null;if(before)before(this.db,rows);
   if(this.failAudit){this.failAudit=false;rows=rows.map(row=>row.sql?.startsWith('INSERT INTO physical_returns_audit')?{run:async()=>{throw Error('SYNTHETIC_AUDIT_STORAGE_FAILURE');}}:row);}
  }
  return super.batch(rows);
 }
}
export function catalog({kit=false,child=false,model='0',item='1000',color='Verde',name=null}={}){
 const attributes=kit?[{name:'Tamanho Masculino',value:'HOMEM G'},{name:'Tamanho Feminino',value:'MULHER M'}]:[{name:'Cor',value:color},{name:'Tamanho',value:child?'2':'M'}];
 return {schema:'variant_catalog_v1',checked_at:stamp,products:[{item_id:item,catalog_fingerprint:'c'.repeat(64),bindings:child?[]:[{item_id:item,model_id:model,...(kit?{male_size:'G',female_size:'M'}:{size:'M'})}],unresolved_count:child?1:0,...(kit?{}:{selling_unit:'SINGLE_GARMENT'}),cost_catalog:{schema:'product_cost_catalog_v1',product_name:name??(kit?'Kit casal verde':child?'Camiseta infantil unissex':'Camiseta unissex'),variants:[{model_id:model,attributes}]}}]};
}
export async function receiptFixture(t,{captured=true,catalogOptions={},evidence=null,catalogue=true,costs=true}={}){
 const db=new ReceiptD1(),env={ADMIN_DB:db};t.after(()=>db.db.close());
 const actual=clone(evidence??source),report=actual.report;
 const savedItems=actual.original_items?.orders[0]?.items;
 const frame={schema:'finance_business_period_v1',run_id:report.run_id,revision:report.source_revision,status:'COMPLETE',start_date:report.start_date,end_date:report.end_date,cutoff_at:stamp-20,checked_at:stamp,source_checked_at:{oldest_at:stamp-10,latest_at:stamp-10},currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:1,paid:1,completed:1,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1,payment_missing:0,returns:1,returns_unknown:0},known_sales_base_raw:'100',sales_base_raw:'100',known_expected_repass_raw:'80',expected_repass_raw:'80',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:0,known_base_raw:'100',known_tax_raw:'2'},items:clone(savedItems?.length?savedItems:[{item_id:'1000',model_id:'0',quantity:2}]),diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
 await db.batch(['CREATE TABLE business_month_runs(month TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)',...BUSINESS_MONTH_PUBLICATION_SCHEMA,...BUSINESS_RECONCILIATION_SCHEMA].map(sql=>db.prepare(sql)));
 const payload={start_date:frame.start_date,end_date:frame.end_date,slots:[{start_date:frame.start_date,end_date:frame.end_date,frame}]},raw=JSON.stringify(payload),row={revision:10,payload:raw,created_at:stamp-60,updated_at:stamp};
 db.db.prepare('INSERT INTO business_month_runs VALUES(?,?,?,?,?)').run(month,10,raw,row.created_at,row.updated_at);assert.ok(await saveCompletedBusinessMonth(env,month,{row,payload,complete:true},{now}));
 if(!captured){delete actual.original_items;actual.schema='finance_reconciliation_v3';}
 assert.equal((await runBusinessReconciliation(env,async()=>actual,{month},{now})).status,'CHECKED');
 if(catalogue)await storeCatalogClassificationFrame(env,catalog(catalogOptions),{now});
 if(costs){await db.batch(COST_SCHEMA.map(sql=>db.prepare(sql)));db.db.prepare('INSERT INTO production_costs_state VALUES(1,1,?,?)').run(JSON.stringify(COST_DEFAULTS),new Date(stamp*1000).toISOString());}
 db.sql=[];return {db,env,frame,source:actual};
}
export const receiptBody=workspace=>({schema:'return_receipt_confirmation_v1',revision:workspace.physical_revision,request_id:crypto.randomUUID(),case_hash:workspace.cards[0].case_hash,proposal_hash:workspace.cards[0].proposal_hash,decision:'RECEIVED_AS_SHOWN'});
export function physicalSnapshot(db){return JSON.stringify(['physical_returns_state','physical_returns_cases','physical_returns_audit'].map(table=>[table,db.db.prepare("SELECT name FROM sqlite_master WHERE name=?").get(table)?db.db.prepare('SELECT * FROM '+table).all():[]]));}
export function financialSnapshot(db){return JSON.stringify(['business_month_runs','business_month_publications','business_month_publication_frames','business_reconciliation_reports','business_reconciliation_original_items'].map(table=>[table,db.db.prepare("SELECT name FROM sqlite_master WHERE name=?").get(table)?db.db.prepare('SELECT * FROM '+table).all():[]]));}
