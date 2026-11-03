import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {createFinanceStore} from '../../finance/src/connection-store.mjs';
import {runFinanceBusinessPeriod} from '../../finance/src/business-period.mjs';
import {projectBusinessPeriodVariantsFrame} from '../../finance/src/business-variant-attribution.mjs';
import {buildBusinessMonthProducts,projectBusinessMonthProducts} from '../src/business-month-products.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {buildBusinessMonthVariantContributions,projectBusinessMonthVariantContributions} from '../src/business-variant-attribution.mjs';
import {buildBusinessMonthView,projectBusinessMonthView,projectBusinessMonthAuditScope} from '../src/business-month-view-state.mjs';
import {projectDailyBusinessSummary} from '../src/business-daily-summary.mjs';
import {projectExpenseSchedule} from '../src/expense-schedule.mjs';
import {completeWorkspaceFrame,workspaceClock,workspaceStamp} from './monthly-workspace-browser-fixture.mjs';

// Synthetic data only. Every exported financial fixture crosses the actual
// cached-order Finance collector, its opt-in envelope, and both App projectors.
const sources=new Map();
const rawCents=value=>{const match=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);assert.ok(match);const n=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));return Number(match[1]?-n:n);};
const single=(item,model,quantity=1)=>[{item_id:item,model_id:model,model_quantity_purchased:quantity}];
const scenarioRows=({missingPayment=false,review=false}={})=>[
 {window:0,items:single(501,1,2),sales:100,payout:80,adjustment:1.18},
 {window:1,items:single(501,2),sales:50,payout:37},
 {window:0,items:[...single(501,1),...single(501,2)],sales:70,payout:49},
 {window:1,items:[...single(501,1),...single(502,1)],sales:60,payout:40},
 {window:0,items:single(503,1,2),sales:100,payout:78},
 {window:1,items:single(504,1),sales:30,payout:15},
 {window:0,items:single(505,1),sales:25,payout:15.9},
 {window:1,items:single(506,1),sales:20,payout:16,returns:true},
 {window:0,items:single(507,1),sales:20,payout:15},
 {window:0,items:single(509,1),sales:0.25,payout:0.2},
 {window:1,items:single(509,1),sales:0.25,payout:0.2},
 {window:0,items:single(511,1),status:'CANCELLED'},
 {window:1,items:single(511,1),status:'UNPAID'},
 ...(missingPayment?[{window:1,items:single(508,1),status:'READY_TO_SHIP',missingPayment:true}]:[]),
 ...(review?[{window:1,items:single(511,1),status:'TO_RETURN'}]:[]),
];

async function collectSources({month='2026-10',missingPayment=false,review=false}={}){
 const key=JSON.stringify({month,missingPayment,review});
 if(!sources.has(key))sources.set(key,(async()=>{
  const [year,m]=month.split('-').map(Number),end=month==='2026-10'?25:30,db=new D1();
  const now=()=>workspaceClock,env={FINANCE_DB:db,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,47).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:'synthetic-variant-order-partner-key'};
  const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:'SYNTHETIC_VARIANT_ACCESS',refresh_token:'SYNTHETIC_VARIANT_REFRESH',expires_at:workspaceStamp+14400});
  const rows=scenarioRows({missingPayment,review}).map((row,index)=>({...row,serial:'SYNTHETIC_VARIANT_ORDER_'+String(index).padStart(3,'0'),status:row.status??'COMPLETED'}));
  let calls=0;
  const provider=response=>Response.json({error:'',response});
  const fetchImpl=async request=>{
   calls++;const url=new URL(request.url);assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(request.method,'GET');
   if(url.pathname==='/api/v2/order/get_order_list'){
    const from=Number(url.searchParams.get('time_from')),window=new Date(from*1000).getUTCDate()>15?1:0;
    assert.equal(url.searchParams.get('cursor'),'');return provider({order_list:rows.filter(row=>row.window===window).map(row=>({order_sn:row.serial,order_status:row.status})),more:false,next_cursor:''});
   }
   if(url.pathname==='/api/v2/order/get_order_detail'){
    const selected=url.searchParams.get('order_sn_list').split(',').map(serial=>rows.find(row=>row.serial===serial));assert.ok(selected.every(Boolean));
    return provider({order_list:selected.map(row=>({order_sn:row.serial,order_status:row.status,currency:'BRL',create_time:Date.UTC(year,m-1,row.window?20:5,12)/1000,item_list:row.items}))});
   }
   assert.equal(url.pathname,'/api/v2/payment/get_escrow_detail');const row=rows.find(row=>row.serial===url.searchParams.get('order_sn'));assert.ok(row);
   if(row.missingPayment)return Response.json({error:'order_not_found'});
   return provider({order_sn:row.serial,return_order_sn_list:row.returns?['SYNTHETIC_VARIANT_RETURN']:[],order_income:{order_sn:row.serial,original_cost_of_goods_sold:row.sales,escrow_amount:row.payout,ads_escrow_top_up_fee_or_technical_support_fee:row.adjustment??0,items:row.items.map((item,index)=>({item_id:item.item_id,model_id:item.model_id,line_item_id:index+1,quantity_purchased:item.model_quantity_purchased}))}});
  };
  try{
   const envelopes=[];
   for(const [first,last]of [[1,15],[16,end]]){
    let result=await runFinanceBusinessPeriod(env,{operation:'start',start_date:month+'-'+String(first).padStart(2,'0'),end_date:month+'-'+String(last).padStart(2,'0'),includeVariants:true,includeDaily:true,fetchImpl,now});
    for(let count=0;result.report?.status==='RUNNING'&&count<20;count++)result=await runFinanceBusinessPeriod(env,{operation:'step',run_id:result.report.run_id,includeVariants:true,includeDaily:true,fetchImpl,now});
    const checked=await projectBusinessPeriodVariantsFrame(result);assert.ok(checked?.variant_financials,'actual source collector must produce a canonical cached-order aggregate');assert.equal(checked.report.status,'COMPLETE');envelopes.push(checked);
   }
   return {envelopes,provider_calls:calls};
  }finally{db.db.close();}
 })());
 return structuredClone(await sources.get(key));
}

const unitCost=(item,model,costDelta)=>item==='507'?null:item==='503'?3180:item==='504'||item==='501'&&model==='2'?2140:item==='506'?1250:item==='509'?0:1590+(item==='501'&&model==='1'?costDelta:0);

export async function variantOrderFixture({month='2026-10',costDelta=0,revision=1,captured='all',stale=false,missingPayment=false,review=false,mei=true}={}){
 const collected=await collectSources({month,missingPayment,review}),sourceFrames=collected.envelopes.map(row=>row.report),base=completeWorkspaceFrame({month,review:false,at:workspaceStamp});
 const coverage=Object.fromEntries(Object.keys(base.coverage).map(name=>[name,sourceFrames.reduce((sum,row)=>sum+row.coverage[name],0)]));
 const totals=key=>sourceFrames.reduce((sum,row)=>sum+rawCents(row[key]),0),allItems=new Map();
 for(const source of sourceFrames)for(const item of source.items){const key=item.item_id+':'+item.model_id;const old=allItems.get(key);allItems.set(key,{...item,quantity:item.quantity+(old?.quantity??0)});}
 const references=[...allItems.values()].map(item=>{const cost=unitCost(item.item_id,item.model_id,costDelta);return {...item,unit_cost_cents:cost,production_cost_cents:cost===null?null:cost*item.quantity};});
 const knownProduction=references.reduce((sum,row)=>sum+(row.production_cost_cents??0),0),unmapped=references.filter(row=>row.unit_cost_cents===null).map(({item_id,model_id,quantity})=>({item_id,model_id,quantity}));
 const pending=[...(coverage.cancel_pending+coverage.other+coverage.unknown?['STATUS_REVIEW_REQUIRED']:[]),...(coverage.payment_missing?['PAYMENT_INCOMPLETE']:[]),...(coverage.returns+coverage.returns_unknown?['RETURNS_NOT_RECONCILED']:[]),...(unmapped.length?['PRODUCTION_COST_INCOMPLETE']:[]),...(stale?['FINANCIAL_SOURCE_STALE']:[]),...(coverage.payment_missing?['ADJUSTMENT_UNAVAILABLE']:[])];
 const sales=totals('known_sales_base_raw'),payout=totals('known_expected_repass_raw'),adsAdjustment=totals('known_ads_adjustment_raw'),legacyTax=sourceFrames.reduce((sum,row)=>sum+rawCents(row.invoice_tax.known_tax_raw),0);
 const frame={...base,checked_at:workspaceStamp,coverage,progress:{windows_total:2,windows_complete:2,pages_read:sourceFrames.reduce((sum,row)=>sum+row.pages_read,0),order_capacity:sourceFrames.reduce((sum,row)=>sum+row.pages_read*(row.page_capacity??5),0)},
  sales_cents:coverage.payment_missing?null:sales,known_sales_cents:sales,expected_repass_cents:coverage.payment_missing?null:payout,known_expected_repass_cents:payout,
  production_cost_cents:unmapped.length?null:knownProduction,known_production_cost_cents:knownProduction,
  invoice_tax_cents:mei?base.invoice_tax_cents:coverage.payment_missing?null:legacyTax,known_invoice_tax_cents:mei?base.known_invoice_tax_cents:legacyTax,
  ads_adjustment_cents:coverage.payment_missing?null:adsAdjustment,unmapped_variants:unmapped,costs_revision:base.costs_revision+revision-1,classification_revision:1,
  source_checked_at:{finance_oldest_at:stale?workspaceStamp-1000:Math.min(...sourceFrames.map(row=>row.source_checked_at?.oldest_at??row.cutoff_at)),finance_latest_at:Math.max(...sourceFrames.map(row=>row.source_checked_at?.latest_at??row.checked_at)),ads_at:base.ads.fetched_at},
  result:{...base.result,net_estimate_cents:null,net_margin_bps:null,pending},product_summary:null};
 if(!mei)delete frame.tax;
 if(!pending.length){frame.result.net_estimate_cents=payout-knownProduction-frame.invoice_tax_cents+adsAdjustment-frame.ads.expense_cents;frame.result.net_margin_bps=Number(BigInt(frame.result.net_estimate_cents)*10000n/BigInt(sales));}
 const bindings={revision:frame.bindings_revision,bindings:references.filter(row=>row.unit_cost_cents!==null).map(({item_id,model_id})=>item_id==='503'?{item_id,model_id,selling_unit:'ONE_MALE_ONE_FEMALE_KIT',male_size:'P',female_size:'P'}:{item_id,model_id,selling_unit:'SINGLE_GARMENT',size:model_id==='2'?'G3':'P'})};
 const products=buildBusinessMonthProducts(sourceFrames,frame,references,bindings);assert.ok(products,'actual monthly product projector must conserve every synthetic paid source');assert.ok(projectBusinessMonthProducts(products,frame));
 const monthly=projectBusinessMonth({...frame,product_summary:products});assert.ok(monthly,'actual monthly contract must validate the synthetic order cohort');
 const auditScope={publication_revision:9,start_date:monthly.start_date,end_date:monthly.end_date,sources:sourceFrames.map(row=>({run_id:row.run_id,source_revision:row.revision,start_date:row.start_date,end_date:row.end_date}))};assert.ok(projectBusinessMonthAuditScope(auditScope));
 const captures=collected.envelopes.flatMap((row,index)=>captured==='none'||captured==='partial'&&index===1?[]:[{frame:row.report,variant_financials:row.variant_financials,capture_revision:8}]);
 const contributions=buildBusinessMonthVariantContributions(monthly,auditScope,sourceFrames,captures,{checked_at:monthly.checked_at});assert.ok(contributions,'actual monthly variant builder must bind its cached source windows');assert.ok(projectBusinessMonthVariantContributions(contributions,monthly,auditScope));
 return {frame:monthly,audit_scope:auditScope,source_frames:sourceFrames,captures,variant_contributions:contributions,provider_calls:collected.provider_calls};
}

export function variantOrderView(fixture,{contract='business-month-view-v5'}={}){
 const result=buildBusinessMonthView({active:fixture.frame,display:fixture.frame,display_source:'PUBLISHED',audit_scope:fixture.audit_scope,source_frames:fixture.source_frames,expense_schedule:null,variant_contributions:fixture.variant_contributions},{enabled:true,status:'COMPLETE',next_run_at:workspaceStamp+60,last_attempt_at:workspaceStamp-5},{now:()=>workspaceClock,contract});
 assert.ok(projectBusinessMonthView(result,projectBusinessMonth,projectBusinessMonthAuditScope,projectDailyBusinessSummary,projectExpenseSchedule,projectBusinessMonthVariantContributions),'the browser fixture must cross the actual negotiated view contract');return result;
}

export function variantOrderCatalog(){
 const names={'501':'Camiseta sintética com pedidos por variação','502':'Camiseta sintética somente em pedido misto','503':'Kit sintético duas camisetas','504':'Camiseta sintética negativa','505':'Camiseta sintética equilíbrio','506':'Camiseta sintética com devolução','507':'Camiseta sintética custo pendente','508':'Camiseta sintética pagamento pendente','509':'Camiseta sintética arredondamento'};
 return {schema:'catalog_classification_state_v1',revision:1,enabled:true,counts:{total:9,queued:0,running:0,matched:8,partial:0,review:1,retry_wait:0,due:0},products:Object.entries(names).map(([item_id,product_name])=>({item_id,product_name,status:item_id==='507'?'REVIEW':'MATCHED',reason:item_id==='507'?'OPTION_NOT_RECOGNIZED':null,checked_at:workspaceStamp-80,catalog_fingerprint:'c'.repeat(64),model_count:item_id==='501'?2:1,resolved_count:item_id==='507'?0:item_id==='501'?2:1,next_attempt_at:workspaceStamp+86400,failure_count:0,variants_complete:true,variants:(item_id==='501'?['1','2']:['1']).map(model_id=>({model_id,model_name:item_id==='503'?'Kit P + P':model_id==='2'?'Azul / G3':'Verde / P',reason:item_id==='507'?'OPTION_NOT_RECOGNIZED':null,attributes:[{name:'Cor',value:model_id==='2'?'Azul':'Verde'},{name:'Tamanho',value:item_id==='503'?'P + P':model_id==='2'?'G3':'P'}]}))})),limit:100,offset:0,more:false,next_due_at:workspaceStamp+86400};
}
